-- =====================================================
-- SECURITY FIX: Restrict access to sensitive data
-- Issue 2: funding_sources table exposes bank account numbers to all authenticated users
-- =====================================================

-- Drop the overly permissive policy that allows ALL authenticated users to view funding sources
DROP POLICY IF EXISTS "Authenticated users can view active funding sources for selecti" ON public.funding_sources;
DROP POLICY IF EXISTS "Authenticated users can view active funding sources" ON public.funding_sources;
DROP POLICY IF EXISTS "Authenticated users can view active funding sources for selection" ON public.funding_sources;

-- Add Finance SELECT policy (Super admin policy already exists)
-- Check if Finance policy exists before creating
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'funding_sources' 
    AND policyname = 'Finance can view all funding sources'
  ) THEN
    EXECUTE 'CREATE POLICY "Finance can view all funding sources" ON public.funding_sources FOR SELECT USING (has_role(auth.uid(), ''finance''::app_role))';
  END IF;
END $$;

-- Session validation policy for funding_sources (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'funding_sources' 
    AND policyname = 'session_must_be_valid'
  ) THEN
    EXECUTE 'CREATE POLICY "session_must_be_valid" ON public.funding_sources FOR ALL USING (check_session_valid()) WITH CHECK (check_session_valid())';
  END IF;
END $$;

-- =====================================================
-- IMPORTANT: Regular users should use funding_source_options VIEW
-- This view already exists and only exposes: id, code, name, type, is_active
-- It does NOT expose: account_number, account_holder, bank_name, balance
-- The application code already uses this view for dropdowns
-- =====================================================