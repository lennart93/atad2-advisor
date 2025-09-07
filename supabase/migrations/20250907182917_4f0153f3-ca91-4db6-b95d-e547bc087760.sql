-- Create RLS policy to allow authenticated users to read template files
CREATE POLICY "Allow authenticated users to read template files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'templates');