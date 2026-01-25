-- Fix: Restrict profiles table SELECT to only own profile
-- Finance and admin should use profiles_secure view instead which masks email/phone

-- Drop the existing broad visibility policy
DROP POLICY IF EXISTS "Strict profile visibility" ON public.profiles;

-- Create new restrictive policy - only view own profile directly
-- Super admin can still manage all via the "Super admins can manage all profiles" policy
CREATE POLICY "Users can only view own profile directly"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND id = auth.uid()
  );

-- Finance should query profiles_secure view for other profiles
-- Admin should query profiles_secure view for division members
-- This prevents PII (email/phone) from being exposed via direct table access

COMMENT ON POLICY "Users can only view own profile directly" ON public.profiles IS 
  'Users can only directly access their own profile. For viewing other profiles (e.g. names, division info), use the profiles_secure view which masks email and phone.';