
-- 1) Convert permissive session_must_be_valid policies to RESTRICTIVE on sensitive tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'budget_ledger',
    'cash_advances',
    'cash_advance_items',
    'cash_advance_settlements',
    'cash_advance_settlement_items',
    'cash_advance_events',
    'document_sequences',
    'document_templates',
    'medical_claims',
    'medical_claim_attachments',
    'medical_claim_events',
    'employee_medical_budgets',
    'medical_ledger'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS session_must_be_valid ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY session_must_be_valid ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.check_session_valid())',
      t
    );
  END LOOP;
END $$;

-- 2) Pin search_path on pay_medical_claim
ALTER FUNCTION public.pay_medical_claim(uuid) SET search_path = public;
