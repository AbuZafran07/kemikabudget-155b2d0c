-- notification_logs is written only by the notification edge function (service role).
-- Remove the permissive ALL policy that let any signed-in user insert/update/delete rows.
DROP POLICY IF EXISTS "session_must_be_valid" ON public.notification_logs;

CREATE POLICY "session_must_be_valid"
ON public.notification_logs
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid());

DROP POLICY IF EXISTS "Super admin can view notification logs" ON public.notification_logs;
CREATE POLICY "Super admin can view notification logs"
ON public.notification_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

REVOKE ALL ON public.notification_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notification_logs FROM authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;