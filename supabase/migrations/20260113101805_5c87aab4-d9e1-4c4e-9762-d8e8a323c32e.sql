-- Add explicit RLS policy for otp_rate_limits to satisfy linter
-- Only super_admin can view rate limit data for monitoring purposes
CREATE POLICY "Super admin can view OTP rate limits"
  ON public.otp_rate_limits
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'));

-- Note: INSERT/UPDATE/DELETE are handled by SECURITY DEFINER functions
-- which use service role, bypassing RLS entirely