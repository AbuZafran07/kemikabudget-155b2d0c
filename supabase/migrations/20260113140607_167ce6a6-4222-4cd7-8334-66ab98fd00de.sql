-- Fix weak password for default super admin
-- Change from '123456' to a strong password that meets enterprise policy
-- Password: Ksatria2312 (as specified in business requirements)
-- Minimum 8 chars, uppercase, lowercase, numbers

UPDATE auth.users 
SET 
  encrypted_password = crypt('Ksatria2312', gen_salt('bf')),
  updated_at = now()
WHERE email = 'ferry@kemika.co.id';

-- Log this security action in audit_logs
INSERT INTO public.audit_logs (
  event_type,
  entity_type,
  entity_id,
  description,
  metadata
)
SELECT 
  'security_password_update',
  'user',
  id,
  'Default super admin password updated to meet enterprise password policy',
  jsonb_build_object(
    'reason', 'Security hardening - replaced weak seed password',
    'policy_compliant', true
  )
FROM auth.users
WHERE email = 'ferry@kemika.co.id';