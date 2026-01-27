-- Fix: Secure audit_logs table to ensure audit trail integrity
-- 1. Audit logs should be immutable (no UPDATE allowed)
-- 2. Audit logs should not be deletable (preserve audit trail)

-- Explicitly deny UPDATE operations (audit logs are immutable)
CREATE POLICY "Audit logs are immutable - no updates" 
ON public.audit_logs 
FOR UPDATE 
USING (false);

-- Explicitly deny DELETE operations (preserve audit trail integrity)
CREATE POLICY "Audit logs cannot be deleted" 
ON public.audit_logs 
FOR DELETE 
USING (false);

-- Comment: INSERT remains allowed for authenticated users as:
-- 1. user_id is tied to auth.uid() in the application code
-- 2. For an internal corporate app, authenticated users creating audit entries is acceptable
-- 3. The primary security concern (tampering/deletion) is now addressed