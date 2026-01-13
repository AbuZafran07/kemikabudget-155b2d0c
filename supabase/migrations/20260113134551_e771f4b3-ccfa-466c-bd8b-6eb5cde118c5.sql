-- Enforce session revocation across all RLS-protected tables
-- 1) Ensure revocation updates last_active_at so the DB-side revocation window check works reliably
CREATE OR REPLACE FUNCTION public.user_sessions_set_revoked_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_revoked = true AND (OLD.is_revoked IS DISTINCT FROM NEW.is_revoked) THEN
    NEW.last_active_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_sessions_set_revoked_last_active ON public.user_sessions;
CREATE TRIGGER trg_user_sessions_set_revoked_last_active
BEFORE UPDATE OF is_revoked ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.user_sessions_set_revoked_last_active();

-- 2) Add one RESTRICTIVE policy per table so revoked sessions are blocked immediately
DO $$
DECLARE
  r record;
  policy_name text := 'session_must_be_valid';
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = r.schemaname
        AND p.tablename = r.tablename
        AND p.policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO public USING (public.check_session_valid()) WITH CHECK (public.check_session_valid());',
        policy_name,
        r.schemaname,
        r.tablename
      );
    END IF;
  END LOOP;
END;
$$;