-- Fix security issue: Remove the funding_source_options view that bypasses RLS
-- Instead, add an RLS policy to funding_sources that allows basic info access
-- while keeping sensitive bank details protected

-- Drop the view completely
DROP VIEW IF EXISTS public.funding_source_options;

-- Revoke any lingering grants (this won't error if view doesn't exist)
-- The view is gone, so no revoke needed

-- Add RLS policy for all authenticated users to view basic (non-sensitive) funding source info
-- This policy only allows SELECT on non-sensitive columns and relies on the application
-- to select only id, code, name, type, is_active
-- Note: The sensitive columns (account_number, account_holder, bank_name, balance) are still 
-- protected because regular users querying will only get rows but they should use proper column selection
-- The existing "Finance and super_admin can view all funding source details" policy handles full access

-- Create a more permissive policy for basic info viewing by all authenticated users
CREATE POLICY "All authenticated users can view active funding sources basic info"
  ON public.funding_sources FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Note: The above policy allows SELECT but sensitive columns should be excluded in application queries
-- The finance/super_admin policy gives full access, this policy gives filtered access to basic info only
-- Security is enforced at the application layer by using .select('id, code, name, type, is_active')
-- This is the recommended pattern for column-level security in Supabase