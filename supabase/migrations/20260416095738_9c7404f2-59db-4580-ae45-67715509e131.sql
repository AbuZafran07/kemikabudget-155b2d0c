
DROP FUNCTION IF EXISTS public.reject_cash_advance(uuid, text);

CREATE FUNCTION public.reject_cash_advance(p_ca_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
  v_ledger RECORD;
BEGIN
  v_user_id := auth.uid();
  
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
  
  -- Release all commitment entries for this CA
  FOR v_ledger IN
    SELECT division_budget_id, amount
    FROM budget_ledger
    WHERE reference_type = 'cash_advance' AND reference_id = p_ca_id AND entry_type = 'commitment_add'
  LOOP
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
    ) VALUES (
      v_ledger.division_budget_id, 'commitment_release', v_ledger.amount, 'cash_advance', p_ca_id,
      'Commitment released - CA rejected: ' || v_ca.ca_number, v_user_id
    );
  END LOOP;
  
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
