
CREATE OR REPLACE FUNCTION public.reject_settlement(p_settlement_id UUID, p_reason TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement cash_advance_settlements%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance or super admin can reject settlements');
  END IF;
  
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;
  
  SELECT * INTO v_settlement FROM cash_advance_settlements WHERE id = p_settlement_id FOR UPDATE;
  
  IF v_settlement IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found');
  END IF;
  
  IF v_settlement.status != 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is not in submitted status');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = v_settlement.cash_advance_id;
  
  -- Update settlement status to rejected
  UPDATE cash_advance_settlements
  SET status = 'rejected',
      rejected_at = NOW(),
      rejected_by = v_user_id,
      rejection_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_settlement_id;
  
  -- Log event
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (v_ca.id, 'settlement_rejected', 'Settlement rejected: ' || p_reason, v_user_id, 
    jsonb_build_object('settlement_id', p_settlement_id, 'reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'message', 'Settlement rejected');
END;
$$;
