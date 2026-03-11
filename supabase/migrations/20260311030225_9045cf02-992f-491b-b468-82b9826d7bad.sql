
-- Function to delete a Cash Advance (Super Admin only)
-- Reverses all budget commitments, payments, and related records
CREATE OR REPLACE FUNCTION public.delete_cash_advance(p_ca_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
  v_funding funding_sources%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  
  -- Only super_admin can delete
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can delete Cash Advances');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash Advance not found');
  END IF;
  
  -- If paid, reverse funding source balance
  IF v_ca.status IN ('paid', 'partially_settled', 'settled') AND v_ca.funding_source_id IS NOT NULL THEN
    SELECT * INTO v_funding FROM funding_sources WHERE id = v_ca.funding_source_id FOR UPDATE;
    IF FOUND THEN
      UPDATE funding_sources
      SET balance = balance + v_ca.total_amount,
          updated_at = now()
      WHERE id = v_ca.funding_source_id;
    END IF;
  END IF;
  
  -- Reverse budget ledger entries for this CA
  DELETE FROM budget_ledger WHERE reference_id = p_ca_id AND reference_type = 'cash_advance';
  
  -- Delete settlement items
  DELETE FROM cash_advance_settlement_items WHERE settlement_id IN (
    SELECT id FROM cash_advance_settlements WHERE cash_advance_id = p_ca_id
  );
  
  -- Delete settlements
  DELETE FROM cash_advance_settlements WHERE cash_advance_id = p_ca_id;
  
  -- Delete CA items
  DELETE FROM cash_advance_items WHERE cash_advance_id = p_ca_id;
  
  -- Delete CA events
  DELETE FROM cash_advance_events WHERE cash_advance_id = p_ca_id;
  
  -- Log to audit
  INSERT INTO audit_logs (event_type, entity_type, entity_id, user_id, description, metadata)
  VALUES ('cancelled', 'request', p_ca_id, v_user_id, 
    'Cash Advance ' || v_ca.ca_number || ' deleted by Super Admin (status was: ' || v_ca.status || ')',
    jsonb_build_object('ca_number', v_ca.ca_number, 'status', v_ca.status, 'total_amount', v_ca.total_amount, 'division_id', v_ca.division_id));
  
  -- Delete the CA itself
  DELETE FROM cash_advances WHERE id = p_ca_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash Advance deleted successfully');
END;
$$;
