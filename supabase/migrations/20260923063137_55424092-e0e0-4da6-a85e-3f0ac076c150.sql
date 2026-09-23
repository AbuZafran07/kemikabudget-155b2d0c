-- 1. Add 'revised' status value
ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'revised';

-- 2. Rewrite unlock_settlement: keep old settlement as 'revised' history, clone to a new draft
CREATE OR REPLACE FUNCTION public.unlock_settlement(p_settlement_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement cash_advance_settlements%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_budget_id UUID;
  v_user_id UUID;
  v_new_settlement_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super admin can unlock settlements');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan revisi wajib diisi');
  END IF;

  SELECT * INTO v_settlement FROM cash_advance_settlements WHERE id = p_settlement_id FOR UPDATE;

  IF v_settlement IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found');
  END IF;

  IF v_settlement.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya realisasi yang sudah disetujui dapat dibuka kunci');
  END IF;

  SELECT * INTO v_ca FROM cash_advances WHERE id = v_settlement.cash_advance_id FOR UPDATE;

  SELECT division_budget_id INTO v_budget_id
  FROM budget_ledger
  WHERE reference_type = 'cash_advance' AND reference_id = v_ca.id
    AND entry_type = 'commitment_add'
  LIMIT 1;

  IF v_budget_id IS NOT NULL THEN
    -- Reverse actual expense
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
    ) VALUES (
      v_budget_id, 'actual_release', v_settlement.total_realized, 'settlement', p_settlement_id,
      'Pembatalan realisasi (revisi) ' || v_settlement.settlement_number, v_user_id
    );

    -- Re-apply commitment for the cash advance
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
    ) VALUES (
      v_budget_id, 'commitment_add', v_ca.total_amount, 'cash_advance', v_ca.id,
      'Komitmen dipasang ulang karena revisi realisasi ' || v_settlement.settlement_number, v_user_id
    );

    UPDATE division_budgets
    SET used_amount = GREATEST(used_amount - v_settlement.total_realized, 0),
        updated_at = NOW()
    WHERE id = v_budget_id;
  END IF;

  -- Keep the old settlement as history with status 'revised' (read-only record)
  UPDATE cash_advance_settlements
  SET status = 'revised',
      rejection_reason = 'Direvisi oleh Super Admin. Alasan: ' || p_reason,
      updated_at = NOW()
  WHERE id = p_settlement_id;

  -- Create a new draft settlement cloned from the old one (items copied)
  INSERT INTO cash_advance_settlements (
    settlement_number, cash_advance_id, status, total_realized, variance_amount, notes, created_by
  ) VALUES (
    '', v_settlement.cash_advance_id, 'draft', v_settlement.total_realized, v_settlement.variance_amount,
    'Revisi dari ' || v_settlement.settlement_number || '. Alasan: ' || p_reason, v_user_id
  )
  RETURNING id INTO v_new_settlement_id;

  INSERT INTO cash_advance_settlement_items (
    settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes
  )
  SELECT v_new_settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes
  FROM cash_advance_settlement_items
  WHERE settlement_id = p_settlement_id;

  UPDATE cash_advances
  SET status = 'paid',
      total_realized = NULL,
      settled_at = NULL,
      settled_by = NULL,
      is_locked = false,
      updated_at = NOW()
  WHERE id = v_ca.id;

  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (
    v_ca.id,
    'settlement_unlocked',
    'Realisasi ' || v_settlement.settlement_number || ' dibuka kembali untuk revisi. Alasan: ' || p_reason,
    v_user_id,
    jsonb_build_object(
      'settlement_id', p_settlement_id,
      'settlement_number', v_settlement.settlement_number,
      'new_settlement_id', v_new_settlement_id,
      'reason', p_reason,
      'previous_realized', v_settlement.total_realized
    )
  );

  INSERT INTO audit_logs (event_type, entity_type, entity_id, user_id, description, metadata)
  VALUES (
    'updated', 'cash_advance', v_ca.id, v_user_id,
    'Revisi realisasi ' || v_settlement.settlement_number || ': ' || p_reason,
    jsonb_build_object('settlement_id', p_settlement_id, 'new_settlement_id', v_new_settlement_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Realisasi dibuka untuk revisi, salinan draft baru telah dibuat', 'new_settlement_id', v_new_settlement_id);
END;
$function$