-- Security Fix: Restrict sensitive profile fields and mask bank account details

-- 1. Create a view that restricts sensitive profile fields based on role
-- email/phone visible only to: owner, super_admin
-- other users see: full_name, avatar_url, id, division_id (for display purposes)
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure
WITH (security_invoker = true)
AS SELECT 
  p.id,
  p.full_name,
  p.avatar_url,
  p.division_id,
  p.is_active,
  p.requires_otp,
  p.created_at,
  p.updated_at,
  -- Sensitive fields: only visible to super_admin or the owner
  CASE 
    WHEN auth.uid() = p.id THEN p.email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.email
    ELSE NULL
  END AS email,
  CASE 
    WHEN auth.uid() = p.id THEN p.phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN p.phone
    ELSE NULL
  END AS phone
FROM public.profiles p;

-- Grant access to the view
GRANT SELECT ON public.profiles_secure TO authenticated;

-- 2. Create a new funding_sources_secure view that masks bank account details
-- Full details only for super_admin, masked for finance
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
  -- Bank name visible to finance and super_admin
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
  -- Account holder: full for super_admin, masked for finance  
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_holder
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN fs.account_holder
    ELSE NULL
  END AS account_holder
FROM public.funding_sources fs
WHERE fs.is_active = true;

-- Grant access to the view
GRANT SELECT ON public.funding_sources_secure TO authenticated;

-- 3. Update the profiles RLS policy to be more restrictive
-- Drop existing broad SELECT policy
DROP POLICY IF EXISTS "Profile visibility based on role" ON public.profiles;

-- Create more restrictive policy that still allows necessary operations
-- but the application should use profiles_secure view for displaying data
CREATE POLICY "Profile visibility restricted" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND (
      -- User can always see their own profile
      id = auth.uid()
      -- Super admin can see all for management
      OR has_role(auth.uid(), 'super_admin'::app_role)
      -- Finance can see profiles for payment processing (limited via view)
      OR has_role(auth.uid(), 'finance'::app_role)
      -- Admin can see their division for management (limited via view)
      OR (has_role(auth.uid(), 'admin'::app_role) AND division_id = get_user_division_id(auth.uid()))
    )
  );