
-- Update RLS policy on division_budgets to allow users to see public category budgets from ANY division
-- This enables cross-division budget access for public categories (like HRGA shared budgets)

-- First, drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their division budgets" ON public.division_budgets;
DROP POLICY IF EXISTS "Users can view division budgets" ON public.division_budgets;

-- Create new SELECT policy that allows:
-- 1. super_admin/finance: can see all budgets
-- 2. Other users: can see their own division budgets OR budgets with public categories
CREATE POLICY "Users can view division budgets" 
ON public.division_budgets FOR SELECT
TO authenticated
USING (
  -- Super admin and finance can see all
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'finance') OR
  -- Users can see their own division budgets
  can_access_division(auth.uid(), division_id) OR
  -- Users can see budgets with public categories (for cross-division requests like HRGA)
  EXISTS (
    SELECT 1 FROM public.cost_categories cc
    WHERE cc.id = category_id AND cc.is_public = true
  )
);
