-- App-wide user feedback. Submitted via the floating Feedback button
-- in the bottom-right corner. Visible to admins/moderators only via
-- /admin/feedback (no email, no n8n).

CREATE TABLE public.atad2_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  text NOT NULL,
  category    text NOT NULL CHECK (category IN ('bug', 'idea', 'question', 'other')),
  message     text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  page_url    text,
  user_agent  text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'done')),
  admin_notes text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_atad2_feedback_status_created
  ON public.atad2_feedback (status, created_at DESC);
CREATE INDEX idx_atad2_feedback_user_id
  ON public.atad2_feedback (user_id);

-- Keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.touch_atad2_feedback_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atad2_feedback_touch_updated_at
  BEFORE UPDATE ON public.atad2_feedback
  FOR EACH ROW EXECUTE FUNCTION public.touch_atad2_feedback_updated_at();

ALTER TABLE public.atad2_feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may submit feedback as themselves.
CREATE POLICY "Users insert own feedback"
  ON public.atad2_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Staff (admin / moderator) can read everything.
CREATE POLICY "Staff read all feedback"
  ON public.atad2_feedback FOR SELECT
  TO authenticated
  USING (has_admin_access(auth.uid()));

-- Staff can triage (update status, admin_notes).
CREATE POLICY "Staff update feedback"
  ON public.atad2_feedback FOR UPDATE
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

-- Staff can delete (e.g. spam).
CREATE POLICY "Staff delete feedback"
  ON public.atad2_feedback FOR DELETE
  TO authenticated
  USING (has_admin_access(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atad2_feedback TO authenticated;
