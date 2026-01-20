-- ROLLBACK: Remove the overly permissive policy we just added
-- This policy was incorrect because it allows users to query funding_sources directly
-- which would expose all columns including sensitive bank details

DROP POLICY IF EXISTS "Authenticated users can view funding source options" ON public.funding_sources;

-- The correct approach:
-- 1. The funding_source_options view is used for dropdown population (only id, code, name, type, is_active)
-- 2. The base funding_sources table is only accessible to finance/super_admin via existing policies
-- 3. Applications should query funding_source_options for dropdowns, not funding_sources directly

-- However, since funding_source_options uses SECURITY INVOKER and needs to query funding_sources,
-- we need a way to allow the view to work. The solution is to use a database function.

-- Create a function that returns funding source options for authenticated users
CREATE OR REPLACE FUNCTION public.get_funding_source_options()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  type text,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fs.id, fs.code, fs.name, fs.type, fs.is_active
  FROM public.funding_sources fs
  WHERE fs.is_active = true
  AND auth.uid() IS NOT NULL;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_funding_source_options() TO authenticated;

COMMENT ON FUNCTION public.get_funding_source_options() IS 'Returns non-sensitive funding source options for dropdown menus. Only exposes id, code, name, type - no bank details or balances.';