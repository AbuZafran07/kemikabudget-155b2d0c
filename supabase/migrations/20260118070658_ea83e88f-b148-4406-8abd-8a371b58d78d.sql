-- =====================================================
-- Security Fix: Consolidate profiles SELECT policies
-- Clean up overlapping policies and ensure clear access control
-- =====================================================

-- 1. Drop all existing SELECT policies on profiles to start fresh
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view division profiles" ON public.profiles;
DROP POLICY IF EXISTS "Finance can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- 2. Create a single, clear consolidated SELECT policy
-- This policy explicitly defines who can see what:
-- - Regular users: Only their own profile
-- - Admin: Own profile + division members
-- - Finance: All profiles (for payment processing)
-- - Super Admin: All profiles (full system access)
CREATE POLICY "Profile visibility based on role"
ON public.profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Users can always see their own profile
    id = auth.uid()
    -- Super admins can see all profiles
    OR has_role(auth.uid(), 'super_admin'::app_role)
    -- Finance can see all profiles (needed for payment beneficiary info)
    OR has_role(auth.uid(), 'finance'::app_role)
    -- Admins can see profiles within their division
    OR (
      has_role(auth.uid(), 'admin'::app_role) 
      AND division_id = get_user_division_id(auth.uid())
    )
  )
);

-- 3. Add comment explaining the security model
COMMENT ON POLICY "Profile visibility based on role" ON public.profiles IS 
'Enforces role-based profile visibility: Regular users see only their own profile. Admins see their division members. Finance and Super Admin see all profiles for operational needs. Email and phone are exposed only to authorized viewers per this policy.';