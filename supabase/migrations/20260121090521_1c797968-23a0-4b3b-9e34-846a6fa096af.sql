-- Fix 1: Enable RLS on funding_source_options view (note: it's a view, we need to ensure authenticated access)
-- The view funding_source_options already exists, but views don't support RLS directly
-- We need to ensure access is controlled via the underlying table or a security definer function

-- Fix 2: Make avatars bucket private and update storage policies
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

-- Drop the public access policy
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Create authenticated-only access policy for avatars
CREATE POLICY "Authenticated users can view avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');