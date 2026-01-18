-- =====================================================
-- Security Fix: Require authentication on all sensitive tables
-- This migration ensures unauthenticated users cannot access ANY data
-- =====================================================

-- 1. FUNDING_SOURCES: Add auth requirement to SELECT policies
-- Drop and recreate with auth check
DROP POLICY IF EXISTS "All authenticated users can view active funding sources basic i" ON public.funding_sources;
CREATE POLICY "Authenticated users can view active funding sources"
ON public.funding_sources FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true
);

DROP POLICY IF EXISTS "Finance and super_admin can view all funding source details" ON public.funding_sources;
CREATE POLICY "Finance and super_admin can view all funding source details"
ON public.funding_sources FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true 
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'finance'))
);

-- 2. REQUESTS: Add auth requirement to SELECT policies
DROP POLICY IF EXISTS "Users can view requests in their division" ON public.requests;
CREATE POLICY "Users can view requests in their division"
ON public.requests FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND can_access_division(auth.uid(), division_id)
);

DROP POLICY IF EXISTS "Finance can view approved requests" ON public.requests;
CREATE POLICY "Finance can view approved requests"
ON public.requests FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'finance') 
  AND status IN ('approved', 'paid', 'settled')
);

-- 3. AUDIT_LOGS: Ensure auth requirement on SELECT
DROP POLICY IF EXISTS "Super admins and finance can view all audit logs" ON public.audit_logs;
CREATE POLICY "Super admins and finance can view all audit logs"
ON public.audit_logs FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'finance'))
);

DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can create audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
);

-- 4. BUDGET_MOVEMENTS: Add auth requirement to SELECT policies
DROP POLICY IF EXISTS "Users can view their division budget movements" ON public.budget_movements;
CREATE POLICY "Users can view their division budget movements"
ON public.budget_movements FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM division_budgets db
    WHERE db.id = budget_movements.division_budget_id 
    AND can_access_division(auth.uid(), db.division_id)
  )
);

DROP POLICY IF EXISTS "Finance can view budget movements" ON public.budget_movements;
CREATE POLICY "Finance can view budget movements"
ON public.budget_movements FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'finance')
);

-- 5. DIVISIONS: Add auth requirement to SELECT
DROP POLICY IF EXISTS "Authenticated users can view active divisions" ON public.divisions;
CREATE POLICY "Authenticated users can view active divisions"
ON public.divisions FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true
);

-- 6. COST_CATEGORIES: Add auth requirement to SELECT
DROP POLICY IF EXISTS "Authenticated users can view active categories" ON public.cost_categories;
CREATE POLICY "Authenticated users can view active categories"
ON public.cost_categories FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true
);

-- 7. BUDGET_PERIODS: Add auth requirement to SELECT
DROP POLICY IF EXISTS "Authenticated users can view active periods" ON public.budget_periods;
CREATE POLICY "Authenticated users can view active periods"
ON public.budget_periods FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true
);

-- 8. PROFILES_SECURE VIEW: Already protected by security_invoker=true
-- The view uses security_invoker which means it inherits the caller's permissions
-- and goes through the underlying profiles table's RLS
-- Verify it has security_invoker set (it should from previous migrations)

-- 9. OTP_SECRETS: Already fixed in previous migration with user-scoped policies
-- Just ensure session_must_be_valid is applied
-- (Already done in previous migration)