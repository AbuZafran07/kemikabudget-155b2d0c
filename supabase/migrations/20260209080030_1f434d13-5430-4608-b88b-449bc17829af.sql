-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create requests in their division" ON public.requests;

-- Create new INSERT policy that allows:
-- 1. Super Admin and Admin can create requests for any division
-- 2. Regular users can only create requests for their own division
CREATE POLICY "Users can create requests in their division"
ON public.requests
FOR INSERT
TO authenticated
WITH CHECK (
  requester_id = auth.uid() 
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
    OR division_id = get_user_division_id(auth.uid())
  )
);