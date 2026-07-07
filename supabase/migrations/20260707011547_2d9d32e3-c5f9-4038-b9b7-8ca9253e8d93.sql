
DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can create audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);
