
-- Fix RLS policy to allow users to create requests using public budget categories from other divisions
-- Business rule: Users can use budgets from their own division OR from any division that has
-- allocated budget for a PUBLIC category they are requesting

-- First, create a helper function to check if a category is public and has budget in the target division
CREATE OR REPLACE FUNCTION public.can_use_division_budget(
  _user_id UUID,
  _division_id UUID,
  _category_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Case 1: User's own division - always allowed
    SELECT 1 WHERE _division_id = get_user_division_id(_user_id)
    
    UNION
    
    -- Case 2: Public category with budget allocation in target division
    SELECT 1
    FROM cost_categories cc
    JOIN division_budgets db ON db.category_id = cc.id
    JOIN budget_periods bp ON bp.id = db.period_id
    WHERE cc.id = _category_id
      AND cc.is_public = true
      AND cc.is_active = true
      AND db.division_id = _division_id
      AND db.allocated_amount > db.used_amount  -- Has remaining budget
      AND bp.is_active = true
      AND bp.is_closed = false
  );
$$;

-- Add comment to document the function
COMMENT ON FUNCTION public.can_use_division_budget(UUID, UUID, UUID) IS 
'Security definer function to check if a user can create a request using a specific division budget. 
Returns true if: 
1) The division is the users own division, OR
2) The category is public AND has available budget allocation in the target division.
Used by RLS policies on requests table to enable cross-division budget usage for public categories.';

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can create requests in their division" ON requests;

-- Create updated INSERT policy that allows cross-division budget usage for public categories
CREATE POLICY "Users can create requests with valid budget access"
ON requests FOR INSERT
WITH CHECK (
  requester_id = auth.uid()
  AND (
    -- Super admin, admin, finance can use any division budget
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'finance'::app_role) OR 
    -- Regular users: own division OR public category with budget in target division
    can_use_division_budget(auth.uid(), division_id, category_id)
  )
);

-- Add comment to document the policy
COMMENT ON POLICY "Users can create requests with valid budget access" ON requests IS 
'Allows users to create requests if:
1) They are super_admin, admin, or finance (can use any division budget)
2) They are regular users creating request in their own division
3) They are regular users using a PUBLIC category that has budget allocation in the target division';
