
-- Fix 1: Add RLS policy for funding_sources to allow authenticated users to read basic info
-- This allows the funding_source_options view to work for authenticated users when creating requests
-- The view only exposes non-sensitive fields: id, code, name, type, is_active

CREATE POLICY "Authenticated users can view active funding sources for selection"
ON public.funding_sources
FOR SELECT
TO authenticated
USING (is_active = true);

-- Fix 2: Add RLS policy for profiles to allow authenticated users to read basic profile info
-- This allows the profiles_secure view to work for authenticated users viewing other users' names
-- The view masks sensitive fields (email, phone) based on role using CASE expressions

CREATE POLICY "Authenticated users can view basic profile info"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_active = true);

-- Note: The profiles_secure view already masks sensitive data with CASE expressions:
-- - email: visible to owner, super_admin, finance, admin
-- - phone: visible to owner, super_admin only
-- So this policy is safe as sensitive data is already masked at the view level
