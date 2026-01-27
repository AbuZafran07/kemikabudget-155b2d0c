-- Fix: Restrict notification_logs access to super_admin only (remove finance access)
-- This prevents finance staff from viewing email recipients and notification content

-- Drop the existing policy
DROP POLICY IF EXISTS "Super admin and finance can view notification logs" ON public.notification_logs;

-- Create new policy for super_admin only
CREATE POLICY "Super admin can view notification logs" 
ON public.notification_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'::app_role
  )
);