-- Supabase storage policy snippets for product-images
-- Recommended: use server-side (service role) uploads and keep bucket private.

-- 1) Allow authenticated users to INSERT (if allowing client-side uploads)
CREATE POLICY "Allow authenticated inserts" ON storage.objects
  FOR INSERT
  WITH CHECK ( auth.role() = 'authenticated' );

-- 2) Allow owners to DELETE their own objects
CREATE POLICY "Allow owners to delete their objects" ON storage.objects
  FOR DELETE
  USING ( owner = auth.uid() );

-- 3) Allow public SELECT for a specific bucket (optional if bucket not public)
CREATE POLICY "Public read for product-images" ON storage.objects
  FOR SELECT
  USING ( bucket_id = 'product-images' );

-- Notes:
-- - If you set the bucket public via Supabase dashboard or CLI, the SELECT policy is unnecessary.
-- - Using the service-role key server-side is the most secure approach for uploads.
-- - If using client-side uploads with the anon key, ensure CORS and file size limits are configured.
