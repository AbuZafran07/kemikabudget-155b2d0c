-- Fix INSERT policy for requests table
-- The current policy requires division_id to match user's division
-- But super_admin should be able to create requests for any division

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create requests in their division" ON public.requests;

-- Create a new INSERT policy that allows:
-- 1. Super admins to create requests for any division
-- 2. Regular users to create requests only in their own division
CREATE POLICY "Users can create requests in their division" 
ON public.requests
FOR INSERT
WITH CHECK (
  (requester_id = auth.uid()) AND
  (
    has_role(auth.uid(), 'super_admin') OR 
    (division_id = get_user_division_id(auth.uid()))
  )
);