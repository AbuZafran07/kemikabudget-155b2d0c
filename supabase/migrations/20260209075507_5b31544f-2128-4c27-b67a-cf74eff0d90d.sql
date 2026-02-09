-- Update approve_request function to accept more attachment types for large requests
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
    
    -- Accept invoice, quotation, receipt, or other as valid document types
    IF NOT EXISTS (
      SELECT 1 FROM request_attachments 
      WHERE request_id = p_request_id 
      AND attachment_type IN ('invoice', 'quotation', 'receipt', 'other')
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