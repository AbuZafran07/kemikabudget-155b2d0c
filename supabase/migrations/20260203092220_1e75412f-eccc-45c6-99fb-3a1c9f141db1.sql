
-- Fix: Add security_invoker to funding_source_options view
-- This ensures the view respects RLS policies on the underlying funding_sources table
-- Only authenticated users with appropriate roles can access this data

-- Drop and recreate the view with security_invoker = true
DROP VIEW IF EXISTS public.funding_source_options;

CREATE VIEW public.funding_source_options
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

-- Grant usage to authenticated users (actual access controlled by funding_sources RLS)
GRANT SELECT ON public.funding_source_options TO authenticated;

COMMENT ON VIEW public.funding_source_options IS 'Secure view of active funding sources. Uses security_invoker to enforce RLS from underlying funding_sources table.';
