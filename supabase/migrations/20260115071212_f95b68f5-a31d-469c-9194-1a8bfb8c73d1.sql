-- Fix: Add validation for positive transfer amount in approve_budget_transfer function
-- Security Issue: budget_transfer_amount (INPUT_VALIDATION)

-- Drop existing function first
DROP FUNCTION IF EXISTS public.approve_budget_transfer(UUID);

-- Recreate with security validations
CREATE OR REPLACE FUNCTION public.approve_budget_transfer(p_transfer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_transfer budget_transfers%ROWTYPE;
  v_from_budget division_budgets%ROWTYPE;
  v_to_budget division_budgets%ROWTYPE;
  v_from_remaining NUMERIC;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Verify user is super_admin
  IF NOT public.has_role(v_user_id, 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only super_admin can approve transfers');
  END IF;
  
  -- Get transfer with lock
  SELECT * INTO v_transfer FROM budget_transfers WHERE id = p_transfer_id FOR UPDATE;
  
  IF v_transfer IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  -- SECURITY FIX: Validate transfer amount is positive
  IF v_transfer.amount IS NULL OR v_transfer.amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Transfer amount must be positive');
  END IF;
  
  -- SECURITY FIX: Validate from_budget_id != to_budget_id (prevent self-transfers)
  IF v_transfer.from_budget_id = v_transfer.to_budget_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to the same budget');
  END IF;
  
  IF v_transfer.status != 'submitted' THEN
    RETURN json_build_object('success', false, 'error', 'Transfer must be in submitted status');
  END IF;
  
  -- Get source budget
  SELECT * INTO v_from_budget FROM division_budgets WHERE id = v_transfer.from_budget_id FOR UPDATE;
  
  IF v_from_budget IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Source budget not found');
  END IF;
  
  -- Get destination budget
  SELECT * INTO v_to_budget FROM division_budgets WHERE id = v_transfer.to_budget_id FOR UPDATE;
  
  IF v_to_budget IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Destination budget not found');
  END IF;
  
  -- SECURITY FIX: Validate both budgets belong to the same division
  IF v_from_budget.division_id != v_to_budget.division_id THEN
    RETURN json_build_object('success', false, 'error', 'Both budgets must belong to the same division');
  END IF;
  
  -- Check sufficient budget
  v_from_remaining := v_from_budget.allocated_amount - v_from_budget.used_amount;
  
  IF v_from_remaining < v_transfer.amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient budget in source category');
  END IF;
  
  -- Update source budget (decrease)
  UPDATE division_budgets
  SET allocated_amount = allocated_amount - v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.from_budget_id;
  
  -- Record source budget movement
  INSERT INTO budget_movements (
    division_budget_id,
    movement_type,
    amount,
    balance_before,
    balance_after,
    description,
    performed_by
  ) VALUES (
    v_transfer.from_budget_id,
    'transfer_out',
    v_transfer.amount,
    v_from_budget.allocated_amount,
    v_from_budget.allocated_amount - v_transfer.amount,
    'Transfer out: ' || v_transfer.transfer_number,
    v_user_id
  );
  
  -- Update destination budget (increase)
  UPDATE division_budgets
  SET allocated_amount = allocated_amount + v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.to_budget_id;
  
  -- Record destination budget movement
  INSERT INTO budget_movements (
    division_budget_id,
    movement_type,
    amount,
    balance_before,
    balance_after,
    description,
    performed_by
  ) VALUES (
    v_transfer.to_budget_id,
    'transfer_in',
    v_transfer.amount,
    v_to_budget.allocated_amount,
    v_to_budget.allocated_amount + v_transfer.amount,
    'Transfer in: ' || v_transfer.transfer_number,
    v_user_id
  );
  
  -- Update transfer status
  UPDATE budget_transfers
  SET status = 'approved',
      approved_by = v_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_transfer_id;
  
  -- Log audit
  INSERT INTO audit_logs (user_id, event_type, entity_type, entity_id, description)
  VALUES (v_user_id, 'TRANSFER_APPROVED', 'budget_transfer', p_transfer_id, 
          'Approved budget transfer ' || v_transfer.transfer_number || ' for amount ' || v_transfer.amount);
  
  RETURN json_build_object('success', true);
END;
$$;