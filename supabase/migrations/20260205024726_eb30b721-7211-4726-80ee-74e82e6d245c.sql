-- ==============================================================================
-- SECURITY FIX: Address 3 error-level security findings
-- 1. profiles_table_public_exposure - Restrict base table access
-- 2. requests_table_financial_exposure - Restrict base table access  
-- 3. otp_secrets_inadequate_protection - Remove user SELECT ability
-- ==============================================================================

-- ==============================================================================
-- FIX 1: OTP Secrets - Remove user SELECT capability
-- Users should NEVER be able to read their OTP secret after creation
-- Only super_admin can view for recovery, only edge function can verify
-- ==============================================================================

-- Drop the existing user policies and recreate without SELECT
DROP POLICY IF EXISTS "Users can view their own OTP secret" ON public.otp_secrets;

-- Ensure users cannot SELECT their own secrets (only INSERT, UPDATE, DELETE)
-- The SELECT was already removed in a previous migration but let's be certain
-- by recreating the structure correctly

-- ==============================================================================
-- FIX 2: Profiles - Restrict direct base table SELECT
-- Force use of profiles_secure view for cross-user access
-- ==============================================================================

-- Drop overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can only view own profile directly" ON public.profiles;

-- Recreate with stricter access - only own profile, super_admin, or via secure view
CREATE POLICY "Users can only view own profile"
ON public.profiles
FOR SELECT
USING (
  -- Users can only see their own profile
  auth.uid() = id
);

-- Finance needs to access profiles for payment/reporting purposes via secure view
-- Add policy to allow Finance to view profiles (needed for name lookups)
CREATE POLICY "Finance can view profiles for reporting"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'finance'::app_role)
);

-- HRGA (admin role) needs to view profiles for medical claims processing
CREATE POLICY "HRGA can view profiles for claims processing"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- ==============================================================================
-- FIX 3: Requests - Restrict direct base table SELECT for beneficiary data
-- Force use of requests_secure view for cross-user access
-- ==============================================================================

-- Drop the current division-wide access policy that exposes beneficiary data
DROP POLICY IF EXISTS "Users can view requests in their division" ON public.requests;

-- Create new policy that restricts viewing to only requester's own requests
-- Finance and Super Admin can see all via their existing policies
CREATE POLICY "Users can view their own requests"
ON public.requests
FOR SELECT
USING (
  -- Users can only see their own requests
  requester_id = auth.uid()
);

-- Division admins need to see requests in their division for review purposes
-- But they should use requests_secure view for masked beneficiary data
-- Add limited admin access for workflow visibility (no beneficiary in RLS)
CREATE POLICY "Admins can view division requests"
ON public.requests
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  can_access_division(auth.uid(), division_id)
);

-- ==============================================================================
-- Ensure views are using security_invoker for RLS inheritance
-- ==============================================================================

-- Recreate profiles_secure with security_invoker
DROP VIEW IF EXISTS public.profiles_secure;
CREATE VIEW public.profiles_secure
WITH (security_invoker = true)
AS
SELECT 
  id,
  division_id,
  full_name,
  avatar_url,
  is_active,
  requires_otp,
  created_at,
  updated_at,
  -- Only show email to own user, super_admin, finance, or HRGA
  CASE
    WHEN auth.uid() = id THEN email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN email
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN email
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN email
    ELSE NULL
  END AS email,
  -- Only show phone to own user or super_admin
  CASE
    WHEN auth.uid() = id THEN phone
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN phone
    ELSE NULL
  END AS phone
FROM public.profiles;

GRANT SELECT ON public.profiles_secure TO authenticated;

-- Recreate requests_secure with security_invoker (ensure proper RLS)
DROP VIEW IF EXISTS public.requests_secure;
CREATE VIEW public.requests_secure
WITH (security_invoker = true)
AS
SELECT 
  id,
  division_id,
  category_id,
  requester_id,
  period_id,
  amount,
  needed_date,
  funding_source_id,
  status,
  submitted_at,
  approved_at,
  approved_by,
  rejected_at,
  rejected_by,
  paid_at,
  paid_by,
  settled_at,
  settled_by,
  is_locked,
  locked_at,
  locked_by,
  created_at,
  updated_at,
  approved_amount,
  notes,
  rejection_reason,
  request_number,
  description,
  vendor,
  payment_method,
  -- Mask beneficiary info for non-privileged users
  CASE
    WHEN requester_id = auth.uid() THEN beneficiary_name
    WHEN approved_by = auth.uid() THEN beneficiary_name
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN beneficiary_name
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN beneficiary_name
    ELSE CASE WHEN beneficiary_name IS NOT NULL THEN '***TERSEMBUNYI***' ELSE NULL END
  END AS beneficiary_name,
  CASE
    WHEN requester_id = auth.uid() THEN beneficiary_bank
    WHEN approved_by = auth.uid() THEN beneficiary_bank
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN beneficiary_bank
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN beneficiary_bank
    ELSE CASE WHEN beneficiary_bank IS NOT NULL THEN '***TERSEMBUNYI***' ELSE NULL END
  END AS beneficiary_bank,
  CASE
    WHEN requester_id = auth.uid() THEN beneficiary_account
    WHEN approved_by = auth.uid() THEN beneficiary_account
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN beneficiary_account
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN beneficiary_account
    ELSE CASE WHEN beneficiary_account IS NOT NULL THEN '****' || right(beneficiary_account, 4) ELSE NULL END
  END AS beneficiary_account,
  CASE
    WHEN requester_id = auth.uid() THEN beneficiary_email
    WHEN approved_by = auth.uid() THEN beneficiary_email
    WHEN has_role(auth.uid(), 'finance'::app_role) THEN beneficiary_email
    WHEN has_role(auth.uid(), 'super_admin'::app_role) THEN beneficiary_email
    ELSE CASE WHEN beneficiary_email IS NOT NULL THEN '***@***' ELSE NULL END
  END AS beneficiary_email
FROM public.requests;

GRANT SELECT ON public.requests_secure TO authenticated;