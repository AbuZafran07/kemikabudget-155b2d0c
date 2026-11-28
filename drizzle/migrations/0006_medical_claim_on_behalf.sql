-- =====================================================================
-- 0006_medical_claim_on_behalf
-- Super Admin dapat membuat & mengajukan klaim medis atas nama karyawan lain.
--   * kolom created_by mencatat siapa yang membuat klaim
--   * submit_medical_claim: pemilik ATAU Super Admin
--   * karyawan dapat melihat lampiran yang diunggah Super Admin untuk klaimnya
-- =====================================================================

ALTER TABLE public.medical_claims ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION public.medical_claims_set_created_by() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  -- Hanya Super Admin yang boleh membuat klaim untuk orang lain (RLS juga menjaga ini)
  IF auth.uid() IS NOT NULL AND NEW.employee_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat membuat klaim medis atas nama karyawan lain';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_medical_claims_set_created_by ON public.medical_claims;
CREATE TRIGGER trg_medical_claims_set_created_by
  BEFORE INSERT ON public.medical_claims
  FOR EACH ROW EXECUTE FUNCTION public.medical_claims_set_created_by();

-- Pemilik klaim dapat membuka file lampiran klaimnya walaupun diunggah orang lain (mis. Super Admin)
DROP POLICY IF EXISTS "Users can view referenced medical attachments" ON storage.objects;
CREATE POLICY "Users can view referenced medical attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-attachments' AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.medical_claim_attachments a WHERE a.file_path = storage.objects.name)
  );

CREATE OR REPLACE FUNCTION public.submit_medical_claim(p_claim_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_budget RECORD;
  v_remaining NUMERIC;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  -- Validate owner (Super Admin boleh mengajukan atas nama karyawan) [0006]
  IF v_claim.employee_id != auth.uid() AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'Only owner can submit');
  END IF;
  
  -- Validate status
  IF v_claim.status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft claims can be submitted');
  END IF;
  
  -- Check employee has medical budget for the treatment year
  SELECT * INTO v_budget
  FROM employee_medical_budgets
  WHERE employee_id = v_claim.employee_id
    AND year = EXTRACT(YEAR FROM v_claim.treatment_date)
    AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No medical budget found for this year. Please contact HR.');
  END IF;
  
  -- Check remaining budget
  v_remaining := v_budget.total_entitlement - v_budget.used_amount;
  IF v_claim.claim_amount > v_remaining THEN
    RETURN json_build_object('success', false, 'error', 'Claim amount exceeds remaining budget. Remaining: ' || v_remaining);
  END IF;
  
  -- Update status to review_hrga (goes directly to HRGA for approval)
  UPDATE medical_claims SET
    status = 'review_hrga',
    submitted_at = now(),
    medical_budget_id = v_budget.id,
    updated_at = now()
  WHERE id = p_claim_id;
  
  -- Insert event
  INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, 'submitted',
    CASE WHEN v_claim.employee_id = auth.uid() THEN 'Claim submitted for HRGA review'
         ELSE 'Claim submitted for HRGA review by Super Admin on behalf of the employee' END,
    auth.uid());
  
  -- Add commitment to medical ledger
  INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
  VALUES (v_budget.id, 'commitment_add', v_claim.claim_amount, p_claim_id, auth.uid(), 'Claim submitted: ' || v_claim.claim_number);
  
  RETURN json_build_object('success', true);
END;
$function$;
