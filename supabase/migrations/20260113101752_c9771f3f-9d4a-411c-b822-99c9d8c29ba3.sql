-- =====================================================
-- Database-backed OTP Rate Limiting
-- Fix: Replace in-memory rate limiting with persistent storage
-- =====================================================

-- Create OTP rate limits table
CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  total_failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions use service role key)
-- No policies needed for authenticated users - they should not access this directly

-- Create function to check and update rate limit atomically
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record otp_rate_limits%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_max_attempts INTEGER := 5;
  v_window_ms INTEGER := 300000; -- 5 minutes in milliseconds
  v_lockout_ms INTEGER := 900000; -- 15 minutes lockout
  v_max_total_failures INTEGER := 20; -- After 20 total failures, require admin reset
BEGIN
  -- Get or create rate limit record with row lock
  SELECT * INTO v_record FROM otp_rate_limits WHERE user_id = p_user_id FOR UPDATE;
  
  IF NOT FOUND THEN
    -- First attempt for this user
    INSERT INTO otp_rate_limits (user_id, attempt_count, window_start, total_failed_attempts)
    VALUES (p_user_id, 1, v_now, 0);
    
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', v_max_attempts - 1,
      'locked', false
    );
  END IF;
  
  -- Check if permanently locked (too many total failures)
  IF v_record.total_failed_attempts >= v_max_total_failures THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'locked', true,
      'permanent_lock', true,
      'error', 'Account locked due to too many failed attempts. Contact administrator.'
    );
  END IF;
  
  -- Check if temporarily locked
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'locked', true,
      'locked_until', v_record.locked_until
    );
  END IF;
  
  -- Check if window has expired (reset counter)
  IF EXTRACT(EPOCH FROM (v_now - v_record.window_start)) * 1000 > v_window_ms THEN
    -- Reset window
    UPDATE otp_rate_limits SET
      attempt_count = 1,
      window_start = v_now,
      locked_until = NULL,
      updated_at = v_now
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', v_max_attempts - 1,
      'locked', false
    );
  END IF;
  
  -- Check if max attempts reached
  IF v_record.attempt_count >= v_max_attempts THEN
    -- Lock for 15 minutes
    UPDATE otp_rate_limits SET
      locked_until = v_now + (v_lockout_ms || ' milliseconds')::INTERVAL,
      updated_at = v_now
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'locked', true,
      'locked_until', v_now + (v_lockout_ms || ' milliseconds')::INTERVAL
    );
  END IF;
  
  -- Increment attempt count
  UPDATE otp_rate_limits SET
    attempt_count = attempt_count + 1,
    updated_at = v_now
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_max_attempts - v_record.attempt_count - 1,
    'locked', false
  );
END;
$$;

-- Create function to record failed OTP attempt
CREATE OR REPLACE FUNCTION public.record_otp_failure(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE otp_rate_limits SET
    total_failed_attempts = total_failed_attempts + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Create function to reset rate limit on successful verification
CREATE OR REPLACE FUNCTION public.reset_otp_rate_limit(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE otp_rate_limits SET
    attempt_count = 0,
    locked_until = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Don't reset total_failed_attempts - this is for security monitoring
END;
$$;

-- Create function for admin to unlock a user
CREATE OR REPLACE FUNCTION public.admin_unlock_otp(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller is super_admin
  IF NOT has_role(v_caller_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can unlock accounts');
  END IF;
  
  -- Reset all rate limit counters
  UPDATE otp_rate_limits SET
    attempt_count = 0,
    locked_until = NULL,
    total_failed_attempts = 0,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Audit log
  INSERT INTO audit_logs (entity_type, entity_id, event_type, user_id, description)
  VALUES ('user', p_user_id, 'otp_unlocked', v_caller_id, 'OTP rate limit reset by admin');
  
  RETURN jsonb_build_object('success', true, 'message', 'Account unlocked successfully');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_otp_rate_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_otp_failure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_otp_rate_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_otp(UUID) TO authenticated;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_locked ON otp_rate_limits(locked_until) WHERE locked_until IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.otp_rate_limits IS 'Persistent rate limiting for OTP verification to prevent brute force attacks';