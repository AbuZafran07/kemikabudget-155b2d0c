-- =====================================================
-- MEDICAL CLAIM: CHANGE APPROVAL FLOW TO HRGA ONLY
-- Previously: submitted -> review_hrga -> review_finance -> approved -> paid -> closed
-- New: submitted -> review_hrga -> approved -> paid -> closed
-- =====================================================

-- 1. Update review_medical_claim_hrga function to directly approve instead of forwarding to finance
CREATE OR REPLACE FUNCTION public.review_medical_claim_hrga(
  p_claim_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_new_status medical_claim_status;
  v_budget RECORD;
  v_description TEXT;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  -- Validate status - allow review from submitted or review_hrga
  IF v_claim.status NOT IN ('submitted', 'review_hrga') THEN
    RETURN json_build_object('success', false, 'error', 'Claim is not in reviewable status');
  END IF;
  
  -- Check reviewer role
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Only HRGA can review this claim');
  END IF;
  
  IF p_action = 'approve' THEN
    -- HRGA approval now directly approves the claim (no finance step)
    v_new_status := 'approved';
    v_description := 'Claim approved by HRGA';
    
    -- Get employee medical budget
    SELECT * INTO v_budget
    FROM employee_medical_budgets
    WHERE employee_id = v_claim.employee_id
      AND year = EXTRACT(YEAR FROM v_claim.treatment_date)
      AND status = 'active';
    
    -- Update claim with approved_amount (use claim_amount if not specified)
    UPDATE medical_claims SET
      status = v_new_status,
      approved_amount = v_claim.claim_amount,
      approved_at = now(),
      approved_by = auth.uid(),
      reviewed_hrga_at = now(),
      reviewed_hrga_by = auth.uid(),
      medical_budget_id = v_budget.id,
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid(),
      updated_at = now()
    WHERE id = p_claim_id;
    
  ELSIF p_action = 'reject' THEN
    IF p_note IS NULL OR p_note = '' THEN
      RETURN json_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;
    
    v_new_status := 'rejected';
    v_description := 'Claim rejected by HRGA: ' || p_note;
    
    UPDATE medical_claims SET
      status = v_new_status,
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = p_note,
      reviewed_hrga_at = now(),
      reviewed_hrga_by = auth.uid(),
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid(),
      updated_at = now()
    WHERE id = p_claim_id;
    
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
  
  -- Insert event
  INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, p_action, v_description, auth.uid());
  
  RETURN json_build_object('success', true, 'new_status', v_new_status);
END;
$$;

-- 2. Update submit_medical_claim to go directly to review_hrga
CREATE OR REPLACE FUNCTION public.submit_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Validate owner
  IF v_claim.employee_id != auth.uid() THEN
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
  VALUES (p_claim_id, 'submitted', 'Claim submitted for HRGA review', auth.uid());
  
  -- Add commitment to medical ledger
  INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
  VALUES (v_budget.id, 'commitment_add', v_claim.claim_amount, p_claim_id, auth.uid(), 'Claim submitted: ' || v_claim.claim_number);
  
  RETURN json_build_object('success', true);
END;
$$;

-- 3. Update pay_medical_claim to work with HRGA-approved claims
CREATE OR REPLACE FUNCTION public.pay_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_budget RECORD;
  v_actual_amount NUMERIC;
  v_commitment_diff NUMERIC;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  -- Validate status
  IF v_claim.status != 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Only approved claims can be paid');
  END IF;
  
  -- Check payer role (Finance or Super Admin)
  IF NOT (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'super_admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Only Finance can process payments');
  END IF;
  
  -- Get the medical budget
  SELECT * INTO v_budget
  FROM employee_medical_budgets
  WHERE id = v_claim.medical_budget_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Medical budget not found');
  END IF;
  
  -- Use approved amount (set by HRGA)
  v_actual_amount := COALESCE(v_claim.approved_amount, v_claim.claim_amount);
  
  -- Calculate commitment difference (release excess commitment if approved < claimed)
  v_commitment_diff := v_claim.claim_amount - v_actual_amount;
  
  -- Release excess commitment if any
  IF v_commitment_diff > 0 THEN
    INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
    VALUES (v_budget.id, 'commitment_release', v_commitment_diff, p_claim_id, auth.uid(), 'Excess commitment released');
  END IF;
  
  -- Convert commitment to actual usage
  INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
  VALUES (v_budget.id, 'actual_add', v_actual_amount, p_claim_id, auth.uid(), 'Payment processed: ' || v_claim.claim_number);
  
  -- Update used_amount on budget
  UPDATE employee_medical_budgets SET
    used_amount = used_amount + v_actual_amount,
    remaining_amount = total_entitlement - (used_amount + v_actual_amount),
    updated_at = now()
  WHERE id = v_budget.id;
  
  -- Update claim status
  UPDATE medical_claims SET
    status = 'paid',
    paid_at = now(),
    paid_by = auth.uid(),
    updated_at = now()
  WHERE id = p_claim_id;
  
  -- Insert event
  INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, 'paid', 'Payment processed', auth.uid());
  
  RETURN json_build_object('success', true, 'paid_amount', v_actual_amount);
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.review_medical_claim_hrga TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_medical_claim TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_medical_claim TO authenticated;