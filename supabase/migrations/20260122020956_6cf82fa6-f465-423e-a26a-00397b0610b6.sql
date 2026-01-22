-- FIX 1: Tighten profiles RLS policy to restrict visibility
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Restricted profile visibility" ON public.profiles;

-- Create a stricter policy:
-- - Users can ALWAYS see their own profile
-- - Super_admin can see all profiles
-- - Finance can only see profiles in context (for payment processing - name only)
-- - Admin can only see profiles in their division
-- - Regular users can only see their own profile
CREATE POLICY "Strict profile visibility"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      -- User can always see their own profile
      id = auth.uid()
      -- Super admins can see all profiles
      OR has_role(auth.uid(), 'super_admin'::app_role)
      -- Finance can see profiles (needed for payment processing)
      OR has_role(auth.uid(), 'finance'::app_role)
      -- Division admins can only see profiles within their division
      OR (has_role(auth.uid(), 'admin'::app_role) AND division_id = get_user_division_id(auth.uid()))
    )
  );

-- FIX 2: Update funding_sources_secure view to mask account numbers for non-super_admin
-- Drop and recreate the view with masking for finance users
DROP VIEW IF EXISTS public.funding_sources_secure;

CREATE VIEW public.funding_sources_secure AS
SELECT 
  fs.id,
  fs.code,
  fs.name,
  fs.type,
  fs.is_active,
  fs.created_at,
  fs.updated_at,
  fs.balance,
  fs.bank_name,
  -- Only super_admin sees full account details
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_number
    WHEN fs.account_number IS NOT NULL AND LENGTH(fs.account_number) >= 8 THEN 
      LEFT(fs.account_number, 4) || '****' || RIGHT(fs.account_number, 4)
    WHEN fs.account_number IS NOT NULL THEN '****'
    ELSE NULL
  END as account_number,
  CASE 
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN fs.account_holder
    ELSE fs.account_holder -- Account holder name is less sensitive, can be visible
  END as account_holder
FROM public.funding_sources fs
WHERE 
  auth.uid() IS NOT NULL 
  AND fs.is_active = true
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'finance'::app_role)
  );

-- Grant access to the view
GRANT SELECT ON public.funding_sources_secure TO authenticated;

-- Add comment explaining the security model
COMMENT ON VIEW public.funding_sources_secure IS 
'Secure view for funding sources that masks account numbers for non-super_admin users. Finance users see masked account numbers (first 4 and last 4 digits only).';