
CREATE OR REPLACE FUNCTION public.approve_adjustment(p_adjustment_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_user_id UUID;
  v_budget_id UUID;
  v_old_used NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Hanya Super Admin yang dapat menyetujui adjustment');
  END IF;
  
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id AND status = 'pending' FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment tidak ditemukan atau sudah diproses');
  END IF;
  
  IF v_adj.created_by = v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Tidak dapat menyetujui adjustment sendiri');
  END IF;
  
  UPDATE adjustments SET
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now(),
    approval_note = p_note,
    updated_at = now()
  WHERE id = p_adjustment_id;
  
  IF v_adj.adjust_budget AND v_adj.category_id IS NOT NULL AND v_adj.period_id IS NOT NULL THEN
    SELECT id, used_amount INTO v_budget_id, v_old_used
    FROM division_budgets
    WHERE division_id = v_adj.division_id
      AND category_id = v_adj.category_id
      AND period_id = v_adj.period_id
    FOR UPDATE;
    
    IF v_budget_id IS NOT NULL THEN
      UPDATE division_budgets
      SET used_amount = used_amount + v_adj.difference_amount,
          updated_at = now()
      WHERE id = v_budget_id;
      
      INSERT INTO budget_movements (
        division_budget_id, movement_type, amount,
        balance_before, balance_after,
        description, performed_by, request_id
      ) VALUES (
        v_budget_id, 'adjustment', ABS(v_adj.difference_amount),
        v_old_used, v_old_used + v_adj.difference_amount,
        'Adjustment: ' || v_adj.reason, v_user_id,
        CASE WHEN v_adj.reference_type = 'expense_request' THEN v_adj.reference_id::UUID ELSE NULL END
      );
    END IF;
  END IF;
  
  IF v_adj.adjust_cash AND v_adj.funding_source_id IS NOT NULL THEN
    UPDATE funding_sources
    SET balance = balance - v_adj.difference_amount,
        updated_at = now()
    WHERE id = v_adj.funding_source_id;
  END IF;
  
  IF v_adj.reference_type = 'expense_request' THEN
    UPDATE requests SET approved_amount = v_adj.adjusted_amount, updated_at = now() WHERE id = v_adj.reference_id::UUID;
  ELSIF v_adj.reference_type = 'cash_advance' THEN
    UPDATE cash_advances SET total_amount = v_adj.adjusted_amount, updated_at = now() WHERE id = v_adj.reference_id::UUID;
  ELSIF v_adj.reference_type = 'medical_claim' THEN
    UPDATE medical_claims SET approved_amount = v_adj.adjusted_amount, updated_at = now() WHERE id = v_adj.reference_id::UUID;
  END IF;
  
  -- Fix: cast reference_id to UUID for entity_id column
  INSERT INTO audit_logs (event_type, entity_type, entity_id, description, user_id)
  VALUES (
    'adjustment_approved',
    v_adj.reference_type,
    v_adj.reference_id::UUID,
    'Adjustment approved: ' || v_adj.original_amount || ' → ' || v_adj.adjusted_amount || ' (' || v_adj.reason || ')',
    v_user_id
  );
  
  RETURN json_build_object('success', true);
END;
$$;
