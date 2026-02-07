-- Fix employee_medical_budgets RLS: Restrict admin access to only HRGA division admins
-- The current policy allows ANY admin to view ALL medical budgets, which is too permissive
-- Only HRGA division admins should have access to employee medical budget data

-- Drop the overly permissive admin policy
DROP POLICY IF EXISTS "HRGA can view all medical budgets" ON public.employee_medical_budgets;

-- Create a more restrictive policy: Only admins in HRGA division can view medical budgets
CREATE POLICY "HRGA division admins can view all medical budgets" 
ON public.employee_medical_budgets
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.code = 'HRGA' 
    AND d.id = get_user_division_id(auth.uid())
  )
);

-- Also ensure finance policy only applies to finance role (already exists but verify)
-- No changes needed to other policies as they are correctly scoped