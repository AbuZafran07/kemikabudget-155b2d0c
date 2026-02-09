
-- Drop and recreate INSERT policy to include all authenticated users properly
DROP POLICY IF EXISTS "Users can create requests in their division" ON public.requests;

-- Create comprehensive INSERT policy:
-- 1. Super Admin can create for any division
-- 2. Admin can create for any division  
-- 3. Finance can create for any division
-- 4. Regular users can only create for their own division
CREATE POLICY "Users can create requests in their division"
ON public.requests
FOR INSERT
TO authenticated
WITH CHECK (
  requester_id = auth.uid() 
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR division_id = get_user_division_id(auth.uid())
  )
);
