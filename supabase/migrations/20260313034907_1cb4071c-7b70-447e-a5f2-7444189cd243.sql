
CREATE OR REPLACE FUNCTION public.pay_request(p_request_id UUID, p_payment_note TEXT DEFAULT NULL, p_paid_amount NUMERIC DEFAULT NULL)
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
  v_approved_amount NUMERIC;
  v_actual_amount NUMERIC;
  v_difference NUMERIC;
  v_budget_id UUID;
  v_budget_record division_budgets%ROWTYPE;
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
  
  v_approved_amount := COALESCE(v_request.approved_amount, v_request.amount);
  
  IF p_paid_amount IS NOT NULL THEN
    IF p_paid_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Paid amount must be greater than zero');
    END IF;
    IF p_paid_amount > v_approved_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Paid amount cannot exceed approved amount');
    END IF;
    v_actual_amount := p_paid_amount;
  ELSE
    v_actual_amount := v_approved_amount;
  END IF;
  
  v_difference := v_approved_amount - v_actual_amount;
  
  SELECT * INTO v_funding FROM funding_sources WHERE id = v_request.funding_source_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;
  
  IF v_funding.balance < v_actual_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;
  
  UPDATE funding_sources
  SET balance = balance - v_actual_amount, updated_at = now()
  WHERE id = v_request.funding_source_id;
  
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (funding_source_id, transaction_type, amount, balance_before, balance_after, performed_by, description, request_id)
    VALUES (v_request.funding_source_id, 'payment', v_actual_amount, v_funding.balance, v_funding.balance - v_actual_amount, v_user_id, 'Payment for request ' || v_request.request_number, p_request_id);
  END IF;
  
  IF v_difference > 0 THEN
    SELECT id INTO v_budget_id FROM division_budgets
    WHERE division_id = v_request.division_id AND category_id = v_request.category_id AND period_id = v_request.period_id LIMIT 1;
    
    IF v_budget_id IS NOT NULL THEN
      SELECT * INTO v_budget_record FROM division_budgets WHERE id = v_budget_id;
      
      UPDATE division_budgets SET used_amount = used_amount - v_difference, updated_at = NOW() WHERE id = v_budget_id;
      
      INSERT INTO budget_movements (division_budget_id, request_id, amount, balance_before, balance_after, movement_type, performed_by, description)
      VALUES (v_budget_id, p_request_id, v_difference, v_budget_record.allocated_amount - v_budget_record.used_amount, v_budget_record.allocated_amount - v_budget_record.used_amount + v_difference, 'reversal', v_user_id, 'Budget difference restored - paid ' || v_actual_amount || ' of approved ' || v_approved_amount);

      INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_id, reference_type, performed_by, description)
      VALUES (v_budget_id, 'refund', v_difference, p_request_id, 'request', v_user_id, 'Partial payment difference refund');
    END IF;
  END IF;
  
  UPDATE requests
  SET status = 'paid', paid_at = now(), paid_by = v_user_id, is_locked = true, locked_at = now(), locked_by = v_user_id, updated_at = now()
  WHERE id = p_request_id;
  
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (
    p_request_id,
    'paid',
    CASE WHEN v_difference > 0 
      THEN 'Payment processed with adjusted amount: ' || v_actual_amount || ' (difference ' || v_difference || ' restored to budget)'
      ELSE 'Payment processed'
    END,
    v_user_id,
    jsonb_build_object('funding_source', v_funding.name, 'approved_amount', v_approved_amount, 'paid_amount', v_actual_amount, 'difference', v_difference, 'payment_note', v_safe_note)
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'Payment processed successfully', 'paid_amount', v_actual_amount, 'difference', v_difference);
END;
$$;
