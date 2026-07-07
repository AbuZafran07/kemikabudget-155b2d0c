
-- medical_claims
DROP POLICY IF EXISTS "session_must_be_valid_medical_claims" ON public.medical_claims;
CREATE POLICY "session_must_be_valid_medical_claims"
ON public.medical_claims
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- medical_claim_events
DROP POLICY IF EXISTS "session_must_be_valid_medical_events" ON public.medical_claim_events;
CREATE POLICY "session_must_be_valid_medical_events"
ON public.medical_claim_events
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- medical_claim_attachments
DROP POLICY IF EXISTS "session_must_be_valid_medical_attachments" ON public.medical_claim_attachments;
CREATE POLICY "session_must_be_valid_medical_attachments"
ON public.medical_claim_attachments
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- medical_ledger
DROP POLICY IF EXISTS "session_must_be_valid_medical_ledger" ON public.medical_ledger;
CREATE POLICY "session_must_be_valid_medical_ledger"
ON public.medical_ledger
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- employee_medical_budgets
DROP POLICY IF EXISTS "session_must_be_valid_medical_budgets" ON public.employee_medical_budgets;
CREATE POLICY "session_must_be_valid_medical_budgets"
ON public.employee_medical_budgets
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (check_session_valid())
WITH CHECK (check_session_valid());
