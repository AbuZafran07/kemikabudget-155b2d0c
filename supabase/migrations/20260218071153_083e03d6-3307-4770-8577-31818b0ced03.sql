
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can update their own draft claims" ON public.medical_claims;

-- Create new policy allowing edit before approval
CREATE POLICY "Users can update their own pre-approval claims"
ON public.medical_claims
FOR UPDATE
USING (
  (employee_id = auth.uid()) 
  AND (status IN ('draft', 'submitted', 'review_hrga'))
  AND (is_locked = false)
)
WITH CHECK (
  (employee_id = auth.uid()) 
  AND (status IN ('draft', 'submitted', 'review_hrga'))
  AND (is_locked = false)
);
