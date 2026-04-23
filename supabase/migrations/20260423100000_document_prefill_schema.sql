-- Document Pre-Fill — schema
-- Tables: atad2_session_documents, atad2_document_summaries,
--         atad2_prefill_jobs, atad2_question_prefills, atad2_prompts

CREATE TABLE atad2_session_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES atad2_sessions(session_id) ON DELETE CASCADE,
  filename text NOT NULL,
  doc_label text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'financial_statements','tax_returns','local_file','master_file',
    'previous_year_atad2_analysis','trial_balance','general_ledger','other'
  )),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 33554432),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','summarizing','summarized','failed'
  )),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_documents_session ON atad2_session_documents(session_id);

CREATE TABLE atad2_document_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES atad2_session_documents(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL,
  token_usage jsonb NOT NULL,
  prompt_version int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atad2_prefill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE REFERENCES atad2_sessions(session_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','stage1_running','stage2_running','completed','failed','cancelled'
  )),
  started_at timestamptz,
  stage1_finished_at timestamptz,
  stage2_finished_at timestamptz,
  failed_at timestamptz,
  error_message text,
  total_token_usage jsonb,
  locked_at timestamptz,
  stage1_prompt_version int,
  stage2_prompt_version int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atad2_question_prefills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES atad2_sessions(session_id) ON DELETE CASCADE,
  question_id text NOT NULL,
  suggested_toelichting text NOT NULL CHECK (length(suggested_toelichting) <= 1000),
  source_refs jsonb NOT NULL,
  verbatim_quote text CHECK (verbatim_quote IS NULL OR length(verbatim_quote) <= 300),
  user_action text NOT NULL DEFAULT 'pending' CHECK (user_action IN (
    'pending','accepted','edited','dismissed','moved_to_additional_context'
  )),
  actioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);
CREATE INDEX idx_question_prefills_session ON atad2_question_prefills(session_id);

CREATE TABLE atad2_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key IN ('prefill_stage1_system','prefill_stage2_system')),
  version int NOT NULL,
  system_prompt text NOT NULL,
  user_prompt_template text,
  model text NOT NULL DEFAULT 'claude-opus-4-7',
  temperature numeric NOT NULL DEFAULT 0,
  max_tokens int NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);
CREATE UNIQUE INDEX uniq_atad2_prompts_active
  ON atad2_prompts(key) WHERE is_active = true;

-- Enable RLS
ALTER TABLE atad2_session_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE atad2_document_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE atad2_prefill_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE atad2_question_prefills ENABLE ROW LEVEL SECURITY;
ALTER TABLE atad2_prompts ENABLE ROW LEVEL SECURITY;

-- RLS: session-scoped tables (pattern mirrors atad2_answers from
-- migration 20250807190245)

CREATE POLICY "Users can view their session documents"
  ON atad2_session_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_session_documents.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their session documents"
  ON atad2_session_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_session_documents.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their session documents"
  ON atad2_session_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_session_documents.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their session documents"
  ON atad2_session_documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_session_documents.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

-- Summaries: read-only for users (service role writes)
CREATE POLICY "Users can view their document summaries"
  ON atad2_document_summaries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atad2_session_documents d
    JOIN atad2_sessions s ON s.session_id = d.session_id
    WHERE d.id = atad2_document_summaries.document_id
    AND s.user_id = auth.uid()
  ));

-- Prefill jobs: session-scoped
CREATE POLICY "Users can view their prefill job"
  ON atad2_prefill_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their prefill job"
  ON atad2_prefill_jobs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

-- Question prefills: user can read all, update user_action only
CREATE POLICY "Users can view their question prefills"
  ON atad2_question_prefills FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_question_prefills.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their question prefills"
  ON atad2_question_prefills FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_question_prefills.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

-- Prompts: admin-only, uses has_role() from migration 20250808200440
CREATE POLICY "Admins can view prompts"
  ON atad2_prompts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert prompts"
  ON atad2_prompts FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update prompts"
  ON atad2_prompts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Note: active-prompt reads from the Edge Function use the service role,
-- which bypasses RLS. End users never query atad2_prompts directly.
