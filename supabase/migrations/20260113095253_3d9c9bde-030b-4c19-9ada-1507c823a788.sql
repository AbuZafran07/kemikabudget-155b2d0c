-- =====================================================
-- FIX: Notification logs RLS policies and OTP secret exposure
-- =====================================================

-- 1. REMOVE overly permissive notification_logs policies
-- Service role bypasses RLS, so no INSERT/UPDATE policies needed
DROP POLICY IF EXISTS "System can insert notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "System can update notification logs" ON public.notification_logs;

-- Keep SELECT policy for super_admin/finance to view logs (already exists)
-- No new policies needed - service role in edge function will handle writes

-- 2. FIX OTP secret exposure by moving to a separate secure table
-- Create dedicated OTP secrets table with strict access control
CREATE TABLE IF NOT EXISTS public.otp_secrets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on otp_secrets table
ALTER TABLE public.otp_secrets ENABLE ROW LEVEL SECURITY;

-- Only super_admin can directly access OTP secrets (for management purposes)
-- Regular access goes through secure functions
CREATE POLICY "Super admin can view OTP secrets"
  ON public.otp_secrets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin can manage OTP secrets"
  ON public.otp_secrets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Migrate existing OTP secrets from profiles to new table
INSERT INTO public.otp_secrets (user_id, secret, created_at, updated_at)
SELECT id, otp_secret, now(), now()
FROM public.profiles
WHERE otp_secret IS NOT NULL
ON CONFLICT (user_id) DO UPDATE 
SET secret = EXCLUDED.secret, updated_at = now();

-- 4. Update the verify_user_otp function to use the new table
CREATE OR REPLACE FUNCTION public.verify_user_otp(p_user_id uuid, p_otp_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_secret text;
  v_expected_otp text;
  v_current_time bigint;
  v_time_step bigint := 30;
BEGIN
  -- Get the user's OTP secret from the secure table
  SELECT secret INTO v_otp_secret
  FROM otp_secrets
  WHERE user_id = p_user_id;
  
  IF v_otp_secret IS NULL THEN
    -- Fall back to profiles table during migration period
    SELECT otp_secret INTO v_otp_secret
    FROM profiles
    WHERE id = p_user_id;
    
    IF v_otp_secret IS NULL THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Generate time-based hash (simplified TOTP)
  v_current_time := EXTRACT(EPOCH FROM now())::bigint / v_time_step;
  
  -- Create deterministic hash based on secret + time
  v_expected_otp := LPAD(
    (ABS(hashtext(v_otp_secret || v_current_time::text)) % 1000000)::text,
    6, '0'
  );
  
  IF p_otp_code = v_expected_otp THEN
    RETURN true;
  END IF;
  
  -- Check previous time window for clock drift tolerance
  v_expected_otp := LPAD(
    (ABS(hashtext(v_otp_secret || (v_current_time - 1)::text)) % 1000000)::text,
    6, '0'
  );
  
  RETURN p_otp_code = v_expected_otp;
END;
$$;

-- 5. Update set_user_otp_secret to use the new table
CREATE OR REPLACE FUNCTION public.set_user_otp_secret(p_user_id uuid, p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is super_admin
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super_admin can set OTP secrets';
  END IF;
  
  -- Insert or update in the secure otp_secrets table
  INSERT INTO otp_secrets (user_id, secret, updated_at)
  VALUES (p_user_id, p_secret, now())
  ON CONFLICT (user_id) 
  DO UPDATE SET secret = p_secret, updated_at = now();
  
  -- Also update profiles table for backward compatibility
  UPDATE profiles
  SET otp_secret = p_secret, updated_at = now()
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;

-- 6. Update get_user_otp_secret to use the new table
CREATE OR REPLACE FUNCTION public.get_user_otp_secret(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Get from secure table first
  SELECT secret INTO v_secret
  FROM otp_secrets
  WHERE user_id = p_user_id;
  
  -- Fall back to profiles table if not in secure table
  IF v_secret IS NULL THEN
    SELECT otp_secret INTO v_secret
    FROM profiles
    WHERE id = p_user_id;
  END IF;
  
  RETURN v_secret;
END;
$$;

-- 7. Create trigger to keep otp_secrets table in sync with profiles
CREATE OR REPLACE FUNCTION public.sync_otp_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.otp_secret IS NOT NULL AND NEW.otp_secret IS DISTINCT FROM OLD.otp_secret THEN
    INSERT INTO otp_secrets (user_id, secret, updated_at)
    VALUES (NEW.id, NEW.otp_secret, now())
    ON CONFLICT (user_id) 
    DO UPDATE SET secret = NEW.otp_secret, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profiles_otp_secret ON profiles;
CREATE TRIGGER sync_profiles_otp_secret
  AFTER UPDATE OF otp_secret ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_otp_secret();

-- 8. Drop the otp_secret column visibility for non-super_admin by updating the profiles_secure view
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure 
WITH (security_invoker = true)
AS
SELECT 
  p.id,
  p.division_id,
  p.full_name,
  p.email,
  p.phone,
  p.avatar_url,
  p.is_active,
  p.requires_otp,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE 
  -- User can see their own profile
  p.id = auth.uid()
  OR
  -- Super admin and finance can see all profiles
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR
  public.has_role(auth.uid(), 'finance'::app_role)
  OR
  -- Admin can see profiles in their division
  (
    public.has_role(auth.uid(), 'admin'::app_role) 
    AND p.division_id = public.get_user_division_id(auth.uid())
  );

GRANT SELECT ON public.profiles_secure TO authenticated;

-- 9. Add comment for documentation
COMMENT ON TABLE public.otp_secrets IS 'Secure storage for OTP secrets. Only accessible via SECURITY DEFINER functions or by super_admin.';