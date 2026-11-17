ALTER TABLE public.budget_transfers ADD COLUMN IF NOT EXISTS to_division_id uuid REFERENCES public.divisions(id);
UPDATE public.budget_transfers t SET to_division_id = b.division_id FROM public.division_budgets b WHERE b.id = t.to_budget_id AND t.to_division_id IS NULL;

CREATE OR REPLACE FUNCTION public.validate_budget_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f division_budgets%ROWTYPE; tb division_budgets%ROWTYPE;
BEGIN
  SELECT * INTO f FROM division_budgets WHERE id = NEW.from_budget_id;
  SELECT * INTO tb FROM division_budgets WHERE id = NEW.to_budget_id;
  IF f.id IS NULL OR tb.id IS NULL THEN RAISE EXCEPTION 'Pos anggaran tidak ditemukan'; END IF;
  IF f.id = tb.id THEN RAISE EXCEPTION 'Pos asal dan tujuan tidak boleh sama'; END IF;
  IF f.period_id <> tb.period_id THEN RAISE EXCEPTION 'Pos asal dan tujuan harus di periode anggaran yang sama'; END IF;
  NEW.division_id := f.division_id;
  NEW.to_division_id := tb.division_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_budget_transfer ON public.budget_transfers;
CREATE TRIGGER trg_validate_budget_transfer BEFORE INSERT OR UPDATE OF from_budget_id, to_budget_id, division_id ON public.budget_transfers
FOR EACH ROW EXECUTE FUNCTION public.validate_budget_transfer();

CREATE POLICY "Target division can view incoming transfers" ON public.budget_transfers
FOR SELECT TO authenticated USING (to_division_id IS NOT NULL AND public.can_access_division(auth.uid(), to_division_id));

CREATE OR REPLACE FUNCTION public.approve_budget_transfer(p_transfer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transfer budget_transfers%ROWTYPE;
  v_from division_budgets%ROWTYPE;
  v_to division_budgets%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_from_rem NUMERIC; v_to_rem NUMERIC;
  v_from_name TEXT; v_to_name TEXT;
BEGIN
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve transfers');
  END IF;
  SELECT * INTO v_transfer FROM budget_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Transfer not found'); END IF;
  IF v_transfer.status <> 'submitted' THEN RETURN jsonb_build_object('success', false, 'error', 'Transfer cannot be approved in current status'); END IF;
  IF v_transfer.amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid amount'); END IF;

  -- lock budgets in deterministic order
  PERFORM 1 FROM division_budgets WHERE id IN (v_transfer.from_budget_id, v_transfer.to_budget_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_from FROM division_budgets WHERE id = v_transfer.from_budget_id;
  SELECT * INTO v_to FROM division_budgets WHERE id = v_transfer.to_budget_id;
  IF v_from.id IS NULL OR v_to.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Budget not found'); END IF;
  IF v_from.period_id <> v_to.period_id THEN RETURN jsonb_build_object('success', false, 'error', 'Budgets must be in the same period'); END IF;

  IF v_from.division_id <> v_to.division_id THEN
    IF NOT has_role(v_user_id, 'super_admin') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Transfer antar divisi hanya bisa disetujui Super Admin');
    END IF;
  ELSIF NOT has_role(v_user_id, 'super_admin') AND NOT can_access_division(v_user_id, v_from.division_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed for this division');
  END IF;

  v_from_rem := v_from.allocated_amount - v_from.used_amount;
  v_to_rem := v_to.allocated_amount - v_to.used_amount;
  IF v_from_rem < v_transfer.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sisa anggaran pos asal tidak cukup');
  END IF;

  SELECT code INTO v_from_name FROM divisions WHERE id = v_from.division_id;
  SELECT code INTO v_to_name FROM divisions WHERE id = v_to.division_id;

  UPDATE division_budgets SET allocated_amount = allocated_amount - v_transfer.amount, updated_at = NOW() WHERE id = v_from.id;
  UPDATE division_budgets SET allocated_amount = allocated_amount + v_transfer.amount, updated_at = NOW() WHERE id = v_to.id;

  INSERT INTO budget_movements (division_budget_id, movement_type, amount, balance_before, balance_after, performed_by, description)
  VALUES (v_from.id, 'transfer_out', v_transfer.amount, v_from_rem, v_from_rem - v_transfer.amount, v_user_id,
          'Transfer ' || v_transfer.transfer_number || ' ke ' || v_to_name);
  INSERT INTO budget_movements (division_budget_id, movement_type, amount, balance_before, balance_after, performed_by, description)
  VALUES (v_to.id, 'transfer_in', v_transfer.amount, v_to_rem, v_to_rem + v_transfer.amount, v_user_id,
          'Transfer ' || v_transfer.transfer_number || ' dari ' || v_from_name);

  UPDATE budget_transfers SET status = 'approved', approved_at = NOW(), approved_by = v_user_id, updated_at = NOW() WHERE id = p_transfer_id;

  INSERT INTO audit_logs (user_id, event_type, entity_type, entity_id, description, metadata)
  VALUES (v_user_id, 'approve', 'budget_transfer', p_transfer_id,
          'Transfer anggaran ' || v_transfer.transfer_number || ' disetujui (' || v_from_name || ' -> ' || v_to_name || ')',
          jsonb_build_object('amount', v_transfer.amount, 'from_division', v_from.division_id, 'to_division', v_to.division_id));

  RETURN jsonb_build_object('success', true, 'message', 'Transfer approved');
END $$;