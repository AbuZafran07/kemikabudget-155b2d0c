-- Update submit_cash_advance function to handle category per item
CREATE OR REPLACE FUNCTION public.submit_cash_advance(p_ca_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_budget division_budgets%ROWTYPE;
  v_user_id UUID;
  v_period_id UUID;
  v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance is not in draft status');
  END IF;
  
  IF v_ca.requester_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get active period
  SELECT id INTO v_period_id FROM budget_periods WHERE is_active = true LIMIT 1;
  
  IF v_period_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active budget period found');
  END IF;
  
  -- Process each item and create commitment entries per category
  FOR v_item IN 
    SELECT category_id, SUM(amount) as total_amount 
    FROM cash_advance_items 
    WHERE cash_advance_id = p_ca_id AND category_id IS NOT NULL
    GROUP BY category_id
  LOOP
    -- Get budget for this category
    SELECT db.* INTO v_budget
    FROM division_budgets db
    WHERE db.division_id = v_ca.division_id
    AND db.category_id = v_item.category_id
    AND db.period_id = v_period_id
    FOR UPDATE;
    
    IF v_budget IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active budget found for category');
    END IF;
    
    -- Create commitment entry in budget_ledger for this category
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
    ) VALUES (
      v_budget.id, 'commitment_add', v_item.total_amount, 'cash_advance', p_ca_id,
      'Commitment for CA ' || v_ca.ca_number || ' (category)', v_user_id
    );
  END LOOP;
  
  -- Update CA status
  UPDATE cash_advances
  SET status = 'submitted',
      submitted_at = NOW(),
      period_id = v_period_id,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  -- Log event
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by)
  VALUES (p_ca_id, 'submitted', 'Cash advance submitted', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance submitted');
END;
$function$;