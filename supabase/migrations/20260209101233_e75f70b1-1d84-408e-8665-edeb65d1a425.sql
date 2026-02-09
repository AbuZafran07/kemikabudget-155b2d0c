
-- Fix: Allow users to submit their own draft requests
-- The issue is that the current UPDATE policy only allows updating while status = draft
-- But when submitting, we're changing status FROM draft TO submitted, so the policy blocks it

-- Drop and recreate the update policy to handle submit case
DROP POLICY IF EXISTS "Users can update their own draft requests" ON public.requests;

-- Create a more flexible update policy for draft owners that allows:
-- 1. Editing fields while in draft status
-- 2. Submitting (changing status to submitted) if currently in draft
CREATE POLICY "Users can update and submit own draft requests"
ON public.requests
FOR UPDATE
TO authenticated
USING (
  requester_id = auth.uid() 
  AND status = 'draft'
  AND is_locked = false
)
WITH CHECK (
  requester_id = auth.uid()
  AND is_locked = false
  AND (
    -- Either staying in draft (editing)
    status = 'draft'
    -- Or submitting the request
    OR status = 'submitted'
  )
);
