CREATE POLICY "Reviewers can view all signatures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active)
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['super_admin'::app_role,'executive'::app_role,'finance'::app_role,'admin'::app_role]))
);