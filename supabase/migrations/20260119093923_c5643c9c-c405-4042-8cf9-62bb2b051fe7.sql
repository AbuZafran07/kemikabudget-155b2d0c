-- =====================================================================
-- SECURITY FIX: Remove overly broad SELECT policy on funding_sources
-- The funding_source_options VIEW with security_invoker will still work
-- because it only needs basic columns from the underlying table
-- =====================================================================

-- Drop the overly broad policy that exposes bank account details
DROP POLICY IF EXISTS "Authenticated users can view basic funding source info" ON public.funding_sources;

-- The funding_source_options view will now only work for users who have
-- access via the "Finance and super_admin can view funding sources" policy
-- OR we need a more restrictive policy for the view

-- Create a minimal SELECT policy that only allows viewing non-sensitive columns
-- This is achieved by the VIEW security_invoker which inherits RLS from base table
-- So we keep the Finance/Super Admin policy for full access

-- For the funding_source_options VIEW, we need authenticated users to query it
-- The VIEW itself only exposes (id, code, name, type, is_active) - no sensitive data
-- Solution: Keep the restrictive role-based policy and update the VIEW to use SECURITY DEFINER
-- instead of security_invoker so it can query without relying on user's RLS permissions

-- Drop and recreate the funding_source_options view with SECURITY DEFINER
DROP VIEW IF EXISTS public.funding_source_options;

CREATE VIEW public.funding_source_options
WITH (security_barrier = true)
AS SELECT 
  id,
  code,
  name,
  type,
  is_active
FROM public.funding_sources
WHERE is_active = true;

-- Set ownership to ensure proper permissions
ALTER VIEW public.funding_source_options OWNER TO postgres;

-- Grant SELECT to authenticated users on the VIEW (they can see non-sensitive metadata)
GRANT SELECT ON public.funding_source_options TO authenticated;

-- The view now acts as a "whitelist" of columns - users can only see what the view exposes
-- They cannot access the base funding_sources table directly (blocked by RLS)
-- This achieves column-level security without exposing bank details

-- =====================================================================
-- Document the security architecture:
-- 1. funding_source_options: Non-sensitive metadata for all authenticated users (via VIEW)
-- 2. funding_sources_secure: Role-based masking for Finance/Super Admin
-- 3. funding_sources base table: Only Finance/Super Admin have direct access via RLS
-- =====================================================================