-- client_question landing column on atad2_question_prefills, register-trigger
-- pickup, and the prompt-version gating RPC for the "Prepare client questions"
-- panel action.
--
-- DEPLOY ORDER, READ BEFORE APPLYING:
--   APPLY THIS FILE BEFORE 20260610220100_swarm_prompt_v12_client_question.sql,
--   AND REDEPLOY THE prefill-documents EDGE FUNCTION IN THE SAME DEPLOY
--   WINDOW. THE ORDER IS: SCHEMA (THIS FILE) -> EDGE FUNCTION (rsync
--   supabase/functions/prefill-documents/ to
--   /root/supabase-docker/volumes/functions/prefill-documents/ + restart
--   supabase-edge-functions) -> PROMPT (20260610220100). OTHERWISE ROUTE B
--   UPSERTS FAIL ON THE MISSING COLUMN, OR THE MODEL'S client_question IS
--   SILENTLY DROPPED BY THE OLD ZOD SCHEMA.
--
-- Re-runnable: every statement is IF NOT EXISTS / CREATE OR REPLACE /
-- pg_constraint-guarded.

-- ---------------------------------------------------------------------
-- 1) Landing column. analyze.ts truncates to 450 before the upsert; the
--    CHECK is the backstop. 450 fits the v12 We-understand phrasing
--    (1-2 grounding sentences plus one Could-you-please ask).
-- ---------------------------------------------------------------------

ALTER TABLE public.atad2_question_prefills
  ADD COLUMN IF NOT EXISTS client_question text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atad2_question_prefills_client_question_check'
      AND conrelid = 'public.atad2_question_prefills'::regclass
  ) THEN
    ALTER TABLE public.atad2_question_prefills
      ADD CONSTRAINT atad2_question_prefills_client_question_check
      CHECK (client_question IS NULL OR char_length(client_question) <= 450);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) Register-trigger pickup. Full current body re-issued verbatim from
--    20260610190300_open_questions_register.sql (section 5) with ONE diff:
--    CASE A copies NEW.client_question into atad2_open_questions, and the
--    wording refresh COALESCEs it so a re-analysis under an older prompt
--    version (which emits NULL) never wipes existing wording. CASE B/C and
--    the fail-soft EXCEPTION guard are untouched.
-- ---------------------------------------------------------------------

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
          (session_id, question_id, status, source, why_it_matters, client_question)
        VALUES
          (NEW.session_id, NEW.question_id, 'open', 'swarm', NEW.contextual_hint, NEW.client_question)
        ON CONFLICT (session_id, question_id) DO UPDATE
          -- Wording refresh. COALESCE keeps the existing client_question
          -- when a re-analysis from an older prompt version emits null.
          SET why_it_matters = EXCLUDED.why_it_matters,
              client_question = COALESCE(EXCLUDED.client_question, atad2_open_questions.client_question),
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
    -- Fail-soft (see DESIGN DECISION in 20260610190300, section 5): never
    -- sink the swarm upsert.
    RAISE WARNING 'sync_open_questions_from_prefill failed for session % question %: %',
      NEW.session_id, NEW.question_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3) Gating RPC for the "Prepare client questions" panel action.
--    atad2_prompts SELECT is admin-only (20260423100000), so the client
--    cannot read the live prompt version directly, and
--    atad2_prefill_jobs.stage2_prompt_version is the version of the LAST
--    run, not the live prompt, which would gate wrongly. This RPC exposes
--    ONLY the integer version of the active prompt for a key, nothing else.
--    Until this migration is applied the RPC does not exist, the client
--    call errors, and the button stays disabled with an honest hint.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_prompt_version(p_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT version FROM public.atad2_prompts
  WHERE key = p_key AND is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_prompt_version(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_prompt_version(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Make PostgREST pick up the new column and RPC without a restart.
-- ---------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
