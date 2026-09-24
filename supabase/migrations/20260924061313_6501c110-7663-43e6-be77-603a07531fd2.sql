CREATE OR REPLACE FUNCTION public.submit_cash_advance(p_ca_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_budget division_budgets%ROWTYPE;
  v_user_id UUID;
  v_period_id UUID;
  v_item RECORD;
  v_cat_name TEXT;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  IF v_ca IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found'); END IF;
  IF v_ca.status != 'draft' THEN RETURN jsonb_build_object('success', false, 'error', 'Cash advance is not in draft status'); END IF;
  IF v_ca.requester_id != v_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'Not authorized'); END IF;

  SELECT id INTO v_period_id FROM budget_periods WHERE is_active = true LIMIT 1;
  IF v_period_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No active budget period found'); END IF;

  FOR v_item IN
    SELECT category_id, SUM(amount) AS total_amount FROM cash_advance_items
    WHERE cash_advance_id = p_ca_id AND category_id IS NOT NULL GROUP BY category_id
  LOOP
    SELECT db.* INTO v_budget FROM division_budgets db
    WHERE db.division_id = v_ca.division_id AND db.category_id = v_item.category_id AND db.period_id = v_period_id
    FOR UPDATE;
    IF v_budget IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No active budget found for category'); END IF;

    IF (v_budget.allocated_amount - v_budget.used_amount) < v_item.total_amount THEN
      SELECT name INTO v_cat_name FROM cost_categories WHERE id = v_item.category_id;
      RAISE EXCEPTION 'Sisa anggaran pos % tidak mencukupi (sisa Rp %, dibutuhkan Rp %)',
        v_cat_name, to_char(v_budget.allocated_amount - v_budget.used_amount, 'FM999G999G999G990'),
        to_char(v_item.total_amount, 'FM999G999G999G990');
    END IF;

    INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by)
    VALUES (v_budget.id, 'commitment_add', v_item.total_amount, 'cash_advance', p_ca_id,
      'Commitment for CA ' || v_ca.ca_number || ' (category)', v_user_id);
  END LOOP;

  UPDATE cash_advances SET status = 'submitted', submitted_at = NOW(), period_id = v_period_id, updated_at = NOW() WHERE id = p_ca_id;
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by)
  VALUES (p_ca_id, 'submitted', 'Cash advance submitted', v_user_id);
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance submitted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_settlement(p_settlement_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement cash_advance_settlements%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
  v_variance NUMERIC;
  v_period_id UUID;
  v_items_total NUMERIC;
  v_allocated NUMERIC := 0;
  v_share NUMERIC;
  v_budget division_budgets%ROWTYPE;
  v_row RECORD;
  v_count INT;
  v_idx INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance or super admin can approve settlements');
  END IF;
  SELECT * INTO v_settlement FROM cash_advance_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Settlement not found'); END IF;
  IF v_settlement.status != 'submitted' THEN RETURN jsonb_build_object('success', false, 'error', 'Settlement is not in submitted status'); END IF;

  SELECT * INTO v_ca FROM cash_advances WHERE id = v_settlement.cash_advance_id FOR UPDATE;
  v_period_id := COALESCE(v_ca.period_id, (SELECT id FROM budget_periods WHERE is_active = true LIMIT 1));

  SELECT COALESCE(SUM(amount),0), COUNT(DISTINCT category_id) INTO v_items_total, v_count
  FROM cash_advance_items WHERE cash_advance_id = v_ca.id AND category_id IS NOT NULL;
  IF v_items_total <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Kas bon tidak memiliki pos anggaran'); END IF;

  FOR v_row IN
    SELECT category_id, SUM(amount) AS cat_total FROM cash_advance_items
    WHERE cash_advance_id = v_ca.id AND category_id IS NOT NULL GROUP BY category_id ORDER BY category_id
  LOOP
    v_idx := v_idx + 1;
    SELECT * INTO v_budget FROM division_budgets
    WHERE division_id = v_ca.division_id AND category_id = v_row.category_id AND period_id = v_period_id FOR UPDATE;
    IF v_budget IS NULL THEN RAISE EXCEPTION 'Anggaran pos tidak ditemukan untuk kas bon ini'; END IF;

    IF v_idx = v_count THEN
      v_share := v_settlement.total_realized - v_allocated;
    ELSE
      v_share := ROUND(v_settlement.total_realized * v_row.cat_total / v_items_total, 0);
    END IF;
    v_allocated := v_allocated + v_share;

    IF (v_budget.allocated_amount - v_budget.used_amount) < v_share THEN
      RAISE EXCEPTION 'Sisa anggaran pos tidak mencukupi untuk realisasi (sisa Rp %, dibutuhkan Rp %). Lakukan Transfer Anggaran terlebih dahulu.',
        to_char(v_budget.allocated_amount - v_budget.used_amount, 'FM999G999G999G990'), to_char(v_share, 'FM999G999G999G990');
    END IF;

    INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by)
    VALUES (v_budget.id, 'commitment_release', v_row.cat_total, 'settlement', p_settlement_id,
      'Commitment released for settlement ' || v_settlement.settlement_number, v_user_id);
    INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by)
    VALUES (v_budget.id, 'actual_add', v_share, 'settlement', p_settlement_id,
      'Actual expense for settlement ' || v_settlement.settlement_number, v_user_id);
    UPDATE division_budgets SET used_amount = used_amount + v_share, updated_at = NOW() WHERE id = v_budget.id;
  END LOOP;

  v_variance := v_ca.total_amount - v_settlement.total_realized;
  UPDATE cash_advance_settlements SET status = 'approved', approved_at = NOW(), approved_by = v_user_id,
    approval_note = p_note, variance_amount = v_variance, updated_at = NOW() WHERE id = p_settlement_id;
  UPDATE cash_advances SET status = 'settled', total_realized = v_settlement.total_realized, settled_at = NOW(),
    settled_by = v_user_id, updated_at = NOW() WHERE id = v_ca.id;
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (v_ca.id, 'settled', 'Cash advance settled', v_user_id,
    jsonb_build_object('settlement_id', p_settlement_id, 'realized', v_settlement.total_realized, 'variance', v_variance));
  RETURN jsonb_build_object('success', true, 'message', 'Settlement approved', 'variance', v_variance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlock_settlement(p_settlement_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement cash_advance_settlements%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
  v_new_settlement_id UUID;
  v_row RECORD;
  v_period_id UUID;
  v_budget_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF NOT has_role(v_user_id, 'super_admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Only super admin can unlock settlements'); END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'Alasan revisi wajib diisi'); END IF;
  SELECT * INTO v_settlement FROM cash_advance_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Settlement not found'); END IF;
  IF v_settlement.status != 'approved' THEN RETURN jsonb_build_object('success', false, 'error', 'Hanya realisasi yang sudah disetujui dapat dibuka kunci'); END IF;
  SELECT * INTO v_ca FROM cash_advances WHERE id = v_settlement.cash_advance_id FOR UPDATE;
  v_period_id := COALESCE(v_ca.period_id, (SELECT id FROM budget_periods WHERE is_active = true LIMIT 1));

  -- Reverse actual exactly as it was posted, per budget
  FOR v_row IN
    SELECT division_budget_id, SUM(amount) AS amt FROM budget_ledger
    WHERE reference_type = 'settlement' AND reference_id = p_settlement_id AND entry_type = 'actual_add'
    GROUP BY division_budget_id
  LOOP
    INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by)
    VALUES (v_row.division_budget_id, 'actual_release', v_row.amt, 'settlement', p_settlement_id,
      'Pembatalan realisasi (revisi) ' || v_settlement.settlement_number, v_user_id);
    UPDATE division_budgets SET used_amount = GREATEST(used_amount - v_row.amt, 0), updated_at = NOW()
    WHERE id = v_row.division_budget_id;
  END LOOP;

  -- Re-apply commitment per category
  FOR v_row IN
    SELECT category_id, SUM(amount) AS amt FROM cash_advance_items
    WHERE cash_advance_id = v_ca.id AND category_id IS NOT NULL GROUP BY category_id
  LOOP
    SELECT id INTO v_budget_id FROM division_budgets
    WHERE division_id = v_ca.division_id AND category_id = v_row.category_id AND period_id = v_period_id;
    IF v_budget_id IS NOT NULL THEN
      INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by)
      VALUES (v_budget_id, 'commitment_add', v_row.amt, 'cash_advance', v_ca.id,
        'Komitmen dipasang ulang karena revisi realisasi ' || v_settlement.settlement_number, v_user_id);
    END IF;
  END LOOP;

  UPDATE cash_advance_settlements SET status = 'revised',
    rejection_reason = 'Direvisi oleh Super Admin. Alasan: ' || p_reason, updated_at = NOW() WHERE id = p_settlement_id;

  INSERT INTO cash_advance_settlements (settlement_number, cash_advance_id, status, total_realized, variance_amount, notes, created_by)
  VALUES ('', v_settlement.cash_advance_id, 'draft', v_settlement.total_realized, v_settlement.variance_amount,
    'Revisi dari ' || v_settlement.settlement_number || '. Alasan: ' || p_reason, v_user_id)
  RETURNING id INTO v_new_settlement_id;

  INSERT INTO cash_advance_settlement_items (settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes)
  SELECT v_new_settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes
  FROM cash_advance_settlement_items WHERE settlement_id = p_settlement_id;

  UPDATE cash_advances SET status = 'paid', total_realized = NULL, settled_at = NULL, settled_by = NULL,
    is_locked = false, updated_at = NOW() WHERE id = v_ca.id;

  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (v_ca.id, 'settlement_unlocked',
    'Realisasi ' || v_settlement.settlement_number || ' dibuka kembali untuk revisi. Alasan: ' || p_reason, v_user_id,
    jsonb_build_object('settlement_id', p_settlement_id, 'settlement_number', v_settlement.settlement_number,
      'new_settlement_id', v_new_settlement_id, 'reason', p_reason, 'previous_realized', v_settlement.total_realized));
  INSERT INTO audit_logs (event_type, entity_type, entity_id, user_id, description, metadata)
  VALUES ('updated', 'cash_advance', v_ca.id, v_user_id,
    'Revisi realisasi ' || v_settlement.settlement_number || ': ' || p_reason,
    jsonb_build_object('settlement_id', p_settlement_id, 'new_settlement_id', v_new_settlement_id, 'reason', p_reason));
  RETURN jsonb_build_object('success', true, 'message', 'Realisasi dibuka untuk revisi, salinan draft baru telah dibuat', 'new_settlement_id', v_new_settlement_id);
END;
$function$;