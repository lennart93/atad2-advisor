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
