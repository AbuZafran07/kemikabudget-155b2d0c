
-- Drop and recreate the topup_petty_cash function to include source bank deduction
CREATE OR REPLACE FUNCTION public.topup_petty_cash(
  p_funding_source_id UUID,
  p_amount NUMERIC,
  p_source_bank_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_petty_cash RECORD;
  v_source_bank RECORD;
  v_new_petty_balance NUMERIC;
  v_new_bank_balance NUMERIC;
BEGIN
  -- Check authorization
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get petty cash funding source
  SELECT * INTO v_petty_cash FROM funding_sources WHERE id = p_funding_source_id FOR UPDATE;
  
  IF v_petty_cash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Petty cash account not found');
  END IF;

  IF v_petty_cash.type != 'petty_cash' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This is not a petty cash account');
  END IF;

  -- If source bank is provided, deduct from bank
  IF p_source_bank_id IS NOT NULL THEN
    SELECT * INTO v_source_bank FROM funding_sources WHERE id = p_source_bank_id FOR UPDATE;
    
    IF v_source_bank IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Source bank not found');
    END IF;

    IF v_source_bank.type != 'bank' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Source must be a bank account');
    END IF;

    IF v_source_bank.balance < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient bank balance. Available: ' || v_source_bank.balance::TEXT);
    END IF;

    -- Deduct from bank
    v_new_bank_balance := v_source_bank.balance - p_amount;
    UPDATE funding_sources 
    SET balance = v_new_bank_balance, updated_at = now() 
    WHERE id = p_source_bank_id;
  END IF;

  -- Add to petty cash
  v_new_petty_balance := v_petty_cash.balance + p_amount;
  UPDATE funding_sources 
  SET balance = v_new_petty_balance, updated_at = now() 
  WHERE id = p_funding_source_id;

  -- Record petty cash transaction (incoming)
  INSERT INTO petty_cash_transactions (
    funding_source_id, transaction_type, amount, balance_before, balance_after,
    description, reference_number, performed_by
  ) VALUES (
    p_funding_source_id, 
    'top_up', 
    p_amount, 
    v_petty_cash.balance, 
    v_new_petty_balance,
    COALESCE(p_description, 'Top-up kas kecil') || 
      CASE WHEN p_source_bank_id IS NOT NULL THEN ' dari ' || v_source_bank.name ELSE '' END, 
    p_reference_number, 
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true, 
    'new_petty_balance', v_new_petty_balance,
    'new_bank_balance', v_new_bank_balance,
    'source_bank_name', v_source_bank.name
  );
END;
$$;
