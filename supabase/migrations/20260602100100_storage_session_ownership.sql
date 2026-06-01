-- M1: Storage policies now validate BOTH path segments.
--
-- Previous policies only checked that the first segment of the storage path
-- matched auth.uid(). The path layout is {user_id}/{session_id}/{doc_uuid}.ext,
-- so a user could create or address objects under arbitrary session_id
-- folders inside their own user folder. That was not a cross-user read, but
-- it was a defense-in-depth gap: storage and database were not enforcing the
-- same ownership shape.
--
-- This migration replaces the three policies so that the {session_id}
-- segment must correspond to a session the caller actually owns in
-- atad2_sessions.

DROP POLICY IF EXISTS "Users can read their own session documents"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own session documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own session documents" ON storage.objects;

CREATE POLICY "Users can read their own session documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );

CREATE POLICY "Users can upload their own session documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own session documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );
