-- =====================================================
-- Security Fix: Strengthen RLS on profiles and otp_secrets tables
-- =====================================================

-- PROFILES TABLE: Add explicit authentication policy
-- The existing policies require roles but don't explicitly block anonymous access
-- Adding a base policy that requires authentication for ANY operation

-- First, drop and recreate the "Users can view own profile" policy to ensure proper auth requirement
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Create a policy that requires authentication for viewing profiles (covers all cases)
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    id = auth.uid() OR 
    has_role(auth.uid(), 'super_admin') OR 
    has_role(auth.uid(), 'finance') OR 
    (has_role(auth.uid(), 'admin') AND division_id = get_user_division_id(auth.uid()))
  )
);

-- OTP_SECRETS TABLE: Add user-scoped policies
-- Users should only be able to access their OWN OTP secrets
-- Super admin access is already covered, but regular users need their own policies

-- Add policy for users to view their own OTP secret
DROP POLICY IF EXISTS "Users can view their own OTP secret" ON public.otp_secrets;
CREATE POLICY "Users can view their own OTP secret"
ON public.otp_secrets FOR SELECT
USING (user_id = auth.uid());

-- Add policy for users to insert their own OTP secret
DROP POLICY IF EXISTS "Users can insert their own OTP secret" ON public.otp_secrets;
CREATE POLICY "Users can insert their own OTP secret"
ON public.otp_secrets FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Add policy for users to update their own OTP secret
DROP POLICY IF EXISTS "Users can update their own OTP secret" ON public.otp_secrets;
CREATE POLICY "Users can update their own OTP secret"
ON public.otp_secrets FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add policy for users to delete their own OTP secret (for resetting 2FA)
DROP POLICY IF EXISTS "Users can delete their own OTP secret" ON public.otp_secrets;
CREATE POLICY "Users can delete their own OTP secret"
ON public.otp_secrets FOR DELETE
USING (user_id = auth.uid());