-- Fix the SECURITY DEFINER view warning by explicitly using SECURITY INVOKER
-- This ensures the view runs with the permissions of the querying user, not the view creator

DROP VIEW IF EXISTS public.funding_sources_secure;

CREATE VIEW public.funding_sources_secure 
WITH (security_invoker = true)
AS
SELECT 
  fs.id,
  fs.code,
  fs.name,
  fs.type,
  fs.is_active,
  fs.created_at,
  fs.updated_at,
  fs.balance,
  fs.bank_name,
  -- Only super_admin sees full account details, finance sees masked
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_number
    WHEN fs.account_number IS NOT NULL AND LENGTH(fs.account_number) >= 8 THEN 
      LEFT(fs.account_number, 4) || '****' || RIGHT(fs.account_number, 4)
    WHEN fs.account_number IS NOT NULL THEN '****'
    ELSE NULL
  END as account_number,
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_holder
    ELSE fs.account_holder
  END as account_holder
FROM public.funding_sources fs
WHERE 
  auth.uid() IS NOT NULL 
  AND fs.is_active = true
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'finance'::app_role)
  );

GRANT SELECT ON public.funding_sources_secure TO authenticated;

COMMENT ON VIEW public.funding_sources_secure IS 
'Secure view for funding sources with SECURITY INVOKER. Masks account numbers for non-super_admin users.';