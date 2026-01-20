-- FIX 1: Profiles table - Restrict profile visibility to necessary personnel only
-- Current issue: Any authenticated user in same division can see all profiles (exposing PII)
-- Fix: Only allow users to see their own profile, super_admin/finance see all, admin sees division

-- Drop the overly permissive profile visibility policy
DROP POLICY IF EXISTS "Profile visibility by role" ON public.profiles;

-- Create a more restrictive profile visibility policy
-- Users can ONLY see: their own profile, OR if they are super_admin/finance (full access), OR admin (division only)
-- Regular users can NO LONGER see other users in their division
CREATE POLICY "Restricted profile visibility"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Users can always see their own profile
    id = auth.uid()
    -- Super admin and finance can see all profiles (needed for approvals/payments)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    -- Admin can see profiles in their division (needed for team management)
    OR (
      has_role(auth.uid(), 'admin'::app_role) 
      AND division_id = get_user_division_id(auth.uid())
    )
  )
);

-- FIX 2: Funding sources table - Restrict access to finance/super_admin only
-- Current issue: "Authenticated users can select funding sources for view" allows ANY user to see bank details
-- Fix: Remove the overly permissive policy, keep only finance/super_admin access

-- Drop the overly permissive policy that allows any authenticated user to see funding sources
DROP POLICY IF EXISTS "Authenticated users can select funding sources for view" ON public.funding_sources;

-- The existing "Finance and super_admin can view funding sources" policy is already correct
-- and only allows finance/super_admin to see funding source data

-- Update the funding_source_options view to use SECURITY DEFINER to allow users to see basic options
-- This view only exposes non-sensitive metadata (id, code, name, type, is_active) for dropdowns
-- First drop existing view and recreate with proper security

DROP VIEW IF EXISTS public.funding_source_options;

CREATE VIEW public.funding_source_options
WITH (security_invoker = false, security_barrier = true)
AS
SELECT 
  id,
  code,
  name,
  type,
  is_active
FROM public.funding_sources
WHERE is_active = true;

-- Grant SELECT on the view to authenticated users for dropdown population
GRANT SELECT ON public.funding_source_options TO authenticated;

-- Add comment explaining the security design
COMMENT ON VIEW public.funding_source_options IS 'Secure view exposing only non-sensitive funding source metadata for dropdown menus. Does not expose bank details, account numbers, or balances.';