-- Allow admins to manage atad2_context_questions via the admin UI.
-- Previously the table had only a SELECT policy, so the admin Context
-- Questions page hit "new row violates row-level security policy" on
-- every INSERT/UPDATE/DELETE.

CREATE POLICY "Admins can insert context questions"
  ON public.atad2_context_questions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update context questions"
  ON public.atad2_context_questions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete context questions"
  ON public.atad2_context_questions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
