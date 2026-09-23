DROP POLICY IF EXISTS "Users can view own or approver signatures" ON storage.objects;

CREATE POLICY "Users can view their own signature"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (select auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Signed-in staff can view approver signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (select auth.uid()) AND p.is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id::text = (storage.foldername(storage.objects.name))[1]
      AND ur.role = ANY (ARRAY['super_admin'::app_role, 'finance'::app_role, 'admin'::app_role])
  )
);