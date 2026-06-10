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
