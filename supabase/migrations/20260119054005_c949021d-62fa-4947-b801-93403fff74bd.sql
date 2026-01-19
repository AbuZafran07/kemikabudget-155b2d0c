
-- =====================================================================
-- SECURITY FIX: Tighten RLS policies for profiles and funding sources
-- =====================================================================

-- 1. Fix funding_source_options VIEW to use security_invoker
-- This VIEW was allowing bypass of funding_sources RLS
DROP VIEW IF EXISTS public.funding_source_options;

CREATE VIEW public.funding_source_options
WITH (security_invoker = true)
AS SELECT 
  id,
  code,
  name,
  type,
  is_active
FROM public.funding_sources
WHERE is_active = true;

-- Grant SELECT to authenticated users (required for security_invoker views)
GRANT SELECT ON public.funding_source_options TO authenticated;

-- 2. Update funding_sources RLS to allow Finance role SELECT access (for the secure view)
-- First drop the existing restrictive SELECT policy that only allows super_admin
DROP POLICY IF EXISTS "Only super_admin can view full funding source details" ON public.funding_sources;

-- Create a policy that allows both super_admin and finance to SELECT
-- (The view will handle masking of sensitive data)
CREATE POLICY "Finance and super_admin can view funding sources" 
ON public.funding_sources
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true 
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'finance'::app_role)
  )
);

-- Also create a minimal SELECT policy for authenticated users to use funding_source_options view
-- This is needed because security_invoker views check RLS on underlying table
CREATE POLICY "Authenticated users can view basic funding source info" 
ON public.funding_sources
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true
);

-- 3. Fix profiles table - tighten visibility
-- Current policy allows super_admin to see ALL profiles, but Finance/Admin need division-scoped access
DROP POLICY IF EXISTS "Profile visibility restricted" ON public.profiles;

-- Create a more granular visibility policy:
-- - Users can see their own profile
-- - Super Admin can see all profiles
-- - Finance can see all profiles (needed for payment processing)
-- - Admin can only see profiles in their division
CREATE POLICY "Profile visibility by role" 
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Users can always see their own profile
    id = auth.uid()
    -- Super Admin can see all profiles
    OR has_role(auth.uid(), 'super_admin'::app_role)
    -- Finance can see all profiles (needed for payment workflow)
    OR has_role(auth.uid(), 'finance'::app_role)
    -- Admin can only see profiles in their division
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND division_id = get_user_division_id(auth.uid())
    )
    -- Regular users can only see profiles in their own division
    OR division_id = get_user_division_id(auth.uid())
  )
);

-- 4. Update funding_sources_secure view to include masked account for Finance
DROP VIEW IF EXISTS public.funding_sources_secure;

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
  -- Balance visible to finance and super_admin
  CASE
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.balance
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN fs.balance
    ELSE NULL
  END AS balance,
  -- Bank name visible to finance (for payment processing) and super_admin
  CASE
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.bank_name
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN fs.bank_name
    ELSE NULL
  END AS bank_name,
  -- Account number: full for super_admin, masked for finance
  CASE
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_number
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN
      CASE
        WHEN fs.account_number IS NULL THEN NULL
        WHEN LENGTH(fs.account_number) <= 4 THEN '****'
        ELSE CONCAT('****', RIGHT(fs.account_number, 4))
      END
    ELSE NULL
  END AS account_number,
  -- Account holder visible to finance and super_admin
  CASE
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_holder
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN fs.account_holder
    ELSE NULL
  END AS account_holder
FROM public.funding_sources fs
WHERE fs.is_active = true;

GRANT SELECT ON public.funding_sources_secure TO authenticated;

-- 5. Update profiles_secure view to include Admin division-scoped access
DROP VIEW IF EXISTS public.profiles_secure;

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
  -- Email visible only to self and super_admin
  CASE
    WHEN auth.uid() = p.id THEN p.email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.email
    ELSE NULL
  END AS email,
  -- Phone visible only to self and super_admin
  CASE
    WHEN auth.uid() = p.id THEN p.phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.phone
    ELSE NULL
  END AS phone
FROM public.profiles p;

GRANT SELECT ON public.profiles_secure TO authenticated;
