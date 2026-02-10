
-- Allow admin role to process payments in addition to finance and super_admin

-- 1. Update pay_request to allow admin
CREATE OR REPLACE FUNCTION public.pay_request(p_request_id UUID, p_payment_note TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_funding funding_sources%ROWTYPE;
  v_user_id UUID;
  v_safe_note TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF p_payment_note IS NOT NULL THEN
    IF LENGTH(p_payment_note) > 1000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Note too long (max 1000 characters)');
    END IF;
    v_safe_note := LEFT(TRIM(p_payment_note), 1000);
  ELSE
    v_safe_note := NULL;
  END IF;
  
  -- Check if user has finance, admin, or super_admin role
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to process payments');
  END IF;
  
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved requests can be paid');
  END IF;
  
  IF v_request.funding_source_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No funding source specified');
  END IF;
  
  SELECT * INTO v_funding FROM funding_sources WHERE id = v_request.funding_source_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;
  
  IF v_funding.balance < COALESCE(v_request.approved_amount, v_request.amount) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;
  
  -- Deduct from funding source
  UPDATE funding_sources
  SET balance = balance - COALESCE(v_request.approved_amount, v_request.amount),
      updated_at = now()
  WHERE id = v_request.funding_source_id;
  
  -- Record petty cash transaction if applicable
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (
      funding_source_id, transaction_type, amount, balance_before, balance_after,
      performed_by, description, request_id
    ) VALUES (
      v_request.funding_source_id,
      'out',
      COALESCE(v_request.approved_amount, v_request.amount),
      v_funding.balance,
      v_funding.balance - COALESCE(v_request.approved_amount, v_request.amount),
      v_user_id,
      'Payment for request ' || v_request.request_number,
      p_request_id
    );
  END IF;
  
  -- Update request status
  UPDATE requests
  SET status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      notes = CASE WHEN v_safe_note IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Payment note: ' || v_safe_note ELSE notes END,
      updated_at = now()
  WHERE id = p_request_id;
  
  -- Log event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (
    p_request_id,
    'paid',
    'Payment processed',
    v_user_id,
    jsonb_build_object('funding_source', v_funding.name, 'amount', COALESCE(v_request.approved_amount, v_request.amount))
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'Payment processed successfully');
END;
$$;

-- 2. Update pay_cash_advance to allow admin
CREATE OR REPLACE FUNCTION public.pay_cash_advance(p_ca_id UUID, p_funding_source_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_funding funding_sources%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to process payments');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance must be approved first');
  END IF;
  
  SELECT * INTO v_funding FROM funding_sources WHERE id = p_funding_source_id FOR UPDATE;
  
  IF v_funding IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;
  
  IF v_funding.balance < v_ca.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;
  
  -- Deduct from funding source
  UPDATE funding_sources
  SET balance = balance - v_ca.total_amount, updated_at = NOW()
  WHERE id = p_funding_source_id;
  
  -- Record petty cash transaction if applicable
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (
      funding_source_id, transaction_type, amount, balance_before, balance_after,
      performed_by, description
    ) VALUES (
      p_funding_source_id, 'out', v_ca.total_amount, v_funding.balance,
      v_funding.balance - v_ca.total_amount, v_user_id,
      'Cash advance payment: ' || v_ca.ca_number
    );
  END IF;
  
  -- Update cash advance
  UPDATE cash_advances
  SET status = 'paid', paid_at = NOW(), paid_by = v_user_id, updated_at = NOW()
  WHERE id = p_ca_id;
  
  -- Log event
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'paid', 'Cash advance paid', v_user_id,
    jsonb_build_object('funding_source', v_funding.name, 'amount', v_ca.total_amount));
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance paid successfully');
END;
$$;

-- 3. Update settle_request to allow admin
CREATE OR REPLACE FUNCTION public.settle_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to settle requests');
  END IF;

  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be paid before settling');
  END IF;

  UPDATE requests 
  SET status = 'settled', settled_at = now(), settled_by = auth.uid()
  WHERE id = p_request_id;

  INSERT INTO request_events (request_id, event_type, description, performed_by)
  VALUES (p_request_id, 'settled', 'Request settled and completed', auth.uid());

  RETURN jsonb_build_object('success', true, 'message', 'Request settled successfully');
END;
$$;

-- 4. Update pay_medical_claim to allow admin
CREATE OR REPLACE FUNCTION public.pay_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  
  -- Check payer role (Finance, Admin, or Super Admin)
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
  
  -- Release excess commitment if approved < claimed
  IF v_commitment_diff > 0 THEN
    INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
    VALUES (v_budget.id, 'commitment_release', v_commitment_diff, p_claim_id, auth.uid(), 'Release excess commitment');
  END IF;
  
  -- Record actual expense
  INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
  VALUES (v_budget.id, 'actual_add', v_actual_amount, p_claim_id, auth.uid(), 'Medical claim payment');
  
  -- Update budget amounts
  UPDATE employee_medical_budgets
  SET used_amount = used_amount + v_actual_amount,
      remaining_amount = total_entitlement - (used_amount + v_actual_amount),
      updated_at = NOW()
  WHERE id = v_budget.id;
  
  -- Update claim status
  UPDATE medical_claims
  SET status = 'paid', paid_at = NOW(), paid_by = auth.uid(), updated_at = NOW()
  WHERE id = p_claim_id;
  
  -- Log event
  INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
  VALUES (p_claim_id, 'paid', 'Medical claim paid', auth.uid(),
    json_build_object('amount', v_actual_amount)::jsonb);
  
  RETURN json_build_object('success', true, 'message', 'Medical claim paid successfully');
END;
$$;
