CREATE OR REPLACE FUNCTION public.pay_medical_claim(p_claim_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim medical_claims%ROWTYPE;
  v_budget employee_medical_budgets%ROWTYPE;
  v_actual_amount NUMERIC;
  v_commitment_diff NUMERIC;
BEGIN
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.status != 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Only approved claims can be paid');
  END IF;
  
  IF NOT (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized to process payments');
  END IF;
  
  SELECT * INTO v_budget
  FROM employee_medical_budgets
  WHERE id = v_claim.medical_budget_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Medical budget not found');
  END IF;
  
  v_actual_amount := COALESCE(v_claim.approved_amount, v_claim.claim_amount);
  v_commitment_diff := v_claim.claim_amount - v_actual_amount;
  
  IF v_commitment_diff > 0 THEN
    INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
    VALUES (v_budget.id, 'commitment_release', v_commitment_diff, p_claim_id, auth.uid(), 'Release excess commitment');
  END IF;
  
  INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
  VALUES (v_budget.id, 'actual_add', v_actual_amount, p_claim_id, auth.uid(), 'Medical claim payment');
  
  -- Only update used_amount; remaining_amount is a generated column
  UPDATE employee_medical_budgets
  SET used_amount = used_amount + v_actual_amount,
      updated_at = NOW()
  WHERE id = v_budget.id;
  
  UPDATE medical_claims
  SET status = 'paid', paid_at = NOW(), paid_by = auth.uid(), updated_at = NOW()
  WHERE id = p_claim_id;
  
  INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
  VALUES (p_claim_id, 'paid', 'Medical claim paid', auth.uid(),
    json_build_object('amount', v_actual_amount)::jsonb);
  
  RETURN json_build_object('success', true, 'message', 'Medical claim paid successfully');
END;
$$;