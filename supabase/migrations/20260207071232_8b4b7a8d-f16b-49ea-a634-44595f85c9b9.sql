-- ===========================================
-- FIX: Remove overly permissive profile policy
-- ===========================================

-- Drop the overly permissive policy that exposes all profiles to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON public.profiles;

-- Drop redundant/duplicate policies
DROP POLICY IF EXISTS "Finance can view profiles for reporting" ON public.profiles;
DROP POLICY IF EXISTS "HRGA can view profiles for claims processing" ON public.profiles;
DROP POLICY IF EXISTS "Users can only view own profile" ON public.profiles;

-- Create a consolidated, secure SELECT policy
-- Users can see: their own profile, same division members, or if privileged role
CREATE POLICY "Secure profile visibility" 
ON public.profiles 
FOR SELECT 
USING (
  id = auth.uid() -- Own profile
  OR has_role(auth.uid(), 'super_admin') -- Super admin sees all
  OR has_role(auth.uid(), 'finance') -- Finance sees all for reporting
  OR has_role(auth.uid(), 'admin') -- Admin sees all for approvals
  OR (
    -- Same division members can see each other
    division_id IS NOT NULL 
    AND division_id = get_user_division_id(auth.uid())
  )
);

-- ===========================================
-- FIX: Secure the profiles_secure view
-- The view uses security_invoker = true, so it inherits RLS from profiles
-- But we need to ensure the view itself cannot be accessed directly without RLS
-- ===========================================

-- Recreate the profiles_secure view with security_invoker to ensure RLS is enforced
DROP VIEW IF EXISTS public.profiles_secure;

CREATE VIEW public.profiles_secure
WITH (security_invoker = true)
AS SELECT 
  id,
  full_name,
  avatar_url,
  division_id,
  is_active,
  requires_otp,
  created_at,
  updated_at,
  -- Mask email: show only for own profile or privileged roles
  CASE 
    WHEN id = auth.uid() THEN email
    WHEN has_role(auth.uid(), 'super_admin') THEN email
    WHEN has_role(auth.uid(), 'finance') THEN email
    ELSE CONCAT(LEFT(email, 3), '***@***')
  END as email,
  -- Mask phone: show only for own profile or privileged roles
  CASE 
    WHEN id = auth.uid() THEN phone
    WHEN has_role(auth.uid(), 'super_admin') THEN phone
    WHEN has_role(auth.uid(), 'finance') THEN phone
    ELSE CASE WHEN phone IS NOT NULL THEN CONCAT(LEFT(phone, 4), '****') ELSE NULL END
  END as phone
FROM public.profiles;