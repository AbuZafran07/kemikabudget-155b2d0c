-- Fix profiles_secure view to use security_invoker for RLS enforcement
-- and ensure email/phone masking is properly applied

-- Drop and recreate the view with security_invoker = true
DROP VIEW IF EXISTS public.profiles_secure;

CREATE OR REPLACE VIEW public.profiles_secure
WITH (security_invoker = true)
AS 
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
    ELSE concat(left(email, 3), '***@***')
  END AS email,
  -- Mask phone for non-privileged users
  CASE
    WHEN id = auth.uid() THEN phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN phone
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN phone
    ELSE 
      CASE
        WHEN phone IS NOT NULL THEN concat(left(phone, 4), '****')
        ELSE NULL
      END
  END AS phone
FROM profiles;

-- Update the profiles table SELECT policy to be more restrictive
-- Users should only see:
-- 1. Their own profile (full access)
-- 2. Same division profiles (limited fields via profiles_secure view)
-- 3. Super admin/finance/admin see all

-- First drop the existing policy that's too permissive
DROP POLICY IF EXISTS "Secure profile visibility" ON profiles;

-- Create proper SELECT policy for profiles table
-- This policy works with the profiles_secure view which masks sensitive fields
CREATE POLICY "Secure profile visibility"
ON profiles FOR SELECT
USING (
  -- Own profile
  id = auth.uid()
  -- Super admin sees all
  OR has_role(auth.uid(), 'super_admin'::app_role)
  -- Finance sees all
  OR has_role(auth.uid(), 'finance'::app_role)
  -- Admin sees their division
  OR (has_role(auth.uid(), 'admin'::app_role) AND division_id = get_user_division_id(auth.uid()))
  -- Regular users can see profiles in their division (but via profiles_secure which masks sensitive fields)
  OR (division_id IS NOT NULL AND division_id = get_user_division_id(auth.uid()))
);

-- Add comment to explain the security model
COMMENT ON VIEW public.profiles_secure IS 'Secure view that masks email and phone for non-privileged users. Uses security_invoker=true to respect RLS on base profiles table. Application code should query this view instead of profiles directly for listing users.';