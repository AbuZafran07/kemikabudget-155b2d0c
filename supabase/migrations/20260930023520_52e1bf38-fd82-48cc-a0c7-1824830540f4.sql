CREATE OR REPLACE FUNCTION public.delete_medical_claim(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Klaim tidak ditemukan'); END IF;
  IF v_claim.status <> 'draft' THEN RETURN jsonb_build_object('success', false, 'error', 'Hanya klaim berstatus Draft yang bisa dihapus'); END IF;
  IF v_claim.employee_id <> auth.uid() AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Anda tidak berhak menghapus klaim ini');
  END IF;
  DELETE FROM medical_ledger WHERE claim_id = p_claim_id;
  DELETE FROM medical_claim_events WHERE claim_id = p_claim_id;
  DELETE FROM medical_claim_attachments WHERE claim_id = p_claim_id;
  DELETE FROM medical_claims WHERE id = p_claim_id;
  INSERT INTO audit_logs(event_type, entity_type, entity_id, user_id, description)
  VALUES ('delete', 'medical_claim', p_claim_id, auth.uid(), 'Draft klaim medis ' || v_claim.claim_number || ' dihapus');
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.delete_medical_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_medical_claim(uuid) TO authenticated;