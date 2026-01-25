-- Fix user_sessions RLS policy - remove overly permissive ALL policy
-- The separate SELECT and UPDATE policies already exist

-- Drop the overly permissive policy that grants ALL (including INSERT/DELETE)
DROP POLICY IF EXISTS "Users can manage their own sessions" ON public.user_sessions;

-- Ensure users can update their own sessions for revocation
-- First drop if exists to avoid conflicts, then recreate
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.user_sessions;

CREATE POLICY "Users can update their own sessions"
  ON public.user_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());