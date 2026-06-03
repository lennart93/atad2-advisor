-- Allow admins to purge entries from the permanent assessment log.
-- Used by the admin Sessions UI to clean up test noise: clicking the
-- trash icon on a 'deleted' row in /admin/sessions wipes every event
-- for that session_uuid so the row stops showing up in the overview.
-- Real user deletions remain in the log unless an admin explicitly
-- purges them.

CREATE POLICY "Staff can purge assessment log entries"
  ON public.atad2_assessment_log FOR DELETE
  TO authenticated
  USING (has_admin_access(auth.uid()));
