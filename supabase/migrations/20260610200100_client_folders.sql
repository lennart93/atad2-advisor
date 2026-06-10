-- Client folders, slice 4 of the replatform (shipped DARK - no user-visible
-- change; a nullable pointer column and a new, empty feature table).
--
-- Design: REPLATFORM.md section 4 ("Het datamodel") and
-- docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md
-- (section 8, slice 4). One folder row per company an advisor serves;
-- sessions and documents gain a NULLABLE client_id pointer.
--
-- What this migration does:
--   1. New table atad2_clients (the folder): owner-scoped CRUD RLS + staff
--      SELECT via has_admin_access (mirrors the 20260422 session pattern),
--      soft archive (archived_at / archived_by, the house pattern), house
--      updated_at trigger. Deliberately NO commercial fields: revenue stays
--      on atad2_sessions (owner decision, REPLATFORM.md section 4). Name
--      variants ("Kynexis B.V." vs "Kynexis BV") are deliberately separate
--      folders, so there is NO unique constraint on (user_id, client_name):
--      merging folders is always a human decision, never a constraint.
--   2. atad2_sessions.client_id uuid NULLABLE -> atad2_clients(id).
--      NOT NULL comes much later, after the client workspace UI ships
--      (slice 9); until then sessions without a folder stay legal. A small
--      BEFORE trigger guarantees a session can only be filed in a folder of
--      its own user (the RLS policies on sessions check user_id only, so
--      without it a raw PostgREST call could file a session in someone
--      else's folder).
--   3. atad2_session_documents.client_id uuid NULLABLE -> atad2_clients(id);
--      session_id becomes NULLABLE (library uploads have no session); a CHECK
--      guarantees at least one of session_id / client_id is set. New ADDITIVE
--      RLS policies cover client-scoped documents (session_id IS NULL,
--      client_id set); the existing session-scoped policies from
--      20260423100000 are not touched.
--   4. atad2_assessment_log gains client_id + client_name snapshot columns
--      (NO FK on purpose: the log must survive client deletion, the same
--      reasoning as the missing session FK there), and the trigger function
--      log_atad2_session_event() now stamps them on every session event.
--   5. Storage: three ADDITIVE policies on the session-documents bucket for
--      the client-library path shape {user_id}/clients/{client_id}/... .
--      The existing session-path policies (created in 20260423100100,
--      replaced in 20260602100100) stay exactly as they are; the literal
--      'clients' second segment can never collide with an owned session_id.
--   6. NOTIFY pgrst at the end, so PostgREST picks up the new table and
--      columns without a container restart (house pattern, 20260610190500).
--
-- The DATA backfill (one folder per distinct (user_id, taxpayer_name) and
-- pointing existing sessions / documents / log rows at it) lives in the
-- separate migration 20260610200200_client_folders_backfill.sql.
-- APPLY THE BACKFILL ONLY AFTER THE OWNER HAS APPROVED THE FOLDER LIST;
-- this file is structure-only and safe to apply on its own.
--
-- Numbering note: slice 3 (dossier foundation M1-M5) occupies
-- 20260610190100..190500 and is already applied on the VM; this file and its
-- backfill companion use 200100 / 200200 and collide with nothing there.
--
-- Run as supabase_admin (table owner) on the VM:
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -1 -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260610200100_client_folders.sql
--
-- SAFE TO RE-RUN: every statement is guarded (IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE), and there is no data write in this file at all. If the
-- PIM window expires mid-run, just run the whole file again.

------------------------------------------------------------------------------
-- 1. atad2_clients: the folder
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.atad2_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The owning advisor. ON DELETE CASCADE matches the house style for
  -- OWNER columns (atad2_sessions.user_id, profiles, user_roles): deleting
  -- an auth user takes their folders down with their sessions in the same
  -- statement, so the sessions.client_id FK stays satisfied. Once library
  -- uploads exist (session_id NULL), those rows have no cascade path and
  -- will block the user delete; that is the protective behavior we want.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_code text,
  jurisdiction text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Soft archive, the house pattern (atad2_reports, spec principle 5):
  -- folders are archived, never silently deleted, so history stays readable.
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.atad2_clients IS
  'Client folder (replatform slice 4): one row per company an advisor serves. Owner-scoped like atad2_sessions; sessions and documents point at it via client_id. No commercial fields by design (revenue stays on the session). Name variants are separate folders on purpose; merging is a human decision.';
COMMENT ON COLUMN public.atad2_clients.client_name IS
  'Display name of the client folder. Sessions keep their own taxpayer_name snapshot, so renaming a folder never rewrites assessment history.';
COMMENT ON COLUMN public.atad2_clients.archived_at IS
  'Soft archive timestamp. NULL = active folder. Archiving hides a folder from day-to-day lists without losing history.';
COMMENT ON COLUMN public.atad2_clients.archived_by IS
  'auth.users id of whoever archived the folder. Travels with archived_at.';

-- House updated_at trigger (helper from 20250803164501, same pattern as
-- atad2_sessions and, since slice 3, atad2_answers).
DROP TRIGGER IF EXISTS trg_atad2_clients_updated_at ON public.atad2_clients;
CREATE TRIGGER trg_atad2_clients_updated_at
  BEFORE UPDATE ON public.atad2_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_atad2_clients_user_id
  ON public.atad2_clients(user_id);

ALTER TABLE public.atad2_clients ENABLE ROW LEVEL SECURITY;

-- Owner-scoped CRUD, mirroring the atad2_sessions policies (20260327120000).
DROP POLICY IF EXISTS "Users can view their own clients" ON public.atad2_clients;
CREATE POLICY "Users can view their own clients"
  ON public.atad2_clients FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own clients" ON public.atad2_clients;
CREATE POLICY "Users can create their own clients"
  ON public.atad2_clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No separate WITH CHECK: Postgres then re-applies USING to the new row,
-- so a folder can never be reassigned to another user.
DROP POLICY IF EXISTS "Users can update their own clients" ON public.atad2_clients;
CREATE POLICY "Users can update their own clients"
  ON public.atad2_clients FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE stays available for empty folders (e.g. created by mistake). The
-- NO ACTION foreign keys below make deleting a folder that still has
-- sessions or documents fail; archiving is the path for folders with history.
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.atad2_clients;
CREATE POLICY "Users can delete their own clients"
  ON public.atad2_clients FOR DELETE
  USING (auth.uid() = user_id);

-- Staff read, mirroring "Staff can view all sessions" (20260422).
DROP POLICY IF EXISTS "Staff can view all clients" ON public.atad2_clients;
CREATE POLICY "Staff can view all clients"
  ON public.atad2_clients FOR SELECT
  TO authenticated
  USING (
    public.has_admin_access(auth.uid())
    OR user_id = auth.uid()
  );

------------------------------------------------------------------------------
-- 2. atad2_sessions: nullable folder pointer
------------------------------------------------------------------------------

-- Default NO ACTION: a folder with sessions cannot be hard-deleted, which is
-- exactly the protection we want (archive instead). ON DELETE SET NULL would
-- silently un-file assessments; CASCADE would destroy them.
ALTER TABLE public.atad2_sessions
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.atad2_clients(id);

COMMENT ON COLUMN public.atad2_sessions.client_id IS
  'Folder this assessment lives in (atad2_clients). NULLABLE during the transition; filled by the 20260610200200 backfill and by the ?clientId= intake rider. Becomes NOT NULL only after the client workspace UI ships (slice 9).';

CREATE INDEX IF NOT EXISTS idx_atad2_sessions_client_id
  ON public.atad2_sessions(client_id);

-- Folder-ownership guard. The session RLS policies only check user_id, and
-- the FK above only requires the folder row to exist, so without this guard
-- an authenticated user could file their own session in ANOTHER user's
-- folder via a raw PostgREST call. The document and storage policies below
-- all carry an owned-folder EXISTS; this trigger gives sessions the same
-- guarantee. SECURITY DEFINER like log_atad2_session_event, so the lookup
-- sees the folder row regardless of who fires the trigger. No-op for every
-- write that leaves client_id NULL, so today's flows are untouched.
CREATE OR REPLACE FUNCTION public.enforce_atad2_session_client_owner()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_folder_owner uuid;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_folder_owner
    FROM public.atad2_clients
    WHERE id = NEW.client_id;

  -- The FK guarantees the folder exists and its user_id is NOT NULL. A
  -- session without an owner (user_id IS NULL) cannot be filed either:
  -- IS DISTINCT FROM treats NULL as a mismatch, which is intended (assign
  -- the session a user first, exactly like the backfill demands).
  IF v_folder_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Session % cannot be filed in client folder %: the folder belongs to a different user.',
      NEW.session_id, NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atad2_sessions_client_owner ON public.atad2_sessions;
CREATE TRIGGER trg_atad2_sessions_client_owner
  BEFORE INSERT OR UPDATE OF client_id, user_id ON public.atad2_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_atad2_session_client_owner();

------------------------------------------------------------------------------
-- 3. atad2_session_documents: client library support
------------------------------------------------------------------------------

ALTER TABLE public.atad2_session_documents
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.atad2_clients(id);

COMMENT ON COLUMN public.atad2_session_documents.client_id IS
  'Folder this document belongs to. Session uploads get it copied from their session (backfill + future upload path); library uploads have client_id set and session_id NULL.';

-- Library uploads have no session. Dropping NOT NULL is a no-op on re-run.
ALTER TABLE public.atad2_session_documents
  ALTER COLUMN session_id DROP NOT NULL;

-- An orphan document (neither session nor client) can never exist. Existing
-- rows all carry a session_id, so validation of this CHECK always passes.
ALTER TABLE public.atad2_session_documents
  DROP CONSTRAINT IF EXISTS atad2_session_documents_session_or_client_check;
ALTER TABLE public.atad2_session_documents
  ADD CONSTRAINT atad2_session_documents_session_or_client_check
  CHECK (session_id IS NOT NULL OR client_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_session_documents_client
  ON public.atad2_session_documents(client_id);

-- ADDITIVE policies for client-scoped documents (session_id IS NULL,
-- client_id set): visible / insertable / deletable by the folder owner.
-- The four session-scoped policies from 20260423100000 stay untouched and
-- keep governing every row that has a session_id. There is deliberately NO
-- user UPDATE policy for library documents yet: the only status writer today
-- is the summarize edge function (service role, bypasses RLS); a user-facing
-- update path arrives with the workspace UI slice if it needs one.
--
-- Known, ACCEPTED gap while this slice is dark: the session-scoped policies
-- do not constrain client_id, so a session owner could stamp a foreign
-- client_id onto their own session-scoped document rows via raw PostgREST.
-- No read exposure follows (the foreign owner's policies all require
-- session_id IS NULL), and no app code writes client_id on documents yet.
-- Tighten this when the upload path starts writing client_id: extend the
-- session-scoped WITH CHECK with an owned-folder EXISTS, or enforce
-- session.client_id consistency in a trigger like the sessions guard above.
DROP POLICY IF EXISTS "Users can view their client documents" ON public.atad2_session_documents;
CREATE POLICY "Users can view their client documents"
  ON public.atad2_session_documents FOR SELECT
  USING (
    session_id IS NULL
    AND client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id = atad2_session_documents.client_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their client documents" ON public.atad2_session_documents;
CREATE POLICY "Users can insert their client documents"
  ON public.atad2_session_documents FOR INSERT
  WITH CHECK (
    session_id IS NULL
    AND client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id = atad2_session_documents.client_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their client documents" ON public.atad2_session_documents;
CREATE POLICY "Users can delete their client documents"
  ON public.atad2_session_documents FOR DELETE
  USING (
    session_id IS NULL
    AND client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id = atad2_session_documents.client_id
        AND c.user_id = auth.uid()
    )
  );

------------------------------------------------------------------------------
-- 4. atad2_assessment_log: client snapshot columns + trigger extension
------------------------------------------------------------------------------

-- Snapshot columns, NO FK on purpose: the log must survive client deletion,
-- exactly like it survives session deletion (20260601240000).
ALTER TABLE public.atad2_assessment_log
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS client_name text;

COMMENT ON COLUMN public.atad2_assessment_log.client_id IS
  'Snapshot of atad2_sessions.client_id at event time. No FK: the log outlives folders. NULL for events from before slice 4 or for sessions not yet filed in a folder.';
COMMENT ON COLUMN public.atad2_assessment_log.client_name IS
  'Snapshot of the folder name at event time, so staff can filter by client even after a rename or deletion.';

-- Extends log_atad2_session_event() from 20260601240000 (still the only
-- definition of this function; M4 of slice 3 only widened the event_type
-- CHECK). Identical body, plus: look up the folder name for v_row.client_id
-- and stamp client_id / client_name into the log row. Events for sessions
-- without a folder keep NULLs, exactly like the user lookup behaves.
CREATE OR REPLACE FUNCTION public.log_atad2_session_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email text;
  v_full_name text;
  v_user_id uuid;
  v_client_name text;
  v_row public.atad2_sessions%ROWTYPE;
  v_event text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_event := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW;
    v_event := 'created';
  ELSE
    v_row := NEW;
    IF (COALESCE(OLD.completed, false) = false AND COALESCE(NEW.completed, false) = true)
       OR (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
       OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed') THEN
      v_event := 'completed';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  v_user_id := v_row.user_id;

  IF v_user_id IS NOT NULL THEN
    SELECT email, full_name INTO v_email, v_full_name
      FROM public.profiles WHERE user_id = v_user_id;
    IF v_email IS NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    END IF;
  END IF;

  IF v_row.client_id IS NOT NULL THEN
    SELECT client_name INTO v_client_name
      FROM public.atad2_clients WHERE id = v_row.client_id;
  END IF;

  INSERT INTO public.atad2_assessment_log (
    session_uuid, session_id, user_id, user_email, user_full_name,
    taxpayer_name, entity_name, fiscal_year, status, final_score,
    preliminary_outcome, outcome_confirmed,
    session_created_at, session_updated_at, confirmed_at,
    client_id, client_name,
    event_type
  ) VALUES (
    v_row.id, v_row.session_id, v_user_id, v_email, v_full_name,
    v_row.taxpayer_name, v_row.entity_name, v_row.fiscal_year, v_row.status, v_row.final_score,
    v_row.preliminary_outcome, v_row.outcome_confirmed,
    v_row.created_at, v_row.updated_at, v_row.confirmed_at,
    v_row.client_id, v_client_name,
    v_event
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

------------------------------------------------------------------------------
-- 5. Storage: client-library path on the session-documents bucket
------------------------------------------------------------------------------

-- Path layout for the library: {user_id}/clients/{client_id}/{doc_uuid}.{ext}
-- (first segment the caller's auth.uid(), second the LITERAL 'clients', third
-- a folder the caller owns in atad2_clients). The existing session-path
-- policies (20260602100100) validate segment 2 as an owned session_id and are
-- left exactly as they are; permissive policies OR together, so these three
-- only ADD the library shape. Segment 3 is compared as text against c.id::text
-- so a malformed path can never throw a uuid cast error, it just denies.
DROP POLICY IF EXISTS "Users can read their own client library documents" ON storage.objects;
CREATE POLICY "Users can read their own client library documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = 'clients'
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id::text = (storage.foldername(name))[3]
        AND c.user_id  = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can upload their own client library documents" ON storage.objects;
CREATE POLICY "Users can upload their own client library documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = 'clients'
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id::text = (storage.foldername(name))[3]
        AND c.user_id  = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own client library documents" ON storage.objects;
CREATE POLICY "Users can delete their own client library documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = 'clients'
    AND EXISTS (
      SELECT 1 FROM public.atad2_clients c
      WHERE c.id::text = (storage.foldername(name))[3]
        AND c.user_id  = auth.uid()
    )
  );

------------------------------------------------------------------------------
-- 6. Verification: fail loudly if anything above did not land
------------------------------------------------------------------------------

DO $$
DECLARE
  v_count int;
BEGIN
  -- 6a. The folder table exists and has RLS enabled.
  IF to_regclass('public.atad2_clients') IS NULL THEN
    RAISE EXCEPTION 'slice 4 verification: table atad2_clients is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.atad2_clients'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'slice 4 verification: RLS is NOT enabled on atad2_clients';
  END IF;

  -- 6b. Exactly the five expected policies on atad2_clients.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_clients'
    AND policyname IN (
      'Users can view their own clients',
      'Users can create their own clients',
      'Users can update their own clients',
      'Users can delete their own clients',
      'Staff can view all clients'
    );
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'slice 4 verification: expected 5 policies on atad2_clients, found %', v_count;
  END IF;

  -- 6c. The house updated_at trigger is attached.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.atad2_clients'::regclass
      AND tgname = 'trg_atad2_clients_updated_at'
  ) THEN
    RAISE EXCEPTION 'slice 4 verification: trigger trg_atad2_clients_updated_at is missing on atad2_clients';
  END IF;

  -- 6d. Pointer columns landed everywhere.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'atad2_sessions'           AND column_name = 'client_id') OR
      (table_name = 'atad2_session_documents'  AND column_name = 'client_id') OR
      (table_name = 'atad2_assessment_log'     AND column_name IN ('client_id', 'client_name'))
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'slice 4 verification: expected 4 new client columns across sessions/documents/log, found %', v_count;
  END IF;

  -- 6e. Both pointer FKs reference atad2_clients (catches a half-applied
  --     state where a column existed before this run and the inline
  --     REFERENCES clause was skipped by the IF NOT EXISTS guard).
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.atad2_clients'::regclass
    AND conrelid IN (
      'public.atad2_sessions'::regclass,
      'public.atad2_session_documents'::regclass
    );
  IF v_count < 2 THEN
    RAISE EXCEPTION 'slice 4 verification: expected 2 foreign keys to atad2_clients (sessions + documents), found %', v_count;
  END IF;

  -- 6f. session_id is nullable and the orphan guard is in place.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atad2_session_documents'
      AND column_name = 'session_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'slice 4 verification: atad2_session_documents.session_id is still NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atad2_session_documents'::regclass
      AND contype = 'c'
      AND conname = 'atad2_session_documents_session_or_client_check'
  ) THEN
    RAISE EXCEPTION 'slice 4 verification: CHECK atad2_session_documents_session_or_client_check is missing';
  END IF;

  -- 6g. The three client-document policies exist AND the four session-scoped
  --     ones from 20260423100000 survived untouched.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_session_documents'
    AND policyname IN (
      'Users can view their client documents',
      'Users can insert their client documents',
      'Users can delete their client documents'
    );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'slice 4 verification: expected 3 client-document policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_session_documents'
    AND policyname IN (
      'Users can view their session documents',
      'Users can insert their session documents',
      'Users can update their session documents',
      'Users can delete their session documents'
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'slice 4 verification: the 4 session-scoped document policies must stay untouched, found %', v_count;
  END IF;

  -- 6h. The log trigger function now stamps the client snapshot.
  IF to_regprocedure('public.log_atad2_session_event()') IS NULL THEN
    RAISE EXCEPTION 'slice 4 verification: function log_atad2_session_event() is missing';
  END IF;
  IF pg_get_functiondef(to_regprocedure('public.log_atad2_session_event()')) NOT LIKE '%v_client_name%' THEN
    RAISE EXCEPTION 'slice 4 verification: log_atad2_session_event() does not stamp client_id/client_name';
  END IF;

  -- 6i. Storage: the 3 new library policies exist AND the 3 existing
  --     session-path policies survived untouched.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'Users can read their own client library documents',
      'Users can upload their own client library documents',
      'Users can delete their own client library documents'
    );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'slice 4 verification: expected 3 client-library storage policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'Users can read their own session documents',
      'Users can upload their own session documents',
      'Users can delete their own session documents'
    );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'slice 4 verification: the 3 session-path storage policies must stay untouched, found %', v_count;
  END IF;

  -- 6j. Indexes.
  IF to_regclass('public.idx_atad2_clients_user_id') IS NULL
     OR to_regclass('public.idx_atad2_sessions_client_id') IS NULL
     OR to_regclass('public.idx_session_documents_client') IS NULL THEN
    RAISE EXCEPTION 'slice 4 verification: one of the client_id indexes is missing';
  END IF;

  -- 6k. The folder-ownership guard on sessions is in place.
  IF to_regprocedure('public.enforce_atad2_session_client_owner()') IS NULL THEN
    RAISE EXCEPTION 'slice 4 verification: function enforce_atad2_session_client_owner() is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.atad2_sessions'::regclass
      AND tgname = 'trg_atad2_sessions_client_owner'
  ) THEN
    RAISE EXCEPTION 'slice 4 verification: trigger trg_atad2_sessions_client_owner is missing on atad2_sessions';
  END IF;

  RAISE NOTICE 'slice 4 structure verification passed: atad2_clients + RLS, nullable client_id on sessions/documents (with folder-ownership guard), session_id nullable + orphan CHECK, log snapshot columns + trigger stamp, client-library storage policies, indexes.';
END $$;

-- Let PostgREST pick up the new table and columns without a container
-- restart (house pattern, see 20260610190500). Without this, the frontend's
-- atad2_clients lookup fails on a stale schema cache until the next restart.
-- With psql -1 the NOTIFY fires at commit; harmless on re-run.
NOTIFY pgrst, 'reload schema';
