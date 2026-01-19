-- ============================================================
-- SECURITY FIX: Tighten data exposure in profiles and funding_sources
-- ============================================================

-- 1. Drop and recreate profiles_secure view with stricter field masking
-- Only profile owner and super_admin can see email/phone
DROP VIEW IF EXISTS public.profiles_secure CASCADE;
CREATE VIEW public.profiles_secure
WITH (security_invoker = true)
AS SELECT 
  p.id,
  p.division_id,
  p.full_name,
  p.avatar_url,
  p.is_active,
  p.requires_otp,
  p.created_at,
  p.updated_at,
  -- Email: only visible to profile owner and super_admin
  CASE 
    WHEN auth.uid() = p.id THEN p.email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.email
    ELSE NULL
  END AS email,
  -- Phone: only visible to profile owner and super_admin  
  CASE 
    WHEN auth.uid() = p.id THEN p.phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.phone
    ELSE NULL
  END AS phone
FROM public.profiles p;

-- Grant access to the secure view
GRANT SELECT ON public.profiles_secure TO authenticated;

-- 2. Drop and recreate funding_sources_secure view with stricter access
-- Bank account details ONLY visible to super_admin
DROP VIEW IF EXISTS public.funding_sources_secure CASCADE;
CREATE VIEW public.funding_sources_secure
WITH (security_invoker = true)
AS SELECT 
  fs.id,
  fs.code,
  fs.name,
  fs.type,
  fs.is_active,
  fs.created_at,
  fs.updated_at,
  -- Balance: visible to finance and super_admin (needed for operations)
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.balance
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN fs.balance
    ELSE NULL
  END AS balance,
  -- Bank details: ONLY super_admin can see full details
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.bank_name
    ELSE NULL
  END AS bank_name,
  -- Account number: ONLY super_admin
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_number
    ELSE NULL
  END AS account_number,
  -- Account holder: ONLY super_admin
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_holder
    ELSE NULL
  END AS account_holder
FROM public.funding_sources fs
WHERE fs.is_active = true;

-- Grant access to the secure view
GRANT SELECT ON public.funding_sources_secure TO authenticated;

-- 3. Tighten RLS on base funding_sources table to block finance from seeing bank details
-- First drop existing policy
DROP POLICY IF EXISTS "Finance and super_admin can view all funding source details" ON public.funding_sources;

-- Create policy that only allows super_admin to SELECT from base table
-- Finance users should use the secure view instead
CREATE POLICY "Only super_admin can view full funding source details"
  ON public.funding_sources
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND is_active = true 
    AND has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 4. Tighten RLS on profiles to restrict what finance/admin can see
-- They should use profiles_secure view instead for cross-division access
DROP POLICY IF EXISTS "Profile visibility restricted" ON public.profiles;

-- Users see own profile, super_admin sees all, admins see division (but only via secure view for other users)
CREATE POLICY "Profile visibility restricted"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND (
      -- Can always see own profile
      id = auth.uid()
      -- Super admin can see all
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- 5. Create a minimal funding_source_options view for regular users (just metadata for dropdowns)
DROP VIEW IF EXISTS public.funding_source_options CASCADE;
CREATE VIEW public.funding_source_options
WITH (security_invoker = true)
AS SELECT 
  fs.id,
  fs.code,
  fs.name,
  fs.type,
  fs.is_active
FROM public.funding_sources fs
WHERE fs.is_active = true;

GRANT SELECT ON public.funding_source_options TO authenticated;