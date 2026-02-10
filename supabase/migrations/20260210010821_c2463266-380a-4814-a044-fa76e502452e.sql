
-- ============================================================
-- FIX 1: Restrict base profiles table to prevent direct PII access
-- Only own profile + super_admin can query base table directly.
-- All other access goes through profiles_secure view with masking.
-- ============================================================

DROP POLICY IF EXISTS "Secure profile visibility" ON public.profiles;

CREATE POLICY "Restrict direct profile access"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Recreate profiles_secure view WITHOUT security_invoker
-- View runs as owner (bypasses base table RLS), providing its own
-- row-level filtering + column-level masking in the SQL definition.
DROP VIEW IF EXISTS public.profiles_secure;

CREATE VIEW public.profiles_secure AS
SELECT 
  p.id,
  p.division_id,
  p.is_active,
  p.requires_otp,
  p.created_at,
  p.updated_at,
  p.full_name,
  p.avatar_url,
  CASE 
    WHEN p.id = auth.uid() 
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance'::app_role)
    THEN p.email
    ELSE regexp_replace(p.email, '(^.).+(@.+)$', E'\\1***\\2')
  END AS email,
  CASE 
    WHEN p.id = auth.uid()
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance'::app_role)
    THEN p.phone
    ELSE CASE WHEN p.phone IS NOT NULL THEN 'xxxx****' ELSE NULL END
  END AS phone
FROM public.profiles p
WHERE 
  p.id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR (has_role(auth.uid(), 'admin'::app_role) AND p.division_id = get_user_division_id(auth.uid()))
  OR (p.division_id IS NOT NULL AND p.division_id = get_user_division_id(auth.uid()));

-- Ensure authenticated role can query the view
GRANT SELECT ON public.profiles_secure TO authenticated;

-- ============================================================
-- FIX 2: Restrict medical_claims admin access to HRGA division only
-- Previously ANY admin could view ALL medical claims.
-- Now only HRGA division admins can view/update non-own claims.
-- ============================================================

DROP POLICY IF EXISTS "HRGA can view all claims" ON public.medical_claims;

CREATE POLICY "HRGA admins can view all claims"
ON public.medical_claims FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.divisions 
    WHERE code = 'HRGA' 
    AND id = get_user_division_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "HRGA can update claims in review_hrga status" ON public.medical_claims;

CREATE POLICY "HRGA admins can update claims in review_hrga status"
ON public.medical_claims FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND status = 'review_hrga'::medical_claim_status
  AND EXISTS (
    SELECT 1 FROM public.divisions 
    WHERE code = 'HRGA' 
    AND id = get_user_division_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.divisions 
    WHERE code = 'HRGA' 
    AND id = get_user_division_id(auth.uid())
  )
);
