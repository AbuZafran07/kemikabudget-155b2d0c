CREATE OR REPLACE FUNCTION public.get_ca_budget_options(p_division_id uuid)
RETURNS TABLE(id uuid, code text, name text, remaining numeric, allocated numeric, used numeric, commitment numeric, period_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.check_session_valid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=auth.uid() AND is_active) OR NOT COALESCE(public.can_access_division(auth.uid(),p_division_id),false) THEN RAISE EXCEPTION 'Akses anggaran tidak diizinkan'; END IF;
 IF (SELECT count(*) FROM public.budget_periods WHERE is_active AND NOT is_closed) <> 1 THEN RAISE EXCEPTION 'Harus tersedia tepat satu periode anggaran aktif dan terbuka'; END IF;
 RETURN QUERY SELECT cc.id, cc.code, cc.name, db.allocated_amount-db.used_amount-COALESCE(l.reserved,0), db.allocated_amount, db.used_amount, COALESCE(l.reserved,0), db.period_id
 FROM public.division_budgets db JOIN public.cost_categories cc ON cc.id=db.category_id JOIN public.budget_periods bp ON bp.id=db.period_id
 LEFT JOIN LATERAL (SELECT SUM(CASE WHEN bl.entry_type='commitment_add' THEN bl.amount WHEN bl.entry_type='commitment_release' THEN -bl.amount ELSE 0 END) AS reserved FROM public.budget_ledger bl WHERE bl.division_budget_id=db.id) l ON true
 WHERE db.division_id=p_division_id AND bp.is_active AND NOT bp.is_closed AND cc.is_active ORDER BY cc.code;
END $$;
REVOKE ALL ON FUNCTION public.get_ca_budget_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ca_budget_options(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_ca_item_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_status public.cash_advance_status;
BEGIN
 IF TG_OP='UPDATE' AND NEW.cash_advance_id IS DISTINCT FROM OLD.cash_advance_id THEN RAISE EXCEPTION 'Rincian tidak dapat dipindah ke CA lain'; END IF;
 v_id := CASE WHEN TG_OP='DELETE' THEN OLD.cash_advance_id ELSE NEW.cash_advance_id END;
 SELECT status INTO v_status FROM public.cash_advances WHERE cash_advances.id=v_id FOR UPDATE;
 IF v_status IS NOT NULL AND v_status <> 'draft' THEN RAISE EXCEPTION 'Rincian CA yang sudah diajukan tidak dapat diubah'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ca_items_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cash_advance_items FOR EACH ROW EXECUTE FUNCTION public.guard_ca_item_submission();

CREATE OR REPLACE FUNCTION public.submit_cash_advance(p_ca_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ca public.cash_advances%ROWTYPE; v_budget public.division_budgets%ROWTYPE; v_uid uuid:=auth.uid(); v_period uuid; v_item record; v_reserved numeric; v_available numeric; v_name text; v_total numeric;
BEGIN
 IF v_uid IS NULL OR NOT public.check_session_valid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_uid AND is_active) THEN RAISE EXCEPTION 'Sesi tidak valid'; END IF;
 SELECT * INTO v_ca FROM public.cash_advances WHERE id=p_ca_id FOR UPDATE;
 IF NOT FOUND OR v_ca.requester_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'CA tidak ditemukan atau pengajuan tidak diizinkan'; END IF;
 IF v_ca.status <> 'draft' THEN RAISE EXCEPTION 'Hanya CA draft yang dapat diajukan'; END IF;
 IF NOT COALESCE(public.can_access_division(v_uid,v_ca.division_id),false) THEN RAISE EXCEPTION 'Divisi tidak diizinkan'; END IF;
 IF (SELECT count(*) FROM public.budget_periods WHERE is_active AND NOT is_closed)<>1 THEN RAISE EXCEPTION 'Harus tersedia tepat satu periode anggaran aktif dan terbuka'; END IF;
 SELECT id INTO v_period FROM public.budget_periods WHERE is_active AND NOT is_closed FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id) OR EXISTS(SELECT 1 FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id AND (category_id IS NULL OR btrim(description)='' OR quantity<=0 OR unit_price<=0 OR amount<=0 OR amount<>quantity*unit_price)) THEN RAISE EXCEPTION 'Lengkapi rincian, pos anggaran, dan nominal CA'; END IF;
 SELECT SUM(amount) INTO v_total FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id;
 IF v_total IS DISTINCT FROM v_ca.total_amount OR btrim(v_ca.purpose)='' THEN RAISE EXCEPTION 'Jumlah atau keperluan CA tidak sesuai rincian'; END IF;
 FOR v_item IN SELECT category_id, SUM(amount) AS total_amount FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id GROUP BY category_id ORDER BY category_id LOOP
  SELECT * INTO v_budget FROM public.division_budgets WHERE division_id=v_ca.division_id AND category_id=v_item.category_id AND period_id=v_period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pos anggaran tidak tersedia pada divisi dan periode aktif'; END IF;
  SELECT name INTO v_name FROM public.cost_categories WHERE id=v_item.category_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pos anggaran tidak aktif'; END IF;
  SELECT COALESCE(SUM(CASE WHEN entry_type='commitment_add' THEN amount WHEN entry_type='commitment_release' THEN -amount ELSE 0 END),0) INTO v_reserved FROM public.budget_ledger WHERE division_budget_id=v_budget.id;
  v_available:=v_budget.allocated_amount-v_budget.used_amount-v_reserved;
  IF v_item.total_amount>v_available THEN RAISE EXCEPTION 'Anggaran pos % tidak cukup: tersedia Rp %, kebutuhan Rp %, kekurangan Rp %', v_name, to_char(v_available,'FM999G999G999G990'),to_char(v_item.total_amount,'FM999G999G999G990'),to_char(v_item.total_amount-v_available,'FM999G999G999G990'); END IF;
 END LOOP;
 FOR v_item IN SELECT category_id, SUM(amount) AS total_amount FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id GROUP BY category_id ORDER BY category_id LOOP
  SELECT id INTO v_budget.id FROM public.division_budgets WHERE division_id=v_ca.division_id AND category_id=v_item.category_id AND period_id=v_period;
  INSERT INTO public.budget_ledger(division_budget_id,entry_type,amount,reference_type,reference_id,description,performed_by) VALUES(v_budget.id,'commitment_add',v_item.total_amount,'cash_advance',p_ca_id,'Commitment for CA '||v_ca.ca_number||' (category)',v_uid);
 END LOOP;
 UPDATE public.cash_advances SET status='submitted',submitted_at=now(),period_id=v_period,updated_at=now() WHERE id=p_ca_id;
 INSERT INTO public.cash_advance_events(cash_advance_id,event_type,description,performed_by) VALUES(p_ca_id,'submitted','Cash advance submitted',v_uid);
 RETURN jsonb_build_object('success',true,'message','Cash advance submitted');
END $$;
REVOKE ALL ON FUNCTION public.submit_cash_advance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cash_advance(uuid) TO authenticated, service_role;

CREATE TABLE public.ca_ai_gateway_state(id text PRIMARY KEY, status integer NOT NULL, message text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ca_ai_gateway_state TO service_role;
ALTER TABLE public.ca_ai_gateway_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ca_ai_gateway_state IS 'Server-only persistent terminal AI access pause; clear only after owner restores access.';