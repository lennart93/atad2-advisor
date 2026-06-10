#!/bin/bash
# Dossier foundation slice 3: apply migrations M1-M5 on the self-hosted Supabase VM.
# Inlines all SQL (no git pull needed on the VM). Run from the workstation via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @scripts/deploy-dossier-foundation.sh \
#     --query "value[0].message" -o tsv
# IDEMPOTENT: every migration is guarded; if the PIM window expires mid-run,
# re-activate PIM and run this exact script again.
set -e
DB=$(docker ps --filter name=supabase-db -q | head -1)
if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
mkdir -p /tmp/dossier-foundation
cat > /tmp/dossier-foundation/20260610190100_answer_resolution_and_events.sql <<'MIGRATION_EOF'
-- Dossier foundation M1 (slice 3, shipped DARK - no user-visible change).
--
-- Part of the integral dossier platform design:
-- docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md (section 2).
-- Later slices build on this: M3 (open-questions register) syncs off the
-- sign-off columns, M5 (atad2_dossier_blocks view + final_report_gate) counts
-- "Unknown answers without confirmation" as a final-memo blocker.
--
-- What this migration does:
--   1. atad2_answers gains the "confirmed unknown" sign-off columns
--      (unknown_confirmed_at / unknown_confirmed_by / unknown_confirmed_note)
--      and a standard updated_at (house auto-update trigger).
--      Existing Unknown answers are deliberately NOT backfilled as confirmed:
--      a sign-off only exists because an advisor put their name on it (spec s2).
--   2. A BEFORE UPDATE trigger clears the sign-off whenever the answer VALUE
--      changes: a stale sign-off never survives an answer edit.
--      Explanation-only edits keep the sign-off.
--   3. New append-only table atad2_answer_events: every INSERT/UPDATE on
--      atad2_answers writes one event row in the same transaction, via a
--      SECURITY DEFINER trigger (the same mechanism as atad2_assessment_log).
--      This gives the questionnaire the same audit trail the technical
--      appendix already has via atad2_appendix_edits. Session owner + staff
--      can read; nobody can write directly (no INSERT policy + privileges
--      revoked; the trigger function is the only writer, service_role aside).
--      Answer DELETEs are deliberately NOT logged: the only delete path is
--      the question-flow backtrack in src/pages/Assessment.tsx (later answers
--      are removed when the advisor changes an earlier one); the re-walk
--      re-INSERTs those answers and produces fresh events, and session
--      deletion is recorded at session level in atad2_assessment_log.
--   4. atad2_structure_charts gains finalized_by: the one sign-off that had
--      no actor. The frontend finalize path starts filling it (ride-along
--      edit in src/lib/structure/client.ts). Rows finalized before this
--      migration stay NULL: the actor was never recorded, so backfilling
--      would fabricate audit data.
--
-- Run as supabase_admin (table owner) on the VM:
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260610190100_answer_resolution_and_events.sql
--
-- SAFE TO RE-RUN: every statement is guarded (IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE), and the one data backfill lives inside the column-add
-- guard so a second run can never reset real edit timestamps. If the PIM
-- window expires mid-run, just run the whole file again.

------------------------------------------------------------------------------
-- 1. atad2_answers: sign-off columns + updated_at
------------------------------------------------------------------------------

ALTER TABLE public.atad2_answers
  ADD COLUMN IF NOT EXISTS unknown_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS unknown_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unknown_confirmed_note text;

COMMENT ON COLUMN public.atad2_answers.unknown_confirmed_at IS
  'When the advisor explicitly signed off this Unknown answer as "confirmed unknown". NULL = unconfirmed. Cleared automatically when the answer value changes (trg_atad2_answers_clear_stale_confirmation).';
COMMENT ON COLUMN public.atad2_answers.unknown_confirmed_by IS
  'auth.users id of the advisor who confirmed the Unknown. Travels with unknown_confirmed_at.';
COMMENT ON COLUMN public.atad2_answers.unknown_confirmed_note IS
  'Mandatory short reason the advisor gave when confirming the Unknown (the confirm dialog enforces it; the column itself stays nullable because unconfirmed rows have no note).';

-- A sign-off can only exist on an Unknown answer. Defense in depth: no current
-- write path sets these columns yet (they are brand-new). The BEFORE UPDATE
-- trigger below clears the sign-off whenever the answer value changes to
-- anything that is not a freshly-confirmed Unknown, so this constraint can
-- never reject a legitimate answer-value change. The only writes it rejects
-- are genuinely invalid ones: attaching a sign-off to a Yes/No answer without
-- changing the value.
ALTER TABLE public.atad2_answers
  DROP CONSTRAINT IF EXISTS atad2_answers_unknown_confirmed_only_on_unknown;
ALTER TABLE public.atad2_answers
  ADD CONSTRAINT atad2_answers_unknown_confirmed_only_on_unknown
  CHECK (unknown_confirmed_at IS NULL OR answer = 'Unknown');

-- updated_at, added inside a guard so the backfill runs exactly once.
-- Backfill = answered_at (NOT NULL), the honest "last touched" moment for
-- historical rows. A bare DEFAULT now() would stamp every existing answer
-- with the migration time, which would later make the M5 drift flag
-- (inputs_changed_after_final) see every delivered dossier as changed.
-- NOTE: this DO block must run BEFORE the triggers below are created; on the
-- first run none of them exist yet, and on any re-run the block is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'atad2_answers'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE public.atad2_answers
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    UPDATE public.atad2_answers SET updated_at = answered_at;
  END IF;
END $$;

COMMENT ON COLUMN public.atad2_answers.updated_at IS
  'Auto-maintained by trg_atad2_answers_updated_at (house update_updated_at_column helper). Backfilled once from answered_at when the column was introduced.';

------------------------------------------------------------------------------
-- 2. Triggers on atad2_answers
--    BEFORE UPDATE triggers fire in name order:
--      trg_atad2_answers_clear_stale_confirmation, then
--      trg_atad2_answers_updated_at
--    (independent columns, so the order is irrelevant; documented for sanity).
--    The audit trigger is AFTER, so it logs the final stored values.
------------------------------------------------------------------------------

-- 2a. Standard updated_at (reuses the existing house helper from 20250807185428).
DROP TRIGGER IF EXISTS trg_atad2_answers_updated_at ON public.atad2_answers;
CREATE TRIGGER trg_atad2_answers_updated_at
  BEFORE UPDATE ON public.atad2_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2b. Clear a stale sign-off when the answer VALUE changes.
--     Explanation-only edits keep the sign-off (spec s2: the confirmation
--     dies "zodra de antwoordwaarde wijzigt").
CREATE OR REPLACE FUNCTION public.clear_stale_unknown_confirmation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- A sign-off belongs to the answer value the advisor saw when signing.
  -- If the value changes, the old sign-off dies with it. One carve-out:
  -- when this same UPDATE explicitly writes a fresh confirmation timestamp
  -- AND the row stays Unknown (value + sign-off in a single statement,
  -- e.g. a future confirm dialog), the new sign-off is honoured.
  -- A fresh sign-off arriving together with a change to Yes/No is cleared
  -- as well: a non-Unknown answer can never carry a confirmation, so this
  -- ordering guarantees the CHECK constraint above never rejects an
  -- answer-value change. A frontend that blindly re-sends the OLD
  -- confirmation alongside a changed answer is also cleared, which is
  -- exactly the stale case this trigger exists for.
  IF OLD.answer IS DISTINCT FROM NEW.answer
     AND (NEW.unknown_confirmed_at IS NOT DISTINCT FROM OLD.unknown_confirmed_at
          OR NEW.answer <> 'Unknown') THEN
    NEW.unknown_confirmed_at   := NULL;
    NEW.unknown_confirmed_by   := NULL;
    NEW.unknown_confirmed_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atad2_answers_clear_stale_confirmation ON public.atad2_answers;
CREATE TRIGGER trg_atad2_answers_clear_stale_confirmation
  BEFORE UPDATE ON public.atad2_answers
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_unknown_confirmation();

------------------------------------------------------------------------------
-- 3. Append-only audit trail: atad2_answer_events
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.atad2_answer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK with cascade, like every other session child table: the events follow
  -- the session lifecycle. The permanent who-did-what record that must
  -- survive session deletion already lives in atad2_assessment_log
  -- (deliberately NOT FK-linked there).
  session_id text NOT NULL,
  question_id text NOT NULL,
  old_answer text,             -- NULL for the initial INSERT event
  new_answer text,
  old_explanation text,        -- NULL for the initial INSERT event
  new_explanation text,
  -- 'set' / 'cleared' when this change touched the unknown sign-off
  -- (spec s2: "bevestiging gezet/gewist"), NULL when it did not.
  confirmation_change text CHECK (confirmation_change IN ('set','cleared')),
  -- auth.uid() of the editor. NULL for service-role / direct SQL writes:
  -- those carry no JWT, so there is no actor to record.
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atad2_answer_events_session
    FOREIGN KEY (session_id) REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.atad2_answer_events IS
  'Append-only changelog of atad2_answers (the questionnaire equivalent of atad2_appendix_edits). Written exclusively by trg_atad2_answers_log in the same transaction as the answer write; users have SELECT only. Answer DELETEs (Assessment.tsx backtrack) are intentionally not logged; the re-answer INSERT produces the next event.';

CREATE INDEX IF NOT EXISTS idx_atad2_answer_events_session_question
  ON public.atad2_answer_events(session_id, question_id);
CREATE INDEX IF NOT EXISTS idx_atad2_answer_events_created_at
  ON public.atad2_answer_events(created_at DESC);

ALTER TABLE public.atad2_answer_events ENABLE ROW LEVEL SECURITY;

-- Read access: session owner + staff (mirrors "Staff can view all answers").
DROP POLICY IF EXISTS "Owners and staff can view answer events" ON public.atad2_answer_events;
CREATE POLICY "Owners and staff can view answer events"
  ON public.atad2_answer_events FOR SELECT
  TO authenticated
  USING (
    public.has_admin_access(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = atad2_answer_events.session_id
        AND s.user_id = auth.uid()
    )
  );

-- Deliberately NO INSERT/UPDATE/DELETE policies: with RLS enabled that denies
-- every direct write from authenticated users. Rows are written exclusively
-- by the SECURITY DEFINER trigger function below, which executes as the
-- function owner (supabase_admin, also the table owner, so RLS does not apply
-- to it). service_role bypasses RLS by design, as on every other table.
--
-- Belt and braces for append-only: revoke the underlying table privileges
-- too, so even a future carelessly-added policy cannot open a write path.
REVOKE ALL ON public.atad2_answer_events FROM anon, authenticated;
GRANT SELECT ON public.atad2_answer_events TO authenticated;
GRANT ALL ON public.atad2_answer_events TO service_role;

-- The audit writer. AFTER trigger: it sees the values as actually stored
-- (i.e. after the BEFORE triggers cleared a stale sign-off / bumped
-- updated_at), and it runs in the same transaction as the answer write,
-- so an answer change and its event row commit or roll back together.
CREATE OR REPLACE FUNCTION public.log_atad2_answer_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_confirmation_change text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only the answer value, the explanation and the unknown sign-off are
    -- dossier-relevant. Skip pure bookkeeping updates (e.g. a risk_points
    -- recalculation that changed nothing else) so the log stays readable.
    IF OLD.answer IS NOT DISTINCT FROM NEW.answer
       AND OLD.explanation IS NOT DISTINCT FROM NEW.explanation
       AND OLD.unknown_confirmed_at IS NOT DISTINCT FROM NEW.unknown_confirmed_at THEN
      RETURN NULL;
    END IF;

    v_confirmation_change := CASE
      WHEN OLD.unknown_confirmed_at IS NULL     AND NEW.unknown_confirmed_at IS NOT NULL THEN 'set'
      WHEN OLD.unknown_confirmed_at IS NOT NULL AND NEW.unknown_confirmed_at IS NULL     THEN 'cleared'
      -- re-confirmed at a new timestamp counts as a fresh sign-off
      WHEN OLD.unknown_confirmed_at IS DISTINCT FROM NEW.unknown_confirmed_at            THEN 'set'
      ELSE NULL
    END;

    INSERT INTO public.atad2_answer_events (
      session_id, question_id,
      old_answer, new_answer,
      old_explanation, new_explanation,
      confirmation_change, actor
    ) VALUES (
      NEW.session_id, NEW.question_id,
      OLD.answer, NEW.answer,
      OLD.explanation, NEW.explanation,
      v_confirmation_change,
      auth.uid()  -- NULL when there is no JWT (service role, psql); column is nullable
    );
  ELSE
    -- INSERT: the first recorded answer for this question.
    INSERT INTO public.atad2_answer_events (
      session_id, question_id,
      old_answer, new_answer,
      old_explanation, new_explanation,
      confirmation_change, actor
    ) VALUES (
      NEW.session_id, NEW.question_id,
      NULL, NEW.answer,
      NULL, NEW.explanation,
      CASE WHEN NEW.unknown_confirmed_at IS NOT NULL THEN 'set' END,
      auth.uid()
    );
  END IF;

  RETURN NULL;  -- AFTER trigger: the return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_atad2_answers_log ON public.atad2_answers;
CREATE TRIGGER trg_atad2_answers_log
  AFTER INSERT OR UPDATE ON public.atad2_answers
  FOR EACH ROW EXECUTE FUNCTION public.log_atad2_answer_event();

------------------------------------------------------------------------------
-- 4. atad2_structure_charts: who finalized
------------------------------------------------------------------------------

ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.atad2_structure_charts.finalized_by IS
  'auth.users id of the advisor who finalized the chart. Filled by the frontend finalize path (src/lib/structure/client.ts) from M1 onward; rows finalized earlier stay NULL because no actor was ever recorded. Cleared again on unfinalize.';

------------------------------------------------------------------------------
-- Verification (run manually after applying; read-only):
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.atad2_answers'::regclass AND NOT tgisinternal
--   ORDER BY tgname;
--   -- expect: trg_atad2_answers_clear_stale_confirmation,
--   --         trg_atad2_answers_log, trg_atad2_answers_updated_at
--
--   SELECT count(*) FROM public.atad2_answers WHERE updated_at IS NULL;     -- 0
--   SELECT count(*) FROM public.atad2_answers
--   WHERE unknown_confirmed_at IS NOT NULL;                                 -- 0 (no backfill, by design)
--
--   -- Append-only proof: as an authenticated user, both of these must fail
--   -- (no policy + no privilege):
--   --   INSERT INTO atad2_answer_events (session_id, question_id) VALUES ('x','q1');
--   --   DELETE FROM atad2_answer_events;
------------------------------------------------------------------------------
MIGRATION_EOF
cat > /tmp/dossier-foundation/20260610190200_prefill_job_heartbeat.sql <<'MIGRATION_EOF'
-- Prefill job heartbeat (integral dossier platform, slice 3, migration M2).
-- Spec: docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md, section 2.
--
-- WHY: the document-analysis swarm is orchestrated by the BROWSER
-- (useStartAnalyze in src/hooks/usePrefill.ts). The user's tab inserts the
-- job row, fans out one edge-function call per question, and finalizes the
-- row itself. If the tab closes mid-run, the row is stuck in
-- 'stage2_running' forever and nothing can tell "still running" apart from
-- "abandoned". heartbeat_at fixes that: the browser loop bumps it every
-- ~20 SECONDS while the swarm is alive, copying the chart-extraction
-- heartbeat (atad2_structure_charts.heartbeat_at, migration
-- 20260524120000_chart_heartbeat.sql, ticked every ~15s by the
-- extract-structure edge function).
--
-- STALENESS THRESHOLD (named design constant, spec section 2): readers treat
-- a job in a running status ('queued','stage1_running','stage2_running')
-- whose heartbeat_at is older than 2 MINUTES (or NULL, for rows created
-- before this migration) as dead. The threshold lives in the readers (the
-- atad2_dossier_blocks view in M5 and the frontend), never in DDL, and it
-- never blocks the user: a stale job only surfaces as "attention" with a
-- Resume action.
--
-- ALSO IN THIS FILE:
--   1. A session-owner UPDATE policy on atad2_prefill_jobs, created only if
--      the table has no UPDATE policy yet. The original schema
--      (20260423100000_document_prefill_schema.sql) defined SELECT + INSERT
--      policies only, yet the browser already issues UPDATEs against this
--      table (the swarm finalize step in useStartAnalyze), and the heartbeat
--      tick is another browser-side UPDATE. Without an UPDATE policy, RLS
--      silently matches 0 rows and every such write is a no-op. The DO block
--      below is tolerant of the VM having gained a policy out-of-band: if any
--      UPDATE (or ALL) policy already exists on the table, it does nothing.
--   2. A one-time repair of the legacy jobs that no-op'd finalize left frozen
--      in a running status (see section 3 below). Without this, the M5
--      status oracle would flag every existing dossier's Questions block as
--      'attention' and its Documents block could never reach 'ready'.
--
-- Dark infrastructure: no user-visible behavior change in this slice.
-- Safe to re-run (PIM windows expire mid-run; documented recovery is
-- "run it again").

------------------------------------------------------------------------------
-- 1. The heartbeat column
------------------------------------------------------------------------------

ALTER TABLE public.atad2_prefill_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

COMMENT ON COLUMN public.atad2_prefill_jobs.heartbeat_at IS
  'Last sign of life from the browser-orchestrated analysis swarm (useStartAnalyze ticks this every ~20s). Readers compare against now() with a 2-minute staleness threshold to tell a live run from an abandoned one (closed tab). NULL on rows from before this column existed.';

------------------------------------------------------------------------------
-- 2. Session-owner UPDATE policy
------------------------------------------------------------------------------

-- The browser swarm must be able to write heartbeat_at and to finalize its
-- own job row. Mirrors the existing SELECT/INSERT policies on this table
-- (session-owner pattern from 20260423100000). Guarded so a re-run, or a VM
-- that already has an UPDATE/ALL policy under any name, is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atad2_prefill_jobs'
      AND cmd IN ('UPDATE', 'ALL')
  ) THEN
    CREATE POLICY "Users can update their prefill job"
      ON public.atad2_prefill_jobs FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.atad2_sessions
        WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
          AND atad2_sessions.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.atad2_sessions
        WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
          AND atad2_sessions.user_id = auth.uid()
      ));
  END IF;
END
$$;

------------------------------------------------------------------------------
-- 3. One-time repair of legacy stuck jobs
------------------------------------------------------------------------------

-- Before this migration, the browser's own job-finalize UPDATE (useStartAnalyze
-- step 6) was a silent RLS no-op, so every historical analysis run left its
-- job frozen in 'stage2_running' even though the swarm finished and wrote its
-- prefill rows. Mark those jobs completed so the M5 status oracle does not
-- paint every existing dossier 'attention'. Guards keep this re-run safe and
-- away from live runs:
--   * heartbeat_at IS NULL: no new-frontend run ever ticked it (legacy row);
--   * older than 1 HOUR: no legitimate in-flight run lasts that long
--     (a full swarm is minutes), so a run happening during the apply is safe;
--   * at least one prefill row: the swarm demonstrably produced output.
-- Jobs stuck running WITHOUT any prefill rows are left alone on purpose:
-- 'attention' with a Resume action is the honest state for those, and Resume
-- is idempotent. Re-run safe: repaired rows are 'completed' and never match
-- again.
UPDATE public.atad2_prefill_jobs j
SET status = 'completed',
    stage2_finished_at = COALESCE(
      j.stage2_finished_at,
      (SELECT max(p.created_at)
       FROM public.atad2_question_prefills p
       WHERE p.session_id = j.session_id)
    )
WHERE j.status IN ('queued', 'stage1_running', 'stage2_running')
  AND j.heartbeat_at IS NULL
  AND COALESCE(j.started_at, j.created_at) < now() - interval '1 hour'
  AND EXISTS (
    SELECT 1 FROM public.atad2_question_prefills p
    WHERE p.session_id = j.session_id
  );

------------------------------------------------------------------------------
-- Verification (read-only, run any time):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'atad2_prefill_jobs'
--   ORDER BY cmd;
--   -- expected: one INSERT and exactly one UPDATE policy; for SELECT, the
--   -- owner policy plus, after migration 20260610190500, the additional
--   -- staff SELECT policy.
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'atad2_prefill_jobs'
--     AND column_name = 'heartbeat_at';
--   -- expected: one row.
--
--   SELECT count(*) FROM public.atad2_prefill_jobs
--   WHERE status IN ('queued','stage1_running','stage2_running')
--     AND heartbeat_at IS NULL
--     AND created_at < now() - interval '1 hour';
--   -- expected: only jobs with zero prefill rows (deliberately left alone).
------------------------------------------------------------------------------
MIGRATION_EOF
cat > /tmp/dossier-foundation/20260610190300_open_questions_register.sql <<'MIGRATION_EOF'
-- Open-questions register (dossier foundation, M3 of M1-M5).
-- Spec: docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md, section 3.
--
-- Shipped dark: no user-visible behavior change in this slice.
--
-- Two layers, one truth:
--   * atad2_answers is the GATE truth (final_report_gate in M5 reads it,
--     and only it).
--   * atad2_open_questions is the WORK layer that will drive the panel,
--     the client export and the client loop. It NEVER gates.
-- Database triggers keep the layers in sync so they cannot drift.
--
-- Reopen flags are workflow-only: a contradicting AI suggestion flips a
-- register row to open/'reopen' but NEVER touches atad2_answers, NEVER
-- clears an advisor's unknown-confirmation, and NEVER re-blocks the gate.
-- Only the advisor editing the answer (which clears the confirmation via
-- the M1 BEFORE UPDATE trigger) moves the gate. The AI waves a flag; the
-- advisor holds the pen.
--
-- Answer DELETEs (the question-flow backtrack in src/pages/Assessment.tsx
-- removes later answers when an earlier one changes) deliberately do NOT
-- touch the register: a row auto-resolved by a now-deleted answer keeps its
-- terminal state until the question is re-answered, at which point the
-- INSERT re-fires the sync trigger. The register never gates, so this
-- transient staleness is harmless and self-healing.
--
-- DEPENDS ON M1 (20260610190100, answers resolution columns): the triggers
-- below read atad2_answers.unknown_confirmed_at / unknown_confirmed_note.
-- plpgsql bodies are not validated at CREATE time, so a misordered apply
-- would otherwise install triggers that explode on every answer save. The
-- preflight below is therefore the FIRST statement of this file: if M1 is
-- missing it raises before anything is applied.
--
-- Safe to re-run end to end (PIM windows expire mid-run; documented
-- recovery is "run it again"): CREATE TABLE IF NOT EXISTS, DROP IF EXISTS,
-- CREATE OR REPLACE, ON CONFLICT DO NOTHING.

-- ---------------------------------------------------------------------
-- 0) Preflight: fail fast (and apply nothing) if M1 has not run
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'atad2_answers'
      AND column_name  = 'unknown_confirmed_at'
  ) THEN
    RAISE EXCEPTION 'M3 (open-questions register) requires M1 (20260610190100_answer_resolution_and_events.sql); apply that first. Nothing from this file has been applied.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) The register
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.atad2_open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  question_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','taken_to_client','answered','resolved','confirmed_unknown','dismissed'
  )),
  source text NOT NULL CHECK (source IN ('swarm','advisor','reopen')),
  -- One plain-language sentence for the client. Stays NULL until the swarm
  -- prompt gains the client_question output field (slice 5); until then the
  -- UI falls back to the official question text plus the fixed sentence
  -- "The documents did not provide enough information to answer this
  -- question." (spec section 3, klantvriendelijke formulering).
  client_question text,
  why_it_matters text,            -- copied from atad2_question_prefills.contextual_hint
  client_answer text,             -- what the client said, typed in by the advisor
  client_answer_at timestamptz,
  taken_to_client_at timestamptz,
  resolution_note text,
  reopen_reason text,             -- workflow-only flag, see file header
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);
-- The UNIQUE (session_id, question_id) index also serves session lookups.
-- Partial index for the hub counters / "needs attention" strip:
CREATE INDEX IF NOT EXISTS idx_open_questions_active
  ON public.atad2_open_questions(session_id)
  WHERE status IN ('open','taken_to_client','answered');

DROP TRIGGER IF EXISTS trg_open_questions_updated_at ON public.atad2_open_questions;
CREATE TRIGGER trg_open_questions_updated_at
  BEFORE UPDATE ON public.atad2_open_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2) Append-only UI-event trail
-- ---------------------------------------------------------------------
-- Written ONLY via the SECURITY DEFINER RPC below, which stamps actor and
-- time server-side so the audited party cannot fabricate or backdate the
-- trail (spec section 3). No INSERT/UPDATE/DELETE policies exist on purpose.

CREATE TABLE IF NOT EXISTS public.atad2_open_question_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  question_id text NOT NULL,
  event text NOT NULL CHECK (event IN (
    'exported',          -- row included in a Word export that downloaded successfully
    'copied',            -- row included in a successful "Copy as text"
    'answer_saved',      -- advisor saved "What did the client say?"
    'marked_sent',       -- per-row "Mark as sent to client"
    'recheck_started'    -- "Re-check with AI" fired for this question
  )),
  detail jsonb,
  actor uuid,            -- stamped server-side (auth.uid()), never client-supplied
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_open_question_events_session
  ON public.atad2_open_question_events(session_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
-- Session-owner pattern mirrors atad2_session_documents (20260423100000);
-- staff SELECT mirrors 20260422_admin_light_access.

ALTER TABLE public.atad2_open_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_open_question_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their open questions" ON public.atad2_open_questions;
CREATE POLICY "Users can view their open questions"
  ON public.atad2_open_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions
    WHERE atad2_sessions.session_id = atad2_open_questions.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert their open questions" ON public.atad2_open_questions;
CREATE POLICY "Users can insert their open questions"
  ON public.atad2_open_questions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.atad2_sessions
    WHERE atad2_sessions.session_id = atad2_open_questions.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update their open questions" ON public.atad2_open_questions;
CREATE POLICY "Users can update their open questions"
  ON public.atad2_open_questions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions
    WHERE atad2_sessions.session_id = atad2_open_questions.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

-- No user DELETE policy on purpose: 'dismissed' / 'resolved' replace
-- deletion, and rows cascade away with the session.

DROP POLICY IF EXISTS "Staff can view all open questions" ON public.atad2_open_questions;
CREATE POLICY "Staff can view all open questions"
  ON public.atad2_open_questions FOR SELECT
  TO authenticated
  USING (public.has_admin_access(auth.uid()));

DROP POLICY IF EXISTS "Users can view their open question events" ON public.atad2_open_question_events;
CREATE POLICY "Users can view their open question events"
  ON public.atad2_open_question_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions
    WHERE atad2_sessions.session_id = atad2_open_question_events.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Staff can view all open question events" ON public.atad2_open_question_events;
CREATE POLICY "Staff can view all open question events"
  ON public.atad2_open_question_events FOR SELECT
  TO authenticated
  USING (public.has_admin_access(auth.uid()));

-- Writes to the events table happen only via the SECURITY DEFINER RPC
-- below (same approach as atad2_assessment_log), so there are no
-- INSERT/UPDATE/DELETE policies: a direct owner insert fails RLS.
-- Belt and braces (same as atad2_answer_events in M1): revoke the
-- underlying table privileges too, so even a future carelessly-added
-- policy cannot open a write path.
REVOKE ALL ON public.atad2_open_question_events FROM anon, authenticated;
GRANT SELECT ON public.atad2_open_question_events TO authenticated;
GRANT ALL ON public.atad2_open_question_events TO service_role;

-- ---------------------------------------------------------------------
-- 4) The events RPC (modeled on admin_reset_session, 20260603130000)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_open_question_event(
  p_session_id text,
  p_question_id text,
  p_event text,
  p_detail jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  -- PostgREST exposes the JWT role claim via request.jwt.claims. Calls made
  -- with the service key carry role 'service_role' and have NO auth.uid(),
  -- so they pass the ownership check via this claim instead (same pattern
  -- as final_report_gate in M5); their events land with actor NULL, which
  -- is the honest record for a system-initiated action.
  v_jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_event_id uuid;
BEGIN
  -- Ownership check inside the function: the caller must own the session,
  -- be staff (admin/moderator), or be the service role.
  IF v_jwt_role <> 'service_role'
     AND NOT EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = p_session_id
      AND (s.user_id = v_actor OR public.has_admin_access(v_actor))
  ) THEN
    RAISE EXCEPTION 'log_open_question_event: session % not found or not owned by caller', p_session_id
      USING ERRCODE = '42501';
  END IF;

  -- Actor and timestamp are stamped here, server-side. The event
  -- vocabulary is enforced by the CHECK constraint on the table.
  INSERT INTO public.atad2_open_question_events (session_id, question_id, event, detail, actor)
  VALUES (p_session_id, p_question_id, p_event, p_detail, v_actor)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'id', v_event_id,
    'event', p_event,
    'logged_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_open_question_event(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_open_question_event(text, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) Trigger 1: how rows are born (on the swarm upsert)
-- ---------------------------------------------------------------------
-- Fires in the same transaction as every swarm upsert to
-- atad2_question_prefills, so the first open questions stream into the UI
-- seconds after the analysis starts (the table joins the realtime
-- publication in section 7).
--
-- DESIGN DECISION, fail-soft: the body is wrapped in an EXCEPTION guard.
-- The prefill row (the analysis result) is the product-critical write; the
-- register is derived workflow data that self-heals (every later swarm
-- upsert and every answer edit re-derive it, and the backfill pattern can
-- rebuild it). A register bug must never make document analysis fail for
-- the advisor, so failures here log a WARNING instead of aborting the
-- swarm upsert. The answers-side trigger (section 6) deliberately has NO
-- such guard: it keeps the gate truth and the register from drifting,
-- runs in a small interactive transaction, and a loud failure there is a
-- retryable save error, while silent drift would be worse.

CREATE OR REPLACE FUNCTION public.sync_open_questions_from_prefill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_answer public.atad2_answers%ROWTYPE;
  v_has_answer boolean := false;
  v_is_unknown_suggestion boolean;
  v_reason text;
BEGIN
  -- Only react when the AI suggestion itself changed. Advisor actions on
  -- prefill rows (user_action accept/dismiss/etc.) must not churn the
  -- register.
  IF TG_OP = 'UPDATE'
     AND NEW.suggested_answer IS NOT DISTINCT FROM OLD.suggested_answer
     AND NEW.confidence_pct   IS NOT DISTINCT FROM OLD.confidence_pct
     AND NEW.contextual_hint  IS NOT DISTINCT FROM OLD.contextual_hint THEN
    RETURN NEW;
  END IF;

  -- The swarm has TWO representations of "the documents cannot answer this":
  --   * current (swarm prompt v8+, Rule 0, see 20260524100000): the
  --     no-answer route stores suggested_answer NULL with a non-null
  --     contextual_hint (the routes are mutually exclusive; verified
  --     against analyze.ts and the v8 prompt);
  --   * historic (pre-v8 rows): suggested_answer = 'unknown'.
  -- Both MUST feed the register, otherwise it never fills from the swarm.
  v_is_unknown_suggestion :=
    (NEW.suggested_answer = 'unknown')
    OR (NEW.suggested_answer IS NULL AND NEW.contextual_hint IS NOT NULL);

  BEGIN
    SELECT * INTO v_answer
    FROM public.atad2_answers a
    WHERE a.session_id = NEW.session_id AND a.question_id = NEW.question_id;
    v_has_answer := FOUND;

    IF v_is_unknown_suggestion THEN
      -- CASE A: suggestion "unknown" and no definitive recorded answer
      -- (definitive = a recorded Yes/No, or a confirmed Unknown).
      -- Insert an open row (source 'swarm'); if a row already exists,
      -- refresh the wording only while it is still open/taken_to_client.
      IF (NOT v_has_answer)
         OR (v_answer.answer = 'Unknown' AND v_answer.unknown_confirmed_at IS NULL) THEN
        INSERT INTO public.atad2_open_questions
          (session_id, question_id, status, source, why_it_matters)
        VALUES
          (NEW.session_id, NEW.question_id, 'open', 'swarm', NEW.contextual_hint)
        ON CONFLICT (session_id, question_id) DO UPDATE
          -- Wording refresh. When the swarm prompt gains client_question
          -- (slice 5), extend this SET (and the VALUES above) with it.
          SET why_it_matters = EXCLUDED.why_it_matters,
              updated_at = now()
          WHERE atad2_open_questions.status IN ('open','taken_to_client');
      END IF;

    ELSIF NEW.suggested_answer IN ('yes','no')
          -- REOPEN_CONFIDENCE_THRESHOLD = 60: a definitive AI suggestion
          -- only raises a reopen flag at confidence_pct >= 60. Estimate
          -- (spec section 9 item 7); revisit after the first real dossiers.
          AND COALESCE(NEW.confidence_pct, 0) >= 60
          AND v_has_answer THEN

      IF v_answer.answer IN ('Yes','No')
         AND lower(v_answer.answer) <> NEW.suggested_answer THEN
        -- CASE B: definitive suggestion contradicts a recorded Yes/No.
        -- Workflow flag only: atad2_answers is NEVER touched here.
        v_reason := format(
          'Latest document analysis suggests "%s" (confidence %s%%), which contradicts the recorded answer "%s".',
          initcap(NEW.suggested_answer), NEW.confidence_pct, v_answer.answer);
        INSERT INTO public.atad2_open_questions
          (session_id, question_id, status, source, why_it_matters, reopen_reason)
        VALUES
          (NEW.session_id, NEW.question_id, 'open', 'reopen', NEW.contextual_hint, v_reason)
        ON CONFLICT (session_id, question_id) DO UPDATE
          SET status = 'open',
              source = 'reopen',
              reopen_reason = EXCLUDED.reopen_reason,
              why_it_matters = COALESCE(EXCLUDED.why_it_matters, atad2_open_questions.why_it_matters),
              resolution_note = NULL,
              resolved_at = NULL,
              updated_at = now();

      ELSIF v_answer.answer = 'Unknown'
            AND v_answer.unknown_confirmed_at IS NOT NULL THEN
        -- CASE C: definitive suggestion against a confirmed-unknown answer.
        -- Same workflow flag; the confirmation in atad2_answers is NEVER
        -- cleared here and the gate stays open. Only the advisor editing
        -- the answer moves the gate.
        v_reason := format(
          'Latest document analysis suggests "%s" (confidence %s%%) for a question that was confirmed as unknown.',
          initcap(NEW.suggested_answer), NEW.confidence_pct);
        INSERT INTO public.atad2_open_questions
          (session_id, question_id, status, source, why_it_matters, reopen_reason)
        VALUES
          (NEW.session_id, NEW.question_id, 'open', 'reopen', NEW.contextual_hint, v_reason)
        ON CONFLICT (session_id, question_id) DO UPDATE
          SET status = 'open',
              source = 'reopen',
              reopen_reason = EXCLUDED.reopen_reason,
              why_it_matters = COALESCE(EXCLUDED.why_it_matters, atad2_open_questions.why_it_matters),
              resolution_note = NULL,
              resolved_at = NULL,
              updated_at = now();
      END IF;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-soft (see DESIGN DECISION above): never sink the swarm upsert.
    RAISE WARNING 'sync_open_questions_from_prefill failed for session % question %: %',
      NEW.session_id, NEW.question_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_prefills_sync_open_questions ON public.atad2_question_prefills;
CREATE TRIGGER trg_question_prefills_sync_open_questions
  AFTER INSERT OR UPDATE ON public.atad2_question_prefills
  FOR EACH ROW EXECUTE FUNCTION public.sync_open_questions_from_prefill();

-- ---------------------------------------------------------------------
-- 6) Trigger 2: the answers side (both write paths covered:
--    the question flow and EditableAnswer, nobody has to remember anything)
-- ---------------------------------------------------------------------
-- NOT exception-guarded on purpose; see the DESIGN DECISION in section 5.

CREATE OR REPLACE FUNCTION public.sync_open_questions_from_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when the answer value or the confirmation changed
  -- (explanation-only edits leave the register alone).
  IF TG_OP = 'UPDATE'
     AND NEW.answer IS NOT DISTINCT FROM OLD.answer
     AND NEW.unknown_confirmed_at IS NOT DISTINCT FROM OLD.unknown_confirmed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.answer IN ('Yes','No') THEN
    -- A definitive answer auto-resolves the register row. This includes
    -- 'confirmed_unknown': when the advisor turns a confirmed Unknown into
    -- Yes/No, the M1 BEFORE UPDATE trigger has already wiped the
    -- confirmation in this same transaction, so leaving the register at
    -- confirmed_unknown would be a lie. 'dismissed' rows stay dismissed.
    UPDATE public.atad2_open_questions q
    SET status = 'resolved',
        resolved_at = now(),
        resolution_note = format('Auto-resolved: advisor recorded "%s".', NEW.answer),
        reopen_reason = NULL,
        updated_at = now()
    WHERE q.session_id = NEW.session_id
      AND q.question_id = NEW.question_id
      AND q.status IN ('open','taken_to_client','answered','confirmed_unknown');

  ELSIF NEW.answer = 'Unknown' THEN
    IF NEW.unknown_confirmed_at IS NOT NULL THEN
      -- Confirmation set: flip the register row to confirmed_unknown and
      -- copy the advisor's note. Upsert in case no row exists yet
      -- (e.g. an Unknown answered and confirmed before the swarm ran).
      INSERT INTO public.atad2_open_questions
        (session_id, question_id, status, source, resolution_note, resolved_at)
      VALUES
        (NEW.session_id, NEW.question_id, 'confirmed_unknown', 'advisor',
         NEW.unknown_confirmed_note, NEW.unknown_confirmed_at)
      ON CONFLICT (session_id, question_id) DO UPDATE
        SET status = 'confirmed_unknown',
            resolution_note = EXCLUDED.resolution_note,
            resolved_at = EXCLUDED.resolved_at,
            reopen_reason = NULL,
            updated_at = now();
    ELSE
      -- Unconfirmed Unknown: create a row, or reopen one that sits in a
      -- terminal state. This also covers "confirmation cleared" (the
      -- answer stays Unknown, unknown_confirmed_at goes NULL): the
      -- confirmed_unknown row reopens. Rows already in
      -- open/taken_to_client/answered keep their client-workflow state.
      INSERT INTO public.atad2_open_questions
        (session_id, question_id, status, source)
      VALUES
        (NEW.session_id, NEW.question_id, 'open', 'advisor')
      ON CONFLICT (session_id, question_id) DO UPDATE
        SET status = 'open',
            resolved_at = NULL,
            resolution_note = NULL,
            reopen_reason = NULL,
            updated_at = now()
        WHERE atad2_open_questions.status IN ('resolved','dismissed','confirmed_unknown');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_answers_sync_open_questions ON public.atad2_answers;
CREATE TRIGGER trg_answers_sync_open_questions
  AFTER INSERT OR UPDATE ON public.atad2_answers
  FOR EACH ROW EXECUTE FUNCTION public.sync_open_questions_from_answer();

-- ---------------------------------------------------------------------
-- 7) Realtime
-- ---------------------------------------------------------------------
-- No repo migration has ever touched the publication; the VM's
-- supabase_realtime publication may be FOR ALL TABLES or an explicit table
-- list. This block handles both, and degrades to a NOTICE when the
-- publication is missing entirely (the UI then degrades to
-- refetch-on-focus; verify per spec section 9 item 4 at deploy time).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping. Frontend degrades to refetch-on-focus.';
  ELSIF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables
  ) THEN
    RAISE NOTICE 'Publication supabase_realtime is FOR ALL TABLES; atad2_open_questions already included.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'atad2_open_questions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.atad2_open_questions';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) Backfill
-- ---------------------------------------------------------------------
-- Keyed on "no non-archived report row exists" (NOT on session status:
-- Assessment.tsx sets status 'completed' when the question path ends, long
-- before a memo). Dossiers in flight get their Unknowns and AI gaps in the
-- register; truly delivered dossiers (a live report exists) are left
-- alone. ON CONFLICT DO NOTHING keeps the whole section re-run safe.
--
-- Re-run note: sessions whose reports were archived since the first run
-- (e.g. admin_reset_session) newly match on a re-run and gain register
-- rows then. ON CONFLICT protects every existing row (including dismissed
-- and resolved ones), so a re-run CONVERGES to a consistent state rather
-- than being a strict no-op; the answers trigger would create the same
-- rows on the next edit anyway.

-- 8a) Unknown answers in live dossiers -> register rows (source 'advisor':
-- the advisor recorded them). M1 deliberately does not backfill
-- confirmations, so these land as 'open'; the CASE is defensive should a
-- confirmation already exist by the time this runs again.
INSERT INTO public.atad2_open_questions
  (session_id, question_id, status, source, resolution_note, resolved_at, created_at)
SELECT
  a.session_id,
  a.question_id,
  CASE WHEN a.unknown_confirmed_at IS NOT NULL THEN 'confirmed_unknown' ELSE 'open' END,
  'advisor',
  a.unknown_confirmed_note,
  a.unknown_confirmed_at,
  a.answered_at
FROM public.atad2_answers a
WHERE a.answer = 'Unknown'
  AND NOT EXISTS (
    SELECT 1 FROM public.atad2_reports r
    WHERE r.session_id = a.session_id
      AND r.archived_at IS NULL
  )
ON CONFLICT (session_id, question_id) DO NOTHING;

-- 8b) Swarm unknown-suggestions without any recorded answer -> open
-- (source 'swarm'). Runs after 8a so answer-derived rows take precedence.
-- Same two unknown representations as the trigger (see section 5):
-- pre-v8 rows store suggested_answer = 'unknown'; v8+ rows store
-- suggested_answer NULL with a non-null contextual_hint.
INSERT INTO public.atad2_open_questions
  (session_id, question_id, status, source, why_it_matters, created_at)
SELECT
  p.session_id,
  p.question_id,
  'open',
  'swarm',
  p.contextual_hint,
  p.created_at
FROM public.atad2_question_prefills p
WHERE (p.suggested_answer = 'unknown'
       OR (p.suggested_answer IS NULL AND p.contextual_hint IS NOT NULL))
  AND NOT EXISTS (
    SELECT 1 FROM public.atad2_answers a
    WHERE a.session_id = p.session_id
      AND a.question_id = p.question_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.atad2_reports r
    WHERE r.session_id = p.session_id
      AND r.archived_at IS NULL
  )
ON CONFLICT (session_id, question_id) DO NOTHING;
MIGRATION_EOF
cat > /tmp/dossier-foundation/20260610190400_report_columns_and_rls_hardening.sql <<'MIGRATION_EOF'
-- M4 of the dossier foundation (slice 3, shipped dark):
-- report columns + total_risk numeric + RLS hardening + assessment_log extension.
--
-- Design: docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md
-- (section 2 "Wat wordt opgeslagen" and section 5 "Beveiligingsaanscherping").
--
-- What this does and why:
--   1. atad2_reports grows the two-kind report model: report_kind
--      ('interim'|'final', default 'final' so every historical row and every
--      n8n-inserted row classifies as a final memo, which is what they are).
--      The report row doubles as the generation job (the appendix house
--      pattern: no separate jobs table, no second realtime channel), hence
--      generation_status ('generating'|'ready'|'error', default 'ready' so
--      existing rows read as done) and error_message. Section-wise updating
--      gets its lineage columns (parent_report_id, regenerated_sections,
--      prompt_version) and interim reports get open_questions, a frozen jsonb
--      snapshot of the open-questions register at generation time.
--   2. total_risk becomes numeric: risk sums are fractional in the dossier
--      model; integer silently truncated them.
--   3. RLS hardening (closes the gate hole): the INSERT policy
--      "Service role can insert reports" was created in 20250814181123 with
--      WITH CHECK (true) and NO role restriction, so any logged-in user could
--      insert a row indistinguishable from a gated final memo. It is replaced
--      by a service_role-only variant. The user DELETE policy
--      "Users can delete their own reports" is dropped: archiving replaces
--      deletion (audit trail survives). The admin DELETE policy
--      ("Admins can delete all reports") intentionally stays.
--   4. archive_report(p_report_id) SECURITY DEFINER RPC: atad2_reports has
--      deliberately NO user UPDATE policy (a direct UPDATE grant would also
--      let users rewrite report_md of a delivered memo), so the owner-facing
--      Archive button in ReportDetail.tsx calls this RPC instead. It checks
--      ownership inside (modeled on admin_reset_session) and stamps
--      archived_at = now(), archived_by = auth.uid() server-side.
--   5. atad2_assessment_log.event_type CHECK gains 'interim_generated' and
--      'final_generated'. The report engine writes those events in a later
--      slice; rewiring the 'completed' event to "first ready final memo"
--      happens there too. This migration only widens the constraint so the
--      engine slice needs no DDL.
--
-- Dark delivery: nothing user-visible changes. New columns keep their
-- defaults until the report engine slice; the only behavior change is that
-- raw authenticated inserts/deletes on atad2_reports now fail, which no
-- legitimate code path performs (the only inserter is the n8n-report edge
-- function using SUPABASE_SERVICE_ROLE_KEY; the only user-facing delete was
-- ReportDetail.tsx, converted to Archive in the same slice).
--
-- DEPLOY ORDER (matters for the delete): with the DELETE policy gone, the
-- OLD Delete button's request matches zero rows and PostgREST reports
-- success, so the old UI would show "Report deleted" while the report
-- survives. Ship the ReportDetail.tsx Archive rider in the same frontend
-- deploy as this migration; do not leave a gap.
--
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / DROP IF EXISTS /
-- conditional DO blocks). PIM windows expire mid-run; recovery is to run the
-- whole file again.
-- Runs as supabase_admin (table owner) via az vm run-command + psql.

------------------------------------------------------------------------------
-- 1. New report columns
------------------------------------------------------------------------------

ALTER TABLE public.atad2_reports
  -- Two report kinds out of one engine. Default 'final': history + n8n rows.
  ADD COLUMN IF NOT EXISTS report_kind text NOT NULL DEFAULT 'final'
    CONSTRAINT atad2_reports_report_kind_check
    CHECK (report_kind IN ('interim', 'final')),
  -- The report row IS the generation job. Default 'ready': existing rows are done.
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'ready'
    CONSTRAINT atad2_reports_generation_status_check
    CHECK (generation_status IN ('generating', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS error_message text,
  -- Which prompt version produced this report (audit / regression tracing).
  ADD COLUMN IF NOT EXISTS prompt_version text,
  -- Section-wise update lineage: an updated memo is a NEW row pointing at its
  -- archived parent, listing which sections were regenerated.
  ADD COLUMN IF NOT EXISTS parent_report_id uuid
    REFERENCES public.atad2_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_sections text[],
  -- Interim reports freeze the open-questions register at generation time so
  -- the "Information requested from client" section can never drift.
  ADD COLUMN IF NOT EXISTS open_questions jsonb;

------------------------------------------------------------------------------
-- 2. total_risk integer -> numeric (risk sums are fractional)
------------------------------------------------------------------------------

-- LOCK NOTE: the type change takes an ACCESS EXCLUSIVE lock and rewrites the
-- whole table (int -> numeric is not binary-coercible). atad2_reports is
-- tiny (one row per generated memo plus archived copies), so this is
-- sub-second. Guarded: a re-run sees numeric and skips entirely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atad2_reports'
      AND column_name = 'total_risk'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.atad2_reports
      ALTER COLUMN total_risk TYPE numeric USING total_risk::numeric;
  END IF;
END $$;

------------------------------------------------------------------------------
-- 3. RLS hardening
------------------------------------------------------------------------------

-- 3a. INSERT becomes service_role-only. The old policy (20250814181123) was
--     WITH CHECK (true) with no TO clause, i.e. it applied to ALL roles and
--     let any authenticated user insert arbitrary report rows.
DROP POLICY IF EXISTS "Service role can insert reports" ON public.atad2_reports;
CREATE POLICY "Service role can insert reports"
  ON public.atad2_reports
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3b. Users can no longer DELETE reports; archive_report() replaces it.
--     "Admins can delete all reports" (has_role admin) is kept on purpose.
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.atad2_reports;

-- Self-test (manual, documents why an authenticated insert now fails):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   INSERT INTO public.atad2_reports (session_id, report_md)
--     VALUES ('<any existing session_id>', 'forged');
--   -- expected: ERROR 42501 new row violates row-level security policy
--   -- (no INSERT policy applies to the authenticated role anymore)
--   ROLLBACK;

------------------------------------------------------------------------------
-- 4. archive_report(): owner-facing soft archive via guarded RPC
------------------------------------------------------------------------------

-- There is intentionally NO user UPDATE policy on atad2_reports: granting one
-- would let users rewrite report_md of a delivered memo. Archiving is the only
-- mutation owners need, so it goes through this SECURITY DEFINER function,
-- modeled on admin_reset_session (ownership check inside, audit log, jsonb
-- result). Idempotent: archiving an already-archived report is a no-op that
-- keeps the original archived_at/archived_by.
CREATE OR REPLACE FUNCTION public.archive_report(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner UUID;
  v_archived_at TIMESTAMPTZ;
  v_archived_by UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'archive_report: not authenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id, archived_at, archived_by
    INTO v_owner, v_archived_at, v_archived_by
  FROM public.atad2_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive_report: report % not found', p_report_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner IS DISTINCT FROM v_caller
     AND NOT public.has_admin_access(v_caller) THEN
    RAISE EXCEPTION 'archive_report: caller does not own report %', p_report_id
      USING ERRCODE = '42501';
  END IF;

  IF v_archived_at IS NULL THEN
    UPDATE public.atad2_reports
    SET archived_at = NOW(),
        archived_by = v_caller
    WHERE id = p_report_id;

    v_archived_at := NOW();
    v_archived_by := v_caller;

    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, new_values)
    VALUES (
      'report_archived',
      'atad2_reports',
      p_report_id::text,
      v_caller,
      jsonb_build_object('report_id', p_report_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'report_id', p_report_id,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_report(UUID) TO authenticated;

------------------------------------------------------------------------------
-- 5. assessment_log: widen the event_type CHECK
------------------------------------------------------------------------------

-- The constraint was created inline in 20260601240000, so its name should be
-- the Postgres default (atad2_assessment_log_event_type_check). Drop by
-- catalog lookup instead of by name so a deviating name on the VM cannot
-- strand a duplicate or fail the re-run. The drop loop AND the re-add live
-- in ONE DO block (= one transaction): either the old constraint survives
-- or the widened one lands, never a window where event_type is unchecked.
DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.atad2_assessment_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.atad2_assessment_log DROP CONSTRAINT %I',
      v_con.conname
    );
  END LOOP;

  EXECUTE $ddl$
    ALTER TABLE public.atad2_assessment_log
      ADD CONSTRAINT atad2_assessment_log_event_type_check
      CHECK (event_type IN (
        'created', 'completed', 'deleted', 'backfill',
        'interim_generated', 'final_generated'
      ))
  $ddl$;
END $$;

------------------------------------------------------------------------------
-- 6. Verification: fail loudly if anything above did not land
------------------------------------------------------------------------------

DO $$
DECLARE
  v_roles name[];
  v_insert_policies int;
  v_columns int;
BEGIN
  -- 6a. Exactly one INSERT policy on atad2_reports, restricted to service_role.
  SELECT count(*) INTO v_insert_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_reports'
    AND cmd = 'INSERT';

  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'M4 verification: expected exactly 1 INSERT policy on atad2_reports, found %',
      v_insert_policies;
  END IF;

  SELECT roles INTO v_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_reports'
    AND policyname = 'Service role can insert reports'
    AND cmd = 'INSERT';

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'M4 verification: INSERT policy "Service role can insert reports" is missing on atad2_reports';
  END IF;

  IF v_roles <> ARRAY['service_role']::name[] THEN
    RAISE EXCEPTION 'M4 verification: INSERT policy on atad2_reports applies to roles %, expected {service_role}. An authenticated insert would NOT fail.',
      v_roles;
  END IF;

  -- 6b. The user DELETE policy must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atad2_reports'
      AND policyname = 'Users can delete their own reports'
  ) THEN
    RAISE EXCEPTION 'M4 verification: policy "Users can delete their own reports" still exists on atad2_reports';
  END IF;

  -- 6c. All seven new columns exist.
  SELECT count(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'atad2_reports'
    AND column_name IN (
      'report_kind', 'generation_status', 'error_message', 'prompt_version',
      'parent_report_id', 'regenerated_sections', 'open_questions'
    );

  IF v_columns <> 7 THEN
    RAISE EXCEPTION 'M4 verification: expected 7 new columns on atad2_reports, found %', v_columns;
  END IF;

  -- 6d. total_risk is numeric.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atad2_reports'
      AND column_name = 'total_risk'
      AND data_type = 'numeric'
  ) THEN
    RAISE EXCEPTION 'M4 verification: atad2_reports.total_risk is not numeric';
  END IF;

  -- 6e. The widened event_type CHECK is in place.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atad2_assessment_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%interim_generated%'
      AND pg_get_constraintdef(oid) LIKE '%final_generated%'
  ) THEN
    RAISE EXCEPTION 'M4 verification: atad2_assessment_log event_type CHECK was not widened';
  END IF;

  -- 6f. The archive RPC exists.
  IF to_regprocedure('public.archive_report(uuid)') IS NULL THEN
    RAISE EXCEPTION 'M4 verification: function public.archive_report(uuid) is missing';
  END IF;

  RAISE NOTICE 'M4 verification passed: report columns, numeric total_risk, service_role-only INSERT, no user DELETE, archive_report(), widened assessment_log CHECK.';
END $$;
MIGRATION_EOF
cat > /tmp/dossier-foundation/20260610190500_dossier_blocks_view_and_final_gate.sql <<'MIGRATION_EOF'
-- Dossier foundation M5 (slice 3, last migration of the set): the status
-- oracle + the final-memo gate. Ships dark: no user-visible behavior change.
--
--   1. View public.atad2_dossier_blocks (security_invoker): one row per
--      session with the five derived block statuses (documents / questions /
--      structure / appendix / report) in the shared six-status vocabulary
--      (empty | generating | in_progress | attention | ready | confirmed),
--      plus the raw facts the hub, the client list and the admin screens
--      will read. This view REPLACES the previously planned
--      atad2_session_summaries: there is exactly one status oracle.
--   2. Function public.final_report_gate(p_session_id): the single gate that
--      every writer (the UI, the future generate-report edge function, and
--      the existing n8n report route during the transition) calls before a
--      FINAL memorandum may be generated. Interim reports are never gated.
--   3. Staff SELECT policies on atad2_question_prefills, atad2_prefill_jobs
--      and atad2_structure_charts (verified owner-only until now), so admin
--      screens see truthful statuses through the view.
--
-- !!!! REPO HYGIENE WARNING, READ BEFORE LINTING OR REPLAYING LOCALLY !!!!
-- ----------------------------------------------------------------------------
-- This migration references public.atad2_appendix. That table EXISTS ON THE
-- VM (applied there on 2026-06-07) but its CREATE TABLE migration
-- (20260607174300_appendix_tables.sql) lives on the feat/technical-appendix
-- branch, NOT in this checkout. Consequences:
--   * This file applies cleanly on the VM, but it CANNOT be validated against
--     this repo's migration set alone: a fresh database built from only this
--     branch's migrations fails here with
--     'relation "public.atad2_appendix" does not exist'.
--   * Columns relied on (SUBSET; the VM table meanwhile has more columns,
--     e.g. facts / facts_skipped / checklist_skipped / facts_input_hash from
--     later branch migrations), verified against the branch on 2026-06-10:
--       atad2_appendix.id                uuid PK
--       atad2_appendix.session_id        text, unique per session
--       atad2_appendix.generation_status text in ('generating','ready','error')
--       atad2_appendix.review_status     text in ('draft','confirmed')
--       atad2_appendix.updated_at        timestamptz
--   * This warning becomes obsolete when feat/technical-appendix merges.
-- ----------------------------------------------------------------------------
--
-- Depends on earlier migrations of this slice (apply M1..M4 first):
--   M1: atad2_answers.unknown_confirmed_at + updated_at
--   M2: atad2_prefill_jobs.heartbeat_at
--   M4: atad2_reports.report_kind + generation_status
--   (archived_at/archived_by already exist since 20260603130000)
-- If M1-M4 have not run, CREATE VIEW fails atomically on the missing columns
-- (views DO validate column references) and only section 1 below (the staff
-- policies, idempotent and harmless) lands; apply M1-M4, then re-run this
-- whole file.
--
-- Re-run contract: the view is DROP IF EXISTS + CREATE (not CREATE OR
-- REPLACE). Future migrations must not create objects that depend on
-- atad2_dossier_blocks without also owning its recreation, or this file
-- stops being re-runnable.
--
-- Tuning constants (estimates; revisit after the first real dossiers):
--   HEARTBEAT_STALE_MINUTES  = 2   -> interval '2 minutes' below. A "running"
--       prefill job or an "extracting:*" chart whose pulse is older than this
--       derives to 'attention' (stalled; Resume is already idempotent).
--   GENERATION_FRESH_MINUTES = 10  -> interval '10 minutes' below. A report
--       or appendix row stuck in 'generating' longer than this derives to
--       'attention' (the generation task died).
-- The confidence >= 60 reopen threshold lives in M3, not here.
--
-- Known staff-visibility limits of the security_invoker view (accepted for
-- this dark slice; spec scopes M5's policies to prefills/jobs/charts only):
--   * atad2_session_documents has NO staff SELECT policy, so staff see
--     docs_count = 0 / documents_status 'empty' for sessions they do not own.
--   * atad2_appendix's staff policy (on the branch) uses has_role('admin'),
--     so moderators see the appendix block as 'empty' for foreign sessions.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Safe to re-run end to end: DROP IF EXISTS / CREATE OR REPLACE throughout
-- (PIM windows expire mid-run; recovery is "run it again").
-- Requires Postgres 15+ (security_invoker view option).

-- ============================================================================
-- 0) Preflight: fail loudly on PostgreSQL < 15 (security_invoker views
--    require Postgres 15+; see header).
-- ============================================================================

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'This migration requires PostgreSQL 15+ (security_invoker views); server reports %', current_setting('server_version');
  END IF;
END $$;

-- ============================================================================
-- 1) Staff SELECT policies (mirror "Staff can view all answers" from
--    20260422_admin_light_access.sql). Owner SELECT policies stay in place.
-- ============================================================================

DROP POLICY IF EXISTS "Staff can view all question prefills" ON public.atad2_question_prefills;
CREATE POLICY "Staff can view all question prefills"
ON public.atad2_question_prefills
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_question_prefills.session_id AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can view all prefill jobs" ON public.atad2_prefill_jobs;
CREATE POLICY "Staff can view all prefill jobs"
ON public.atad2_prefill_jobs
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_prefill_jobs.session_id AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can view all structure charts" ON public.atad2_structure_charts;
CREATE POLICY "Staff can view all structure charts"
ON public.atad2_structure_charts
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  )
);

-- ============================================================================
-- 2) The status oracle: atad2_dossier_blocks
--    security_invoker: callers only see sessions their own RLS allows.
--    All six-status derivation rules live HERE and nowhere else; the UI maps
--    labels but never invents a seventh status. There is no TypeScript mirror
--    of these rules (the one documented exception: per-section memo staleness
--    is computed client-side in sectionDependencies.ts; this view only
--    supplies the coarse inputs_changed_after_final flag).
-- ============================================================================

DROP VIEW IF EXISTS public.atad2_dossier_blocks;

CREATE VIEW public.atad2_dossier_blocks
WITH (security_invoker = true)
AS
SELECT
  s.session_id,

  -- ----- Block: Documents ---------------------------------------------------
  -- Never gates the memo: a dossier answered from advisor knowledge is
  -- legitimate. ready = the last COMPLETED analysis started at or after the
  -- newest upload (so it covered every document on file).
  -- LOAD-BEARING: this relies on the M2 frontend rider re-claiming the job
  -- row on re-analysis (started_at = now() when the insert hits the
  -- duplicate), otherwise started_at stays frozen at the first run and the
  -- block can never reach 'ready' again after a later upload.
  CASE
    WHEN COALESCE(docs.docs_count, 0) = 0 THEN 'empty'
    WHEN j.status = 'completed'
         AND COALESCE(j.started_at, j.created_at) >= docs.last_doc_at THEN 'ready'
    ELSE 'in_progress'
  END AS documents_status,

  -- ----- Block: Questions ---------------------------------------------------
  -- The outcome confirmation deliberately does NOT belong to this block (it
  -- belongs to Report), otherwise the Questions card could never be finished
  -- without visiting another page.
  CASE
    -- AI works right now: running job with a fresh pulse.
    -- HEARTBEAT_STALE_MINUTES = 2. heartbeat_at (M2) is ticked by the browser
    -- swarm loop every ~20s; started_at/created_at are the grace fallback for
    -- a job too young to have ticked yet.
    WHEN j.status IN ('queued', 'stage1_running', 'stage2_running')
         AND COALESCE(j.heartbeat_at, j.started_at, j.created_at)
             > now() - interval '2 minutes' THEN 'generating'
    -- The advisor finished the questionnaire: swarm history (including a
    -- dead historic job) no longer matters. completed = true guarantees an
    -- answer row for every asked question (the gate predicate is path-free
    -- and answer-based). These branches sit ABOVE the stale-running
    -- attention branch on purpose: a finished questionnaire must never be
    -- painted red by an abandoned legacy job (M2 also repairs those).
    WHEN COALESCE(s.completed, false)
         AND COALESCE(ans.answers_count, 0) > 0
         AND COALESCE(ans.open_unknown_count, 0) = 0 THEN 'confirmed'
    WHEN COALESCE(s.completed, false)
         AND COALESCE(ans.answers_count, 0) > 0 THEN 'in_progress' -- unconfirmed Unknowns remain
    -- Still "running" on paper but the pulse went silent: stalled.
    -- Surfaces as attention with a Resume action (resuming is idempotent).
    WHEN j.status IN ('queued', 'stage1_running', 'stage2_running') THEN 'attention'
    WHEN j.status = 'failed' THEN 'attention'
    -- Partially failed swarm, derived from counts: the job claims completed
    -- but produced fewer prefill rows than there are distinct questions.
    WHEN j.status = 'completed'
         AND COALESCE(pf.prefill_count, 0) < qt.questions_total THEN 'attention'
    WHEN COALESCE(ans.answers_count, 0) = 0
         AND COALESCE(pf.prefill_count, 0) = 0
         AND (j.id IS NULL OR j.status = 'cancelled') THEN 'empty'
    ELSE 'in_progress'
  END AS questions_status,

  -- ----- Block: Structure ---------------------------------------------------
  -- Pure mapping of the existing chart status machine. The edge function's
  -- own restart logic uses 90s; for dossier display we use the shared
  -- HEARTBEAT_STALE_MINUTES = 2 so all blocks judge staleness the same way.
  CASE
    WHEN c.id IS NULL THEN 'empty'
    WHEN c.status LIKE 'extracting:%'
         AND COALESCE(c.heartbeat_at, c.updated_at)
             > now() - interval '2 minutes' THEN 'generating'
    WHEN c.status LIKE 'extracting:%' THEN 'attention' -- stale extraction
    -- 'extraction_failed' is the real failure value in the chart state
    -- machine (src/lib/structure/types.ts ChartStatus); 'failed'/'stale'
    -- are kept only as harmless forward-compat. Staleness itself is never
    -- a stored status (it is derived from heartbeat_at, handled above).
    WHEN c.status IN ('extraction_failed', 'failed', 'stale') THEN 'attention'
    WHEN c.status = 'finalized' THEN 'confirmed'
    -- phase_a_ready (waiting for the frontend to auto-trigger Phase B),
    -- draft_ready and user_edited all derive to 'in_progress' on purpose.
    ELSE 'in_progress'
  END AS structure_status,

  -- ----- Block: Technical appendix -------------------------------------------
  -- Mapping of the two-axis house pattern (generation_status + review_status).
  -- confirmed = review_status 'confirmed'. There is deliberately NO whole-
  -- appendix 'skipped' review status; per-page Skip followed by Confirm is
  -- the escape hatch. GENERATION_FRESH_MINUTES = 10 (no heartbeat column on
  -- the appendix; updated_at is touched per generated section).
  CASE
    WHEN ap.id IS NULL THEN 'empty'
    WHEN ap.generation_status = 'generating'
         AND ap.updated_at > now() - interval '10 minutes' THEN 'generating'
    WHEN ap.generation_status = 'generating' THEN 'attention' -- generation died
    WHEN ap.generation_status = 'error' THEN 'attention'
    WHEN ap.review_status = 'confirmed' THEN 'confirmed'
    ELSE 'ready' -- generated, waiting for the advisor's sign-off
  END AS appendix_status,

  -- ----- Block: Report --------------------------------------------------------
  -- The report row doubles as the generation task (M4). 'Needs update' is a
  -- LABEL the UI shows when report_status = 'ready' AND
  -- inputs_changed_after_final; it is not a seventh status.
  -- GENERATION_FRESH_MINUTES = 10.
  CASE
    WHEN rlatest.generation_status IS NULL THEN 'empty'
    WHEN rlatest.generation_status = 'generating'
         AND rlatest.updated_at > now() - interval '10 minutes' THEN 'generating'
    WHEN rlatest.generation_status = 'generating' THEN 'attention' -- generation died
    WHEN rlatest.generation_status = 'error' THEN 'attention'
    WHEN rep.has_final_report THEN 'ready'          -- a current final memo exists
    WHEN rep.has_interim_report THEN 'in_progress'  -- only an interim snapshot
    ELSE 'empty'
  END AS report_status,

  -- ----- Raw facts -----------------------------------------------------------
  COALESCE(docs.docs_count, 0)::int        AS docs_count,
  docs.last_doc_at                         AS last_doc_at,
  j.status                                 AS prefill_job_status,
  COALESCE(pf.prefill_count, 0)::int       AS prefill_count,
  COALESCE(ans.open_unknown_count, 0)::int AS open_unknown_count,
  COALESCE(ans.answers_count, 0)::int      AS answers_count,
  COALESCE(s.completed, false)             AS completed,
  COALESCE(s.outcome_confirmed, false)     AS outcome_confirmed,
  c.status                                 AS chart_status,
  c.finalized_at                           AS finalized_at,
  ap.generation_status                     AS appendix_generation_status,
  ap.review_status                         AS appendix_review_status,
  COALESCE(rep.has_interim_report, false)  AS has_interim_report,
  COALESCE(rep.has_final_report, false)    AS has_final_report,
  rlatest.generation_status                AS report_generation_status,

  -- Coarse drift flag: did ANY memo input change after the newest active
  -- final memo was generated? Inputs mirror the six input sources of
  -- sectionDependencies.ts: answers (max updated_at, M1), documents (newest
  -- upload), structure (chart updated_at), appendix (updated_at) and outcome
  -- (sessions.confirmed_at). sessions.updated_at is deliberately excluded:
  -- it is touched by too many non-input writes (e.g. docx download marks).
  -- Postgres GREATEST ignores NULL arguments; if everything is NULL the
  -- comparison is NULL and COALESCE lands on false.
  COALESCE(
    rep.last_final_generated_at IS NOT NULL
    AND GREATEST(
          ans.answers_last_changed_at,
          docs.last_doc_at,
          c.updated_at,
          ap.updated_at,
          s.confirmed_at
        ) > rep.last_final_generated_at,
    false
  ) AS inputs_changed_after_final

FROM public.atad2_sessions s
LEFT JOIN public.atad2_prefill_jobs j     ON j.session_id  = s.session_id
LEFT JOIN public.atad2_structure_charts c ON c.session_id  = s.session_id
LEFT JOIN public.atad2_appendix ap        ON ap.session_id = s.session_id  -- VM-only table, see header
LEFT JOIN LATERAL (
  SELECT count(*) AS docs_count,
         max(d.created_at) AS last_doc_at
  FROM public.atad2_session_documents d
  WHERE d.session_id = s.session_id
) docs ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS answers_count,
         count(*) FILTER (WHERE a.answer = 'Unknown'
                            AND a.unknown_confirmed_at IS NULL) AS open_unknown_count,
         max(COALESCE(a.updated_at, a.answered_at, a.created_at)) AS answers_last_changed_at
  FROM public.atad2_answers a
  WHERE a.session_id = s.session_id
) ans ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS prefill_count
  FROM public.atad2_question_prefills p
  WHERE p.session_id = s.session_id
) pf ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE r.report_kind = 'final'
                            AND r.generation_status = 'ready') > 0 AS has_final_report,
         count(*) FILTER (WHERE r.report_kind = 'interim'
                            AND r.generation_status = 'ready') > 0 AS has_interim_report,
         max(r.generated_at) FILTER (WHERE r.report_kind = 'final'
                            AND r.generation_status = 'ready') AS last_final_generated_at
  FROM public.atad2_reports r
  WHERE r.session_id = s.session_id
    AND r.archived_at IS NULL
) rep ON true
LEFT JOIN LATERAL (
  SELECT r.generation_status, r.updated_at
  FROM public.atad2_reports r
  WHERE r.session_id = s.session_id
    AND r.archived_at IS NULL
  ORDER BY r.generated_at DESC
  LIMIT 1
) rlatest ON true
CROSS JOIN LATERAL (
  -- atad2_questions is world-readable ("Questions are viewable by everyone"),
  -- so this count is identical for every caller.
  SELECT count(DISTINCT q.question_id) AS questions_total
  FROM public.atad2_questions q
) qt;

COMMENT ON VIEW public.atad2_dossier_blocks IS
  'The single status oracle for the dossier hub, client list and admin screens. One row per session; five derived block statuses in the six-status vocabulary (empty|generating|in_progress|attention|ready|confirmed) plus raw facts. security_invoker: RLS of the underlying tables applies to the caller. References atad2_appendix, whose migration lives on feat/technical-appendix (table exists on the VM).';

GRANT SELECT ON public.atad2_dossier_blocks TO authenticated, service_role;

-- ============================================================================
-- 3) The gate: final_report_gate(p_session_id)
--    Modeled on admin_reset_session (20260603130000): SECURITY DEFINER,
--    ownership check inside, jsonb result. Called by the UI (button +
--    checklist popover), by the future generate-report edge function, and by
--    the existing n8n report route, so a stale tab or a raw API call can
--    never produce an ungated final memo. The predicate is deliberately
--    path-free and answer-based: completed = true guarantees an answer row
--    for every asked question, so AI gaps outside the question path can
--    never block, and the open-questions register (M3) never gates by itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.final_report_gate(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  -- PostgREST puts the JWT role claim in request.jwt.claims. Edge functions
  -- calling with the service key carry role 'service_role' and always pass
  -- the ownership check (the spec explicitly allows the service role).
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_session RECORD;
  v_open_unknowns INT;
  v_appendix RECORD;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  SELECT id,
         user_id,
         COALESCE(completed, false)         AS completed,
         COALESCE(outcome_confirmed, false) AS outcome_confirmed
  INTO v_session
  FROM public.atad2_sessions
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'final_report_gate: session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Ownership check inside the function (admin_reset_session model):
  -- session owner, staff (admin/moderator), or the service role.
  IF v_jwt_role <> 'service_role'
     AND v_session.user_id IS DISTINCT FROM v_caller
     AND NOT public.has_admin_access(v_caller) THEN
    RAISE EXCEPTION 'final_report_gate: caller may not gate session %', p_session_id
      USING ERRCODE = '42501';
  END IF;

  -- Blocker 1: the question path has not been walked to the end.
  IF NOT v_session.completed THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'questions_not_finished', 'count', 1);
  END IF;

  -- Blocker 2: Unknown answers that nobody has consciously confirmed.
  -- unknown_confirmed_at comes from M1; an answer edit clears it via trigger,
  -- so a stale sign-off can never satisfy this check.
  SELECT count(*)
  INTO v_open_unknowns
  FROM public.atad2_answers a
  WHERE a.session_id = p_session_id
    AND a.answer = 'Unknown'
    AND a.unknown_confirmed_at IS NULL;

  IF v_open_unknowns > 0 THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'open_unknown_answers', 'count', v_open_unknowns);
  END IF;

  -- Blocker 3: the preliminary outcome has not been confirmed (or overridden
  -- with a confirmation) by the advisor.
  IF NOT v_session.outcome_confirmed THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'outcome_not_confirmed', 'count', 1);
  END IF;

  -- Blocker 4: the structure chart has not been finalized.
  IF NOT EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    WHERE c.session_id = p_session_id
      AND c.status = 'finalized'
  ) THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'structure_not_finalized', 'count', 1);
  END IF;

  -- Blockers 5/6: the technical appendix is missing or not confirmed.
  -- atad2_appendix is the VM-only table documented in the header. There is
  -- deliberately no whole-appendix 'skipped' status: a dossier without
  -- appendix content uses per-page Skip followed by Confirm (on name).
  SELECT review_status, generation_status
  INTO v_appendix
  FROM public.atad2_appendix
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'appendix_missing', 'count', 1);
  ELSIF v_appendix.review_status <> 'confirmed' THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'appendix_not_confirmed', 'count', 1);
  END IF;

  RETURN jsonb_build_object(
    'allowed', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers
  );
END;
$$;

COMMENT ON FUNCTION public.final_report_gate(TEXT) IS
  'The single gate for generating a FINAL memorandum. Returns {allowed boolean, blockers [{code, count}]}. Blocker codes: questions_not_finished, open_unknown_answers, outcome_not_confirmed, structure_not_finalized, appendix_missing, appendix_not_confirmed. Ownership checked inside (owner, staff, or service_role). Interim reports are never gated.';

REVOKE ALL ON FUNCTION public.final_report_gate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.final_report_gate(TEXT) TO authenticated, service_role;

-- Let PostgREST pick up the new view + function without a container restart.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verification (manual, on the VM, inside one psql session):
--
--   -- 1. Simulate a session owner and read their dossier row + gate:
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"<owner-uuid>"}';
--   SET LOCAL ROLE authenticated;
--   SELECT session_id, documents_status, questions_status, structure_status,
--          appendix_status, report_status, inputs_changed_after_final
--   FROM public.atad2_dossier_blocks WHERE session_id = '<session_id>';
--   SELECT public.final_report_gate('<session_id>');
--   ROLLBACK;
--
--   -- 2. A non-owner non-staff caller must get zero view rows and an
--   --    exception (42501) from the gate for the same session.
--
--   -- 3. Staff (moderator) should now see prefill/job/chart-derived statuses
--   --    for foreign sessions; docs_count and the appendix block remain
--   --    owner-only for moderators (documented limitation above).
-- ============================================================================
MIGRATION_EOF
echo "=== md5sums on VM (compare against workstation values) ==="
md5sum /tmp/dossier-foundation/*.sql
echo "=== APPLYING 20260610190100_answer_resolution_and_events.sql ==="
docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/dossier-foundation/20260610190100_answer_resolution_and_events.sql
echo "=== APPLYING 20260610190200_prefill_job_heartbeat.sql ==="
docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/dossier-foundation/20260610190200_prefill_job_heartbeat.sql
echo "=== APPLYING 20260610190300_open_questions_register.sql ==="
docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/dossier-foundation/20260610190300_open_questions_register.sql
echo "=== APPLYING 20260610190400_report_columns_and_rls_hardening.sql ==="
docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/dossier-foundation/20260610190400_report_columns_and_rls_hardening.sql
echo "=== APPLYING 20260610190500_dossier_blocks_view_and_final_gate.sql ==="
docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/dossier-foundation/20260610190500_dossier_blocks_view_and_final_gate.sql
echo "=== POST-APPLY VERIFICATION ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'VERIFY_EOF'
-- M1: three triggers on atad2_answers
SELECT tgname FROM pg_trigger WHERE tgrelid='public.atad2_answers'::regclass AND NOT tgisinternal ORDER BY tgname;
-- M1: updated_at backfilled, no confirmations invented
SELECT count(*) AS answers_missing_updated_at FROM public.atad2_answers WHERE updated_at IS NULL;
SELECT count(*) AS preconfirmed_unknowns FROM public.atad2_answers WHERE unknown_confirmed_at IS NOT NULL;
-- M2: exactly one SELECT, INSERT and UPDATE policy on prefill jobs
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='atad2_prefill_jobs' ORDER BY cmd;
-- M2: legacy stuck jobs repaired (remaining ones have zero prefill rows, left alone on purpose)
SELECT count(*) AS still_stuck_running_jobs FROM public.atad2_prefill_jobs
WHERE status IN ('queued','stage1_running','stage2_running') AND heartbeat_at IS NULL;
-- M3 + M5: new objects exist
SELECT to_regclass('public.atad2_answer_events')        AS answer_events,
       to_regclass('public.atad2_open_questions')       AS open_questions,
       to_regclass('public.atad2_open_question_events') AS open_question_events,
       to_regclass('public.atad2_dossier_blocks')       AS dossier_blocks_view;
SELECT to_regprocedure('public.final_report_gate(text)')                            AS gate_fn,
       to_regprocedure('public.archive_report(uuid)')                               AS archive_fn,
       to_regprocedure('public.log_open_question_event(text,text,text,jsonb)')      AS log_event_fn;
-- M3: backfill landed (count is informational)
SELECT count(*) AS register_rows, count(*) FILTER (WHERE source='swarm') AS from_swarm FROM public.atad2_open_questions;
-- M3: realtime publication state for the register table
SELECT pubname, puballtables FROM pg_publication WHERE pubname='supabase_realtime';
SELECT count(*) AS register_in_publication FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='atad2_open_questions';
VERIFY_EOF
echo "=== DONE: dossier foundation M1-M5 applied ==="
