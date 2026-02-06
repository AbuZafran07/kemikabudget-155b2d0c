-- Drop existing functions first to handle return type conflicts
DROP FUNCTION IF EXISTS public.approve_request(uuid, text);
DROP FUNCTION IF EXISTS public.approve_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.approve_budget_transfer(uuid);
DROP FUNCTION IF EXISTS public.reject_budget_transfer(uuid, text);
DROP FUNCTION IF EXISTS public.review_medical_claim_hrga(uuid, text, text);

-- Recreate approve_request with admin access
CREATE OR REPLACE FUNCTION public.approve_request(
  p_request_id UUID,
  p_approval_note TEXT DEFAULT NULL,
  p_approved_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_budget RECORD;
  v_remaining NUMERIC;
  v_user_id UUID;
  v_safe_note TEXT;
  v_final_amount NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF p_approval_note IS NOT NULL THEN
    IF LENGTH(p_approval_note) > 1000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Note too long (max 1000 characters)');
    END IF;
    v_safe_note := LEFT(TRIM(p_approval_note), 1000);
  ELSE
    v_safe_note := NULL;
  END IF;
  
  -- Allow super_admin OR admin to approve
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve requests');
  END IF;
  
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request cannot be approved in current status');
  END IF;
  
  v_final_amount := COALESCE(p_approved_amount, v_request.amount);
  
  IF v_final_amount > 50000000 THEN
    IF v_safe_note IS NULL OR LENGTH(v_safe_note) < 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requests over IDR 50,000,000 require approval notes');
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM request_attachments 
      WHERE request_id = p_request_id 
      AND attachment_type IN ('invoice', 'quotation')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requests over IDR 50,000,000 require invoice or quotation attachment');
    END IF;
  END IF;
  
  SELECT db.* INTO v_budget
  FROM division_budgets db
  JOIN budget_periods bp ON db.period_id = bp.id
  WHERE db.division_id = v_request.division_id
  AND db.category_id = v_request.category_id
  AND bp.is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active budget found for this category');
  END IF;
  
  v_remaining := v_budget.allocated_amount - v_budget.used_amount;
  
  IF v_remaining < v_final_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget for this request');
  END IF;
  
  UPDATE division_budgets 
  SET used_amount = used_amount + v_final_amount,
      updated_at = NOW()
  WHERE id = v_budget.id;
  
  INSERT INTO budget_movements (
    division_budget_id, request_id, movement_type, amount,
    balance_before, balance_after, performed_by, description
  ) VALUES (
    v_budget.id, p_request_id, 'deduction', v_final_amount,
    v_remaining, v_remaining - v_final_amount, v_user_id,
    'Approved request ' || v_request.request_number
  );
  
  UPDATE requests SET
    status = 'approved',
    approved_at = NOW(),
    approved_by = v_user_id,
    approved_amount = v_final_amount,
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  IF v_safe_note IS NOT NULL THEN
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_request_id, 'approved', 'Request approved', v_user_id, jsonb_build_object('note', v_safe_note, 'approved_amount', v_final_amount));
  ELSE
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_request_id, 'approved', 'Request approved', v_user_id, jsonb_build_object('approved_amount', v_final_amount));
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Request approved successfully', 'approved_amount', v_final_amount);
END;
$$;

-- Recreate reject_request with admin access
CREATE OR REPLACE FUNCTION public.reject_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_user_id UUID;
  v_safe_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required (min 10 characters)');
  END IF;
  v_safe_reason := LEFT(TRIM(p_rejection_reason), 1000);
  
  -- Allow super_admin OR admin to reject
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can reject requests');
  END IF;
  
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request cannot be rejected in current status');
  END IF;
  
  UPDATE requests SET
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = v_user_id,
    rejection_reason = v_safe_reason,
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (p_request_id, 'rejected', 'Request rejected', v_user_id, jsonb_build_object('reason', v_safe_reason));
  
  RETURN jsonb_build_object('success', true, 'message', 'Request rejected');
END;
$$;

-- Recreate approve_cash_advance with admin access
CREATE OR REPLACE FUNCTION public.approve_cash_advance(
  p_ca_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status NOT IN ('submitted', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance cannot be approved in current status');
  END IF;
  
  UPDATE cash_advances
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = v_user_id,
      approval_note = p_note,
      is_locked = true,
      locked_at = NOW(),
      locked_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'approved', 'Cash advance approved', v_user_id, jsonb_build_object('note', p_note));
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance approved');
END;
$$;

-- Recreate reject_cash_advance with admin access
CREATE OR REPLACE FUNCTION public.reject_cash_advance(
  p_ca_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can reject');
  END IF;
  
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status NOT IN ('submitted', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance cannot be rejected in current status');
  END IF;
  
  UPDATE cash_advances
  SET status = 'rejected',
      rejected_at = NOW(),
      rejected_by = v_user_id,
      rejection_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'rejected', 'Cash advance rejected', v_user_id, jsonb_build_object('reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance rejected');
END;
$$;

-- Recreate review_medical_claim_hrga with admin access
CREATE OR REPLACE FUNCTION public.review_medical_claim_hrga(
  p_claim_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim medical_claims%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can review claims');
  END IF;
  
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id FOR UPDATE;
  
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Medical claim not found');
  END IF;
  
  IF v_claim.status != 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim cannot be reviewed in current status');
  END IF;
  
  IF p_action = 'approve' THEN
    UPDATE medical_claims
    SET status = 'review_finance',
        reviewed_hrga_at = NOW(),
        reviewed_hrga_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_claim_id;
    
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'reviewed_hrga', 'Claim reviewed by HRGA - forwarded to Finance', v_user_id, jsonb_build_object('note', p_note));
    
    RETURN jsonb_build_object('success', true, 'message', 'Claim forwarded to Finance for review');
  ELSIF p_action = 'reject' THEN
    IF p_note IS NULL OR LENGTH(TRIM(p_note)) < 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;
    
    UPDATE medical_claims
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = v_user_id,
        rejection_reason = p_note,
        updated_at = NOW()
    WHERE id = p_claim_id;
    
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'rejected', 'Claim rejected by HRGA', v_user_id, jsonb_build_object('reason', p_note));
    
    RETURN jsonb_build_object('success', true, 'message', 'Claim rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use approve or reject');
  END IF;
END;
$$;

-- Recreate approve_budget_transfer with admin access
CREATE OR REPLACE FUNCTION public.approve_budget_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer budget_transfers%ROWTYPE;
  v_from_budget division_budgets%ROWTYPE;
  v_to_budget division_budgets%ROWTYPE;
  v_user_id UUID;
  v_from_remaining NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve transfers');
  END IF;
  
  SELECT * INTO v_transfer FROM budget_transfers WHERE id = p_transfer_id FOR UPDATE;
  
  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  IF v_transfer.status != 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer cannot be approved in current status');
  END IF;
  
  SELECT * INTO v_from_budget FROM division_budgets WHERE id = v_transfer.from_budget_id FOR UPDATE;
  SELECT * INTO v_to_budget FROM division_budgets WHERE id = v_transfer.to_budget_id FOR UPDATE;
  
  IF v_from_budget IS NULL OR v_to_budget IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Budget not found');
  END IF;
  
  v_from_remaining := v_from_budget.allocated_amount - v_from_budget.used_amount;
  
  IF v_from_remaining < v_transfer.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget for transfer');
  END IF;
  
  UPDATE division_budgets
  SET allocated_amount = allocated_amount - v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.from_budget_id;
  
  UPDATE division_budgets
  SET allocated_amount = allocated_amount + v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.to_budget_id;
  
  INSERT INTO budget_movements (division_budget_id, movement_type, amount, balance_before, balance_after, performed_by, description)
  VALUES (v_transfer.from_budget_id, 'transfer_out', v_transfer.amount, v_from_remaining, v_from_remaining - v_transfer.amount, v_user_id, 'Transfer to ' || v_transfer.transfer_number);
  
  INSERT INTO budget_movements (division_budget_id, movement_type, amount, balance_before, balance_after, performed_by, description)
  VALUES (v_transfer.to_budget_id, 'transfer_in', v_transfer.amount, v_to_budget.allocated_amount - v_to_budget.used_amount, v_to_budget.allocated_amount - v_to_budget.used_amount + v_transfer.amount, v_user_id, 'Transfer from ' || v_transfer.transfer_number);
  
  UPDATE budget_transfers
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_transfer_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Transfer approved');
END;
$$;

-- Recreate reject_budget_transfer with admin access
CREATE OR REPLACE FUNCTION public.reject_budget_transfer(
  p_transfer_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer budget_transfers%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can reject transfers');
  END IF;
  
  IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;
  
  SELECT * INTO v_transfer FROM budget_transfers WHERE id = p_transfer_id FOR UPDATE;
  
  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  IF v_transfer.status != 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer cannot be rejected in current status');
  END IF;
  
  UPDATE budget_transfers
  SET status = 'rejected',
      rejected_at = NOW(),
      rejected_by = v_user_id,
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
  WHERE id = p_transfer_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Transfer rejected');
END;
$$;