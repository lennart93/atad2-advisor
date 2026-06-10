#!/bin/bash
# Apply slice-4 BACKFILL: create client folders from existing sessions and
# point sessions/documents/log rows at them. Idempotent; folder list printed.
set -e
DB=$(docker ps --filter name=supabase-db -q | head -1)
if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
mkdir -p /tmp/client-folders
cat > /tmp/client-folders/20260610200200_client_folders_backfill.sql <<'MIGRATION_EOF'
-- Client folders backfill (slice 4, part B of 2; DATA ONLY, ships dark).
--
-- !!!! APPLY ONLY AFTER THE PRODUCT OWNER HAS APPROVED THE FOLDER LIST !!!!
-- ----------------------------------------------------------------------------
-- The preview (2026-06-10) showed 17 folders. Name variants under the same
-- user, e.g. "Kynexis B.V. " vs "Kynexis BV" and "Orchestra Only BV" vs
-- "Orchestra Only BV (Juist)", become SEPARATE folders BY DESIGN: variants
-- are never auto-merged. The normalization below (lower + trim) only folds
-- case and surrounding-whitespace differences ("Kynexis B.V. " and
-- "kynexis b.v." are one folder); punctuation/wording differences stay apart.
-- Merging folders is a deliberate manual action in a later slice, never a
-- migration side effect. The folder count may differ from 17 by apply time
-- if new sessions were created since the preview; eyeball the printed list.
-- ----------------------------------------------------------------------------
--
-- Part of the integral dossier platform design:
-- docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md and
-- REPLATFORM.md section 4 ("Eenmalige opschoonactie (backfill)").
-- Depends on 20260610200100_client_folders.sql (structure: atad2_clients,
-- the client_id columns, the log snapshot columns). A preflight block below
-- fails loudly if that migration has not been applied yet.
--
-- What this migration does (data only, no DDL):
--   1. Creates one client folder per distinct (user_id, lower(trim(
--      taxpayer_name))) found in atad2_sessions. client_name = the raw
--      spelling (trimmed) from the most recently created session of that
--      group, so the folder carries the spelling the advisor used last.
--      Only created where no matching client exists yet (matched on
--      user_id + lower(trim(client_name))), so a re-run creates nothing new
--      and manually created folders are reused, never duplicated.
--   2. Points every session without a client_id at its matching folder.
--   3. Points every session-scoped document without a client_id at its
--      session's folder (library uploads, session_id IS NULL, do not exist
--      yet at backfill time and are skipped by definition).
--   4. Stamps client_id / client_name onto existing atad2_assessment_log
--      rows via the session linkage. Log rows whose session was deleted
--      stay NULL on purpose: the folder did not exist at event time and the
--      log never fabricates history.
--   5. Prints the folder list (user, client_name, session count) as NOTICEs
--      for eyeballing, then RAISEs an EXCEPTION if any session is still
--      without client_id. Sessions with user_id IS NULL are the expected
--      trip-wire: a folder needs an owner (atad2_clients.user_id NOT NULL),
--      so assign those sessions a user first, then re-run this file.
--
-- Known harmless side effect: step 2 bumps atad2_sessions.updated_at (house
-- trigger) once, on the first run only (re-runs match zero rows).
-- atad2_session_documents has no updated_at column, so step 3 leaves no
-- timestamp trace at all. Neither feeds the M5 drift flag:
-- atad2_dossier_blocks deliberately excludes sessions.updated_at and uses
-- documents.created_at (see 20260610190500). The assessment log trigger
-- ignores the UPDATE too: it only writes on completion transitions, so the
-- backfill produces no log rows. The folder-ownership guard on sessions
-- (trg_atad2_sessions_client_owner, 20260610200100) passes by construction:
-- step 2 only links sessions to folders of the same user.
--
-- Run as supabase_admin (table owner) on the VM:
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -1 -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260610200200_client_folders_backfill.sql
--
-- SAFE TO RE-RUN: every UPDATE is keyed on "IS NULL" columns and the INSERT
-- is guarded by NOT EXISTS, so a second run changes nothing. With -1 the
-- whole file is one transaction: the final orphan check rolls everything
-- back if any session would be left behind, so a failed run leaves the
-- database exactly as it was. If the PIM window expires mid-run, just run
-- the whole file again.

------------------------------------------------------------------------------
-- 0. Preflight: the structure migration (20260610200100) must be in place.
------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.atad2_clients') IS NULL THEN
    RAISE EXCEPTION 'atad2_clients does not exist. Apply 20260610200100_client_folders.sql first, then re-run this file.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'atad2_sessions'
      AND column_name  = 'client_id'
  ) THEN
    RAISE EXCEPTION 'atad2_sessions.client_id does not exist. Apply 20260610200100_client_folders.sql first, then re-run this file.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'atad2_session_documents'
      AND column_name  = 'client_id'
  ) THEN
    RAISE EXCEPTION 'atad2_session_documents.client_id does not exist. Apply 20260610200100_client_folders.sql first, then re-run this file.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'atad2_assessment_log'
      AND column_name  = 'client_name'
  ) THEN
    RAISE EXCEPTION 'atad2_assessment_log.client_id/client_name do not exist. Apply 20260610200100_client_folders.sql first, then re-run this file.';
  END IF;
END $$;

------------------------------------------------------------------------------
-- 1. One folder per distinct (user_id, normalized taxpayer_name).
--    client_name = the trimmed raw spelling from the group's most recently
--    created session (created_at DESC, id DESC as a deterministic tiebreak).
--    The NOT EXISTS match uses the SAME normalization as the session linkage
--    in step 2; keep them in lockstep or step 5's orphan check will fire.
--    Archived folders count as existing on purpose: an archived client still
--    owns its history, and resurrecting a duplicate next to it would split
--    that history in two.
------------------------------------------------------------------------------

INSERT INTO public.atad2_clients (user_id, client_name)
SELECT g.user_id, g.client_name
FROM (
  SELECT DISTINCT ON (s.user_id, lower(trim(s.taxpayer_name)))
         s.user_id,
         trim(s.taxpayer_name) AS client_name
  FROM public.atad2_sessions s
  -- Sessions without an owner cannot be foldered (atad2_clients.user_id is
  -- NOT NULL); they surface in the orphan check below instead of silently
  -- producing an ownerless folder.
  WHERE s.user_id IS NOT NULL
  ORDER BY s.user_id, lower(trim(s.taxpayer_name)), s.created_at DESC, s.id DESC
) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.atad2_clients c
  WHERE c.user_id = g.user_id
    AND lower(trim(c.client_name)) = lower(trim(g.client_name))
);

------------------------------------------------------------------------------
-- 2. Link every unlinked session to its folder.
--    DISTINCT ON guards against a pathological pre-existing duplicate
--    (two manually created folders whose names normalize identically for
--    the same user): the oldest folder wins, deterministically, instead of
--    the UPDATE failing on a multi-row match.
------------------------------------------------------------------------------

UPDATE public.atad2_sessions s
SET client_id = c.id
FROM (
  SELECT DISTINCT ON (cl.user_id, lower(trim(cl.client_name)))
         cl.id,
         cl.user_id,
         lower(trim(cl.client_name)) AS norm_name
  FROM public.atad2_clients cl
  ORDER BY cl.user_id, lower(trim(cl.client_name)), cl.created_at ASC, cl.id ASC
) c
WHERE s.client_id IS NULL
  AND s.user_id = c.user_id
  AND lower(trim(s.taxpayer_name)) = c.norm_name;

------------------------------------------------------------------------------
-- 3. Documents inherit the folder of their session.
--    Only session-scoped rows: at backfill time every document has a
--    session_id (the library upload path ships in a later slice).
------------------------------------------------------------------------------

UPDATE public.atad2_session_documents d
SET client_id = s.client_id
FROM public.atad2_sessions s
WHERE d.client_id IS NULL
  AND d.session_id IS NOT NULL
  AND s.session_id = d.session_id
  AND s.client_id IS NOT NULL;

------------------------------------------------------------------------------
-- 4. Stamp the folder onto existing log rows via the session linkage.
--    Matched on session_uuid (the stable per-row PK snapshot): session_id
--    text could in theory be reused after a delete + recreate, session_uuid
--    cannot. Log rows of deleted sessions keep NULL by design (see header).
------------------------------------------------------------------------------

UPDATE public.atad2_assessment_log l
SET client_id   = s.client_id,
    client_name = c.client_name
FROM public.atad2_sessions s
JOIN public.atad2_clients  c ON c.id = s.client_id
WHERE l.client_id IS NULL
  AND l.session_uuid = s.id;

------------------------------------------------------------------------------
-- 5. Verification: print the folder list, then fail loudly on orphans.
--    The list prints BEFORE the orphan check so that a failed run still
--    shows what the backfill would have produced (NOTICEs survive the
--    rollback; with -1 a raised exception undoes all data changes above).
------------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  v_folders int;
BEGIN
  SELECT count(*) INTO v_folders FROM public.atad2_clients;

  RAISE NOTICE '=== Client folder list after backfill (% folder(s); preview of 2026-06-10 expected 17) ===', v_folders;

  FOR r IN
    SELECT c.user_id,
           COALESCE(p.email, '(no profile email)') AS user_email,
           c.client_name,
           count(s.id) AS session_count
    FROM public.atad2_clients c
    LEFT JOIN public.profiles p       ON p.user_id   = c.user_id
    LEFT JOIN public.atad2_sessions s ON s.client_id = c.id
    GROUP BY c.id, c.user_id, p.email, c.client_name
    ORDER BY COALESCE(p.email, c.user_id::text), lower(c.client_name)
  LOOP
    RAISE NOTICE '  % | % | "%": % session(s)',
      r.user_id, r.user_email, r.client_name, r.session_count;
  END LOOP;

  RAISE NOTICE '=== End of folder list ===';

  -- Soft warning, not an error: a folder whose name trims to empty would be
  -- invisible in the UI. The intake form requires a taxpayer name, so this
  -- should never fire; if it does, rename the folder before slice 9 ships.
  IF EXISTS (
    SELECT 1 FROM public.atad2_clients WHERE trim(client_name) = ''
  ) THEN
    RAISE NOTICE 'WARNING: at least one folder has an empty client_name after trimming. Review the list above.';
  END IF;
END $$;

DO $$
DECLARE
  v_orphans  int;
  v_no_owner int;
  v_sample   text;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE user_id IS NULL)
  INTO v_orphans, v_no_owner
  FROM public.atad2_sessions
  WHERE client_id IS NULL;

  IF v_orphans > 0 THEN
    SELECT string_agg(t.session_id, ', ')
    INTO v_sample
    FROM (
      SELECT session_id
      FROM public.atad2_sessions
      WHERE client_id IS NULL
      ORDER BY created_at
      LIMIT 10
    ) t;

    RAISE EXCEPTION
      'Backfill left % session(s) without client_id (% of them have user_id IS NULL; a folder needs an owner). First affected session_id(s): %. Fix session ownership, then re-run this whole file. Run with psql -1 so this exception rolled everything back.',
      v_orphans, v_no_owner, v_sample;
  END IF;

  RAISE NOTICE 'Backfill verified: every session has a client_id.';
END $$;

------------------------------------------------------------------------------
-- Verification (run manually after applying; read-only):
--
--   SELECT count(*) FROM public.atad2_sessions WHERE client_id IS NULL;  -- 0
--   SELECT count(*) FROM public.atad2_session_documents
--   WHERE client_id IS NULL AND session_id IS NOT NULL;                  -- 0
--
--   -- Log rows without a folder must all belong to deleted sessions:
--   SELECT count(*) FROM public.atad2_assessment_log l
--   WHERE l.client_id IS NULL
--     AND EXISTS (SELECT 1 FROM public.atad2_sessions s
--                 WHERE s.id = l.session_uuid);                          -- 0
--
--   -- Re-run proof: applying this file a second time must end in
--   -- "Backfill verified" with zero INSERT/UPDATE row counts.
------------------------------------------------------------------------------
MIGRATION_EOF
echo "=== md5sum on VM (compare against workstation) ==="
md5sum /tmp/client-folders/20260610200200_client_folders_backfill.sql
echo "=== APPLYING 20260610200200_client_folders_backfill.sql (single transaction) ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -1 -v ON_ERROR_STOP=1 < /tmp/client-folders/20260610200200_client_folders_backfill.sql
echo "=== DONE: client folders backfill applied ==="
