-- Fix the security definer view issue by recreating as SECURITY INVOKER
DROP VIEW IF EXISTS public.funding_source_options;

-- Recreate view with explicit SECURITY INVOKER
CREATE VIEW public.funding_source_options 
WITH (security_invoker = true)
AS
SELECT id, code, name, type, is_active
FROM public.funding_sources
WHERE is_active = true;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.funding_source_options TO authenticated;