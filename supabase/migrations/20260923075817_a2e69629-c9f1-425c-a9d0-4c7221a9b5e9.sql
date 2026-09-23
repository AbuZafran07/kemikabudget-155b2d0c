-- Tighten document_sequences: internal numbering counters, only admins/finance need read
DROP POLICY IF EXISTS "Authenticated users can view sequences" ON public.document_sequences;
CREATE POLICY "Privileged users can view sequences"
ON public.document_sequences
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can manage sequences" ON public.document_sequences;
CREATE POLICY "Super admins can manage sequences"
ON public.document_sequences
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- document_templates: org-wide PDF layout, readable by signed-in users only (scope role explicitly)
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.document_templates;
CREATE POLICY "Authenticated users can view templates"
ON public.document_templates
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admins can manage templates" ON public.document_templates;
CREATE POLICY "Super admins can manage templates"
ON public.document_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Signature files: bind reads to the owning user's folder; approver signatures
-- (super_admin/finance/admin) remain readable because they appear on approved documents
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON storage.objects;
CREATE POLICY "Users can view own or approver signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id::text = (storage.foldername(name))[1]
        AND ur.role IN ('super_admin'::app_role, 'finance'::app_role, 'admin'::app_role)
    )
  )
);