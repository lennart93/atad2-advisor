-- Document Pre-Fill — Storage bucket
-- Bucket: session-documents (private; RLS enforces user-only access)

INSERT INTO storage.buckets (id, name, public)
VALUES ('session-documents', 'session-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Path layout: {user_id}/{session_id}/{doc_uuid}.{ext}
-- Users can only touch paths whose first segment is their own auth.uid().

CREATE POLICY "Users can read their own session documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload their own session documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own session documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
