-- =====================================================
-- Security Fix: Restrict funding_sources access
-- Only finance and super_admin should see bank details
-- Regular users need a view with limited columns
-- =====================================================

-- 1. Drop the overly permissive policy that allows all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view active funding sources" ON public.funding_sources;

-- 2. Keep only the finance/super_admin policy for full access
-- (Already exists: "Finance and super_admin can view all funding source details")

-- 3. Create a secure view for regular users to see only non-sensitive funding source info
-- This view will be used by the frontend for dropdown selection
DROP VIEW IF EXISTS public.funding_source_options;

CREATE OR REPLACE VIEW public.funding_source_options
WITH (security_invoker = true)
AS
SELECT 
  id,
  code,
  name,
  type,
  is_active
FROM public.funding_sources
WHERE is_active = true;

-- 4. Grant SELECT on the view to authenticated users
GRANT SELECT ON public.funding_source_options TO authenticated;

-- 5. Add a comment explaining the security model
COMMENT ON VIEW public.funding_source_options IS 'Public view exposing only non-sensitive funding source data (id, code, name, type) for dropdown selection. Sensitive bank details (account_number, bank_name, account_holder, balance) are only accessible via direct table access by finance and super_admin roles.';

-- 6. For regular users who need to see funding source name in requests,
-- Create a policy that only returns basic columns via RLS
-- Since RLS cannot restrict columns, we rely on:
--   a) The view above for dropdowns
--   b) Application-level column selection (already implemented in hooks)
--   c) Removing the permissive policy (done in step 1)