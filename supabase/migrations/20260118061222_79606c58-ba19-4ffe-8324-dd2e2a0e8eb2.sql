-- ============================================================
-- Security Fix: Remove otp_secret column from profiles table
-- The otp_secrets table now handles all OTP secrets securely
-- ============================================================

-- 1. Drop ALL triggers that reference otp_secret column
DROP TRIGGER IF EXISTS sync_profiles_otp_secret ON profiles;
DROP TRIGGER IF EXISTS audit_otp_secret_changes ON profiles;
DROP FUNCTION IF EXISTS public.sync_otp_secret();
DROP FUNCTION IF EXISTS public.audit_otp_secret_change() CASCADE;

-- 2. Update verify_user_otp function to remove profiles fallback
CREATE OR REPLACE FUNCTION public.verify_user_otp(p_user_id uuid, p_otp_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_secret text;
  v_valid boolean := false;
BEGIN
  -- Get secret from secure otp_secrets table only
  SELECT secret INTO v_otp_secret
  FROM otp_secrets
  WHERE user_id = p_user_id;
  
  IF v_otp_secret IS NULL THEN
    RETURN false;
  END IF;
  
  -- OTP verification happens in the edge function using the secret
  RETURN true;
END;
$$;

-- 3. Update set_user_otp_secret function to not write to profiles
CREATE OR REPLACE FUNCTION public.set_user_otp_secret(p_user_id uuid, p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only write to the secure otp_secrets table
  INSERT INTO otp_secrets (user_id, secret, updated_at)
  VALUES (p_user_id, p_secret, now())
  ON CONFLICT (user_id) 
  DO UPDATE SET secret = p_secret, updated_at = now();
  
  RETURN true;
END;
$$;

-- 4. Update get_user_otp_secret function to only use otp_secrets table
CREATE OR REPLACE FUNCTION public.get_user_otp_secret(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Get secret from secure otp_secrets table only
  SELECT secret INTO v_secret
  FROM otp_secrets
  WHERE user_id = p_user_id;
  
  RETURN v_secret;
END;
$$;

-- 5. Drop the otp_secret column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS otp_secret;

-- 6. Recreate the profiles_secure view without otp_secret reference
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure
WITH (security_invoker = true)
AS SELECT 
  id,
  full_name,
  email,
  phone,
  avatar_url,
  division_id,
  is_active,
  requires_otp,
  created_at,
  updated_at
FROM public.profiles;