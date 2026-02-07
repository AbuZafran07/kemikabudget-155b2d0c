
-- =====================================================
-- FIX 1: Recreate profiles_secure view with security_invoker = true
-- This ensures the base table's RLS is enforced on the view
-- =====================================================

DROP VIEW IF EXISTS public.profiles_secure;

CREATE VIEW public.profiles_secure
WITH (security_invoker = true) AS
SELECT 
  id,
  full_name,
  avatar_url,
  division_id,
  is_active,
  requires_otp,
  created_at,
  updated_at,
  -- Mask email for non-privileged users
  CASE
    WHEN id = auth.uid() THEN email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN email
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN email
    ELSE CONCAT(LEFT(email, 3), '***@***')
  END AS email,
  -- Mask phone for non-privileged users
  CASE
    WHEN id = auth.uid() THEN phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN phone
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN phone
    ELSE CASE
      WHEN phone IS NOT NULL THEN CONCAT(LEFT(phone, 4), '****')
      ELSE NULL::text
    END
  END AS phone
FROM public.profiles;

-- =====================================================
-- FIX 2: Tighten profiles table RLS policy
-- Remove same-division access for regular users
-- Only allow: own profile, super_admin, finance, admin
-- =====================================================

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Secure profile visibility" ON public.profiles;

-- Create a stricter SELECT policy:
-- - Users can view their own profile
-- - Super Admin can view all profiles  
-- - Finance can view all profiles (needed for payment processing)
-- - Admin can view profiles in their division (needed for approval workflows)
-- - Regular users CANNOT view other profiles (removes same-division access for regular users)
CREATE POLICY "Secure profile visibility"
ON public.profiles FOR SELECT
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND division_id IS NOT NULL
    AND division_id = get_user_division_id(auth.uid())
  )
);
