CREATE OR REPLACE FUNCTION public.pay_request(p_request_id UUID, p_payment_note TEXT DEFAULT NULL)
RETURNS JSONB
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
  
  UPDATE funding_sources
  SET balance = balance - COALESCE(v_request.approved_amount, v_request.amount),
      updated_at = now()
  WHERE id = v_request.funding_source_id;
  
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (
      funding_source_id, transaction_type, amount, balance_before, balance_after,
      performed_by, description, request_id
    ) VALUES (
      v_request.funding_source_id,
      'payment',
      COALESCE(v_request.approved_amount, v_request.amount),
      v_funding.balance,
      v_funding.balance - COALESCE(v_request.approved_amount, v_request.amount),
      v_user_id,
      'Payment for request ' || v_request.request_number,
      p_request_id
    );
  END IF;
  
  UPDATE requests
  SET status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      notes = CASE WHEN v_safe_note IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Payment note: ' || v_safe_note ELSE notes END,
      updated_at = now()
  WHERE id = p_request_id;
  
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