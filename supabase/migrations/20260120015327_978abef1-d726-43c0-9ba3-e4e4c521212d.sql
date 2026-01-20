-- Fix: Remove user SELECT policy on otp_secrets to prevent secret retrieval after setup
-- OTP secrets should only be provided once during initial setup via the edge function
-- Super_admin access and user INSERT/UPDATE/DELETE policies remain for proper functionality

DROP POLICY IF EXISTS "Users can view their own OTP secret" ON public.otp_secrets;