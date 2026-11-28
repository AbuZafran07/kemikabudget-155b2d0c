-- =====================================================================
-- 0005_budget_availability_lock
-- Dana tersedia dihitung SATU cara di semua proses:
--   tersedia = alokasi - terpakai - (rincian CA yang masih berjalan) - (Pengajuan Dana yang menunggu persetujuan)
-- Dihitung langsung dari status dokumen (bukan dari saldo ledger komitmen yang bisa melenceng).
--   * Pengajuan CA & Pengajuan Dana terkunci sejak DIAJUKAN bila dana pos tidak cukup
--   * Persetujuan Pengajuan Dana / realisasi CA mengikuti urutan pengajuan (yang lebih dulu diutamakan)
--   * Transfer Anggaran & Adjustment tidak boleh memakai dana yang sedang dipesan
--   * Realisasi yang melebihi nilai CA diperiksa saat realisasi DIAJUKAN
--   * Perbaikan bug: tolak CA dari Antrian Pembayaran kini melepas pesanan dananya
-- Membutuhkan 0003 & 0004.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.budget_line_claims(
  p_budget_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_exclude_ca uuid DEFAULT NULL,
  p_exclude_request uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT db.division_id, db.category_id, db.period_id, bp.is_active AS period_active
    FROM public.division_budgets db JOIN public.budget_periods bp ON bp.id = db.period_id
    WHERE db.id = p_budget_id
  )
  SELECT
    COALESCE((
      SELECT SUM(i.amount)
      FROM b, public.cash_advances ca JOIN public.cash_advance_items i ON i.cash_advance_id = ca.id
      WHERE ca.division_id = b.division_id AND i.category_id = b.category_id
        AND ca.status::text IN ('submitted', 'under_review', 'approved', 'paid', 'partially_settled')
        AND (ca.period_id = b.period_id OR (ca.period_id IS NULL AND b.period_active))
        AND ca.id IS DISTINCT FROM p_exclude_ca
        AND (p_before IS NULL OR COALESCE(ca.submitted_at, ca.created_at) < p_before)
    ), 0)
    +
    COALESCE((
      SELECT SUM(r.amount)
      FROM b, public.requests r
      WHERE r.division_id = b.division_id AND r.category_id = b.category_id
        AND r.status::text IN ('submitted', 'under_review')
        AND (r.period_id = b.period_id OR (r.period_id IS NULL AND b.period_active))
        AND r.id IS DISTINCT FROM p_exclude_request
        AND (p_before IS NULL OR COALESCE(r.submitted_at, r.created_at) < p_before)
    ), 0)
$$;
REVOKE ALL ON FUNCTION public.budget_line_claims(uuid, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.budget_line_claims(uuid, timestamptz, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- Titik sambung "Rem Budget" (0007). Di 0005 seluruh plafon dianggap terbuka,
-- sehingga perilaku tetap sama sampai 0007 dijalankan.
--   budget_line_open_amount  : plafon yang sudah dibuka (p_simulate = termasuk yang akan dibuka otomatis)
--   budget_line_auto_release : buka otomatis bila diperlukan (0005: tidak melakukan apa-apa)
--   budget_line_brake_note   : keterangan tambahan pada pesan error (0005: kosong)
--   budget_line_after_transfer: penyesuaian plafon terbuka setelah Transfer Anggaran (0005: tidak ada)
-- ---------------------------------------------------------------------
-- Hanya dibuat bila belum ada, agar menjalankan ulang 0005 setelah 0007 tidak mematikan Rem Budget.
DO $hooks$
BEGIN
  IF to_regprocedure('public.budget_line_open_amount(uuid, boolean)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.budget_line_open_amount(p_budget_id uuid, p_simulate boolean DEFAULT false)
      RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $b$
        SELECT allocated_amount FROM public.division_budgets WHERE id = p_budget_id
      $b$ $f$;
  END IF;
  IF to_regprocedure('public.budget_line_auto_release(uuid, numeric)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.budget_line_auto_release(p_budget_id uuid, p_required_open numeric)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
      BEGIN
        RETURN;
      END $b$ $f$;
  END IF;
  IF to_regprocedure('public.budget_line_brake_note(uuid)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.budget_line_brake_note(p_budget_id uuid)
      RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $b$
        SELECT ''::text
      $b$ $f$;
  END IF;
  IF to_regprocedure('public.budget_line_after_transfer(uuid, uuid, numeric, uuid)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.budget_line_after_transfer(p_from uuid, p_to uuid, p_amount numeric, p_transfer_id uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
      BEGIN
        RETURN;
      END $b$ $f$;
  END IF;
END $hooks$;

REVOKE ALL ON FUNCTION public.budget_line_after_transfer(uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.budget_line_after_transfer(uuid, uuid, numeric, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.budget_line_open_amount(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_auto_release(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_brake_note(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.budget_line_open_amount(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.budget_line_auto_release(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.budget_line_brake_note(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- Pengajuan Dana: kunci saat DIAJUKAN (draft/revisi -> submitted)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_request_budget_on_submit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget public.division_budgets%ROWTYPE;
  v_available numeric;
  v_claims numeric;
  v_category text;
BEGIN
  IF NEW.status::text <> 'submitted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text IN ('submitted', 'under_review') THEN RETURN NEW; END IF;

  NEW.submitted_at := now();

  SELECT db.* INTO v_budget
  FROM public.division_budgets db JOIN public.budget_periods bp ON bp.id = db.period_id
  WHERE db.division_id = NEW.division_id AND db.category_id = NEW.category_id AND bp.is_active
  FOR UPDATE OF db;  -- mengantrekan pengajuan bersamaan pada pos yang sama
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pos anggaran tidak tersedia pada divisi dan periode aktif';
  END IF;

  v_claims := public.budget_line_claims(v_budget.id, NULL, NULL, NEW.id);
  PERFORM public.budget_line_auto_release(v_budget.id, v_budget.used_amount + v_claims + NEW.amount);
  v_available := public.budget_line_open_amount(v_budget.id) - v_budget.used_amount - v_claims;
  IF NEW.amount > v_available THEN
    SELECT name INTO v_category FROM public.cost_categories WHERE id = NEW.category_id;
    RAISE EXCEPTION 'Anggaran pos % tidak cukup: tersedia Rp % (sudah dikurangi dana yang dipesan CA dan Pengajuan Dana lain yang menunggu persetujuan), diajukan Rp %, kekurangan Rp %. Ajukan Transfer Anggaran terlebih dahulu.%',
      COALESCE(v_category, '-'),
      to_char(GREATEST(v_available, 0), 'FM999G999G999G990'),
      to_char(NEW.amount, 'FM999G999G999G990'),
      to_char(NEW.amount - GREATEST(v_available, 0), 'FM999G999G999G990'),
      public.budget_line_brake_note(v_budget.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_request_budget_on_submit ON public.requests;
CREATE TRIGGER trg_guard_request_budget_on_submit
  BEFORE INSERT OR UPDATE OF status ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_budget_on_submit();

-- ---------------------------------------------------------------------
-- Realisasi CA: kelebihan di atas nilai CA diperiksa saat DIAJUKAN
-- (pembagian per pos sama dengan approve_settlement)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_ca_settlement_overspend() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ca public.cash_advances%ROWTYPE;
  v_period_id uuid;
  v_items_total numeric;
  v_count int;
  v_idx int := 0;
  v_allocated numeric := 0;
  v_share numeric;
  v_row record;
  v_budget public.division_budgets%ROWTYPE;
  v_avail numeric;
  v_realized numeric;
BEGIN
  IF NEW.status::text <> 'submitted' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT * INTO v_ca FROM public.cash_advances WHERE id = NEW.cash_advance_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_realized FROM public.cash_advance_settlement_items WHERE settlement_id = NEW.id;
  IF v_realized <= COALESCE(v_ca.total_amount, 0) THEN RETURN NEW; END IF;

  v_period_id := COALESCE(v_ca.period_id, (SELECT id FROM public.budget_periods WHERE is_active LIMIT 1));
  SELECT COALESCE(SUM(amount), 0), COUNT(DISTINCT category_id) INTO v_items_total, v_count
  FROM public.cash_advance_items WHERE cash_advance_id = v_ca.id AND category_id IS NOT NULL;
  IF v_items_total <= 0 THEN RETURN NEW; END IF;

  FOR v_row IN
    SELECT i.category_id, SUM(i.amount) AS cat_total, MAX(c.name) AS cat_name
    FROM public.cash_advance_items i JOIN public.cost_categories c ON c.id = i.category_id
    WHERE i.cash_advance_id = v_ca.id GROUP BY i.category_id ORDER BY i.category_id
  LOOP
    v_idx := v_idx + 1;
    IF v_idx = v_count THEN v_share := v_realized - v_allocated;
    ELSE v_share := ROUND(v_realized * v_row.cat_total / v_items_total, 0); END IF;
    v_allocated := v_allocated + v_share;
    IF v_share > v_row.cat_total THEN
      SELECT * INTO v_budget FROM public.division_budgets
      WHERE division_id = v_ca.division_id AND category_id = v_row.category_id AND period_id = v_period_id;
      v_avail := COALESCE(public.budget_line_open_amount(v_budget.id, true) - v_budget.used_amount - public.budget_line_claims(v_budget.id, NULL, v_ca.id, NULL), 0);
      IF v_avail < v_share THEN
        RAISE EXCEPTION 'Realisasi melebihi nilai CA dan dana pos % tidak cukup untuk kelebihannya: dibutuhkan Rp %, tersedia Rp %. Sesuaikan realisasi atau minta Transfer Anggaran terlebih dahulu.%',
          v_row.cat_name, to_char(v_share, 'FM999G999G999G990'), to_char(GREATEST(v_avail, 0), 'FM999G999G999G990'),
          COALESCE(public.budget_line_brake_note(v_budget.id), '');
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_ca_settlement_overspend ON public.cash_advance_settlements;
CREATE TRIGGER trg_guard_ca_settlement_overspend
  BEFORE UPDATE OF status ON public.cash_advance_settlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_ca_settlement_overspend();

-- ---------------------------------------------------------------------
-- Fungsi yang diperbarui (isi sama dengan versi berjalan, hanya bagian bertanda [0005] yang berubah)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_cash_advance(p_ca_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- [0005] dana tersedia = sisa - dana yang dipesan CA terbuka & Pengajuan Dana yang menunggu persetujuan
  v_reserved:=public.budget_line_claims(v_budget.id,NULL,p_ca_id,NULL);
  PERFORM public.budget_line_auto_release(v_budget.id, v_budget.used_amount+v_reserved+v_item.total_amount);
  v_available:=public.budget_line_open_amount(v_budget.id)-v_budget.used_amount-v_reserved;
  IF v_item.total_amount>v_available THEN RAISE EXCEPTION 'Anggaran pos % tidak cukup: tersedia Rp % (sudah dikurangi dana yang dipesan CA lain dan Pengajuan Dana yang menunggu persetujuan), kebutuhan Rp %, kekurangan Rp %. Ajukan Transfer Anggaran terlebih dahulu.%', v_name, to_char(GREATEST(v_available,0),'FM999G999G999G990'),to_char(v_item.total_amount,'FM999G999G999G990'),to_char(v_item.total_amount-GREATEST(v_available,0),'FM999G999G999G990'),public.budget_line_brake_note(v_budget.id); END IF;
 END LOOP;
 FOR v_item IN SELECT category_id, SUM(amount) AS total_amount FROM public.cash_advance_items WHERE cash_advance_id=p_ca_id GROUP BY category_id ORDER BY category_id LOOP
  SELECT id INTO v_budget.id FROM public.division_budgets WHERE division_id=v_ca.division_id AND category_id=v_item.category_id AND period_id=v_period;
  INSERT INTO public.budget_ledger(division_budget_id,entry_type,amount,reference_type,reference_id,description,performed_by) VALUES(v_budget.id,'commitment_add',v_item.total_amount,'cash_advance',p_ca_id,'Commitment for CA '||v_ca.ca_number||' (category)',v_uid);
 END LOOP;
 UPDATE public.cash_advances SET status='submitted',submitted_at=now(),period_id=v_period,updated_at=now() WHERE id=p_ca_id;
 INSERT INTO public.cash_advance_events(cash_advance_id,event_type,description,performed_by) VALUES(p_ca_id,'submitted','Cash advance submitted',v_uid);
 RETURN jsonb_build_object('success',true,'message','Cash advance submitted');
END $function$;

CREATE OR REPLACE FUNCTION public.approve_request(p_request_id uuid, p_approval_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request RECORD;
  v_budget RECORD;
  v_remaining NUMERIC;
  v_user_id UUID;
  v_safe_note TEXT;
  v_final_amount NUMERIC;
  v_claim_time TIMESTAMPTZ;
  v_avail_prior NUMERIC;
  v_avail_all NUMERIC;
  v_open_rem NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF p_approval_note IS NOT NULL THEN
    IF LENGTH(p_approval_note) > 1000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Note too long (max 1000 characters)');
    END IF;
    v_safe_note := LEFT(TRIM(p_approval_note), 1000);
  ELSE
    v_safe_note := NULL;
  END IF;
  
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve requests');
  END IF;
  
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request cannot be approved in current status');
  END IF;
  
  v_final_amount := COALESCE(p_approved_amount, v_request.amount);
  
  SELECT db.* INTO v_budget
  FROM division_budgets db
  JOIN budget_periods bp ON db.period_id = bp.id
  WHERE db.division_id = v_request.division_id
  AND db.category_id = v_request.category_id
  AND bp.is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active budget found for this category');
  END IF;
  
  v_remaining := v_budget.allocated_amount - v_budget.used_amount;

  -- [0005] Dana yang sudah dipesan pihak lain tidak boleh terpakai.
  -- Prioritas sesuai urutan pengajuan: pengajuan ini hanya dikurangi pesanan yang masuk lebih dulu;
  -- bila disetujui melebihi nilai yang diajukan, kelebihannya harus muat setelah semua pesanan lain.
  v_claim_time := COALESCE(v_request.submitted_at, v_request.created_at);
  v_avail_all := public.budget_line_claims(v_budget.id, NULL, NULL, p_request_id);
  PERFORM public.budget_line_auto_release(v_budget.id, v_budget.used_amount + v_avail_all + v_final_amount);
  v_open_rem := public.budget_line_open_amount(v_budget.id) - v_budget.used_amount;
  v_avail_prior := v_open_rem - public.budget_line_claims(v_budget.id, v_claim_time, NULL, p_request_id);
  v_avail_all := v_open_rem - v_avail_all;
  IF v_avail_prior < LEAST(v_final_amount, v_request.amount)
     OR (v_final_amount > v_request.amount AND v_avail_all < v_final_amount) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Anggaran pos tidak cukup: tersedia Rp ' || to_char(GREATEST(LEAST(v_avail_prior, CASE WHEN v_final_amount > v_request.amount THEN v_avail_all ELSE v_avail_prior END), 0), 'FM999G999G999G990') ||
      ' (sudah dikurangi dana yang dipesan CA dan pengajuan lain yang masuk lebih dulu), dibutuhkan Rp ' || to_char(v_final_amount, 'FM999G999G999G990') ||
      '. Lakukan Transfer Anggaran terlebih dahulu.' || public.budget_line_brake_note(v_budget.id));
  END IF;
  
  UPDATE division_budgets 
  SET used_amount = used_amount + v_final_amount,
      updated_at = NOW()
  WHERE id = v_budget.id;
  
  INSERT INTO budget_movements (
    division_budget_id, request_id, movement_type, amount,
    balance_before, balance_after, performed_by, description
  ) VALUES (
    v_budget.id, p_request_id, 'deduction', v_final_amount,
    v_remaining, v_remaining - v_final_amount, v_user_id,
    'Approved request ' || v_request.request_number
  );
  
  UPDATE requests SET
    status = 'approved',
    approved_at = NOW(),
    approved_by = v_user_id,
    approved_amount = v_final_amount,
    is_locked = TRUE,
    locked_at = NOW(),
    locked_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  IF v_safe_note IS NOT NULL THEN
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_request_id, 'approved', 'Request approved', v_user_id, jsonb_build_object('note', v_safe_note, 'approved_amount', v_final_amount));
  ELSE
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_request_id, 'approved', 'Request approved', v_user_id, jsonb_build_object('approved_amount', v_final_amount));
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Request approved successfully', 'approved_amount', v_final_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_settlement(p_settlement_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_claim_time TIMESTAMPTZ;
  v_rem NUMERIC;
  v_avail_prior NUMERIC;
  v_avail_all NUMERIC;
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

    -- [0005] Pesanan CA ini sendiri boleh dipakai; pesanan pihak lain yang masuk lebih dulu tidak.
    -- Kelebihan realisasi di atas pesanan CA ini harus muat setelah semua pesanan lain.
    v_claim_time := COALESCE(v_ca.submitted_at, v_ca.created_at);
    v_avail_all := public.budget_line_claims(v_budget.id, NULL, v_ca.id, NULL);
    PERFORM public.budget_line_auto_release(v_budget.id, v_budget.used_amount + v_avail_all + v_share);
    v_rem := public.budget_line_open_amount(v_budget.id) - v_budget.used_amount;
    v_avail_prior := v_rem - public.budget_line_claims(v_budget.id, v_claim_time, v_ca.id, NULL);
    v_avail_all := v_rem - v_avail_all;
    IF v_avail_prior < LEAST(v_share, v_row.cat_total)
       OR (v_share > v_row.cat_total AND v_avail_all < v_share) THEN
      RAISE EXCEPTION 'Sisa anggaran pos tidak mencukupi untuk realisasi (tersedia Rp %, dibutuhkan Rp %). Lakukan Transfer Anggaran terlebih dahulu.%',
        to_char(GREATEST(CASE WHEN v_share > v_row.cat_total THEN LEAST(v_avail_prior, v_avail_all) ELSE v_avail_prior END, 0), 'FM999G999G999G990'),
        to_char(v_share, 'FM999G999G999G990'), public.budget_line_brake_note(v_budget.id);
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

CREATE OR REPLACE FUNCTION public.approve_budget_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer budget_transfers%ROWTYPE;
  v_from division_budgets%ROWTYPE;
  v_to division_budgets%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_from_rem NUMERIC; v_to_rem NUMERIC; v_movable NUMERIC;
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
  -- [0005] dana yang sedang dipesan CA / Pengajuan Dana tidak boleh dipindahkan
  -- [0007] hanya dana yang sudah dibuka (Rem Budget) yang dapat dipindahkan
  v_movable := public.budget_line_open_amount(v_from.id) - v_from.used_amount - public.budget_line_claims(v_from.id);
  IF v_movable < v_transfer.amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Sisa anggaran pos asal tidak cukup: dapat dipindahkan maksimal Rp ' ||
      to_char(GREATEST(v_movable, 0), 'FM999G999G999G990') ||
      ' (sisa Rp ' || to_char(v_from_rem, 'FM999G999G999G990') || ' dikurangi dana yang sedang dipesan CA dan Pengajuan Dana)' ||
      public.budget_line_brake_note(v_from.id));
  END IF;

  SELECT code INTO v_from_name FROM divisions WHERE id = v_from.division_id;
  SELECT code INTO v_to_name FROM divisions WHERE id = v_to.division_id;

  UPDATE division_budgets SET allocated_amount = allocated_amount - v_transfer.amount, updated_at = NOW() WHERE id = v_from.id;
  UPDATE division_budgets SET allocated_amount = allocated_amount + v_transfer.amount, updated_at = NOW() WHERE id = v_to.id;
  -- [0007] sesuaikan plafon yang sudah dibuka (Rem Budget) pada pos asal & tujuan
  PERFORM public.budget_line_after_transfer(v_from.id, v_to.id, v_transfer.amount, p_transfer_id);

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
END $function$;

CREATE OR REPLACE FUNCTION public.approve_adjustment(p_adjustment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- [0005] penambahan pemakaian tidak boleh memakai dana yang sedang dipesan pihak lain
      IF v_adj.difference_amount > 0 AND
         (SELECT public.budget_line_open_amount(v_budget_id) - used_amount FROM division_budgets WHERE id = v_budget_id)
         - public.budget_line_claims(v_budget_id, NULL,
             CASE WHEN v_adj.reference_type = 'cash_advance' THEN v_adj.reference_id::uuid END,
             CASE WHEN v_adj.reference_type = 'expense_request' THEN v_adj.reference_id::uuid END)
         < v_adj.difference_amount THEN
        RAISE EXCEPTION 'Anggaran pos tidak cukup untuk adjustment ini (dana tersedia setelah dikurangi pesanan CA dan Pengajuan Dana kurang dari Rp %).',
          to_char(v_adj.difference_amount, 'FM999G999G999G990');
      END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.reject_from_payment_queue(p_id uuid, p_type text, p_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request requests%ROWTYPE;
  v_claim medical_claims%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_budget_id uuid;
  v_amount numeric;
  v_budget_record division_budgets%ROWTYPE;
  v_medical_budget employee_medical_budgets%ROWTYPE;
BEGIN
  -- Only super_admin can reject from payment queue
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can reject from payment queue');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  IF p_type = 'request' THEN
    SELECT * INTO v_request FROM requests WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Request not found');
    END IF;
    IF v_request.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved requests can be rejected from payment queue');
    END IF;

    v_amount := COALESCE(v_request.approved_amount, v_request.amount);

    -- Find the division budget to reverse
    SELECT id INTO v_budget_id
    FROM division_budgets
    WHERE division_id = v_request.division_id
      AND category_id = v_request.category_id
      AND period_id = v_request.period_id
    LIMIT 1;

    -- Reverse budget deduction if budget was found
    IF v_budget_id IS NOT NULL THEN
      SELECT * INTO v_budget_record FROM division_budgets WHERE id = v_budget_id;
      
      UPDATE division_budgets
      SET used_amount = used_amount - v_amount,
          updated_at = NOW()
      WHERE id = v_budget_id;

      INSERT INTO budget_movements (division_budget_id, request_id, amount, balance_before, balance_after, movement_type, performed_by, description)
      VALUES (v_budget_id, p_id, v_amount, 
              v_budget_record.allocated_amount - v_budget_record.used_amount,
              v_budget_record.allocated_amount - v_budget_record.used_amount + v_amount,
              'reversal', auth.uid(), 'Budget reversed - rejected from payment queue: ' || p_reason);

      -- Also reverse budget ledger if exists
      INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_id, reference_type, performed_by, description)
      VALUES (v_budget_id, 'refund', v_amount, p_id, 'request', auth.uid(), 'Rejected from payment queue');
    END IF;

    -- Update request status
    UPDATE requests
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Request rejected and budget restored');

  ELSIF p_type = 'medical_claim' THEN
    SELECT * INTO v_claim FROM medical_claims WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Medical claim not found');
    END IF;
    IF v_claim.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved claims can be rejected from payment queue');
    END IF;

    v_amount := COALESCE(v_claim.approved_amount, v_claim.claim_amount);

    -- Reverse medical budget commitment if budget exists
    IF v_claim.medical_budget_id IS NOT NULL THEN
      SELECT * INTO v_medical_budget FROM employee_medical_budgets WHERE id = v_claim.medical_budget_id;
      
      IF FOUND THEN
        -- Insert reversal ledger entry
        INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
        VALUES (v_claim.medical_budget_id, 'commitment_release', v_claim.claim_amount, p_id, auth.uid(), 'Rejected from payment queue');
      END IF;
    END IF;

    -- Update claim status
    UPDATE medical_claims
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Medical claim rejected and budget restored');

  ELSIF p_type = 'cash_advance' THEN
    SELECT * INTO v_ca FROM cash_advances WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Cash advance not found');
    END IF;
    IF v_ca.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved cash advances can be rejected from payment queue');
    END IF;

    v_amount := v_ca.total_amount;

    -- [0005] CA belum membebani used_amount (baru dipesan), jadi yang dikembalikan adalah pesanannya:
    -- lepaskan sisa komitmen per pos sesuai catatan ledger CA ini.
    INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_id, reference_type, performed_by, description)
    SELECT l.division_budget_id, 'commitment_release',
           SUM(CASE WHEN l.entry_type = 'commitment_add' THEN l.amount ELSE -l.amount END),
           p_id, 'cash_advance', auth.uid(), 'Commitment released - CA rejected from payment queue'
    FROM budget_ledger l
    WHERE l.reference_id = p_id AND l.reference_type = 'cash_advance'
      AND l.entry_type IN ('commitment_add', 'commitment_release')
    GROUP BY l.division_budget_id
    HAVING SUM(CASE WHEN l.entry_type = 'commitment_add' THEN l.amount ELSE -l.amount END) > 0;

    -- Update CA status
    UPDATE cash_advances
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Cash advance rejected and budget restored');

  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid type: ' || p_type);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ca_budget_options(p_division_id uuid)
 RETURNS TABLE(id uuid, code text, name text, remaining numeric, allocated numeric, used numeric, commitment numeric, period_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.check_session_valid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE profiles.id=auth.uid() AND is_active) OR NOT COALESCE(public.can_access_division(auth.uid(),p_division_id),false) THEN RAISE EXCEPTION 'Akses anggaran tidak diizinkan'; END IF;
 IF (SELECT count(*) FROM public.budget_periods WHERE is_active AND NOT is_closed) <> 1 THEN RAISE EXCEPTION 'Harus tersedia tepat satu periode anggaran aktif dan terbuka'; END IF;
 -- [0005] commitment = dana yang dipesan CA terbuka + Pengajuan Dana yang menunggu persetujuan (dihitung dari status dokumen)
 RETURN QUERY SELECT cc.id, cc.code, cc.name, public.budget_line_open_amount(db.id,true)-db.used_amount-c.claims, db.allocated_amount, db.used_amount, c.claims, db.period_id
 FROM public.division_budgets db JOIN public.cost_categories cc ON cc.id=db.category_id JOIN public.budget_periods bp ON bp.id=db.period_id
 CROSS JOIN LATERAL (SELECT public.budget_line_claims(db.id) AS claims) c
 WHERE db.division_id=p_division_id AND bp.is_active AND NOT bp.is_closed AND cc.is_active ORDER BY cc.code;
END $function$;

REVOKE ALL ON FUNCTION public.get_ca_budget_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ca_budget_options(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Info dana tersedia untuk form Pengajuan Dana
-- ---------------------------------------------------------------------
-- DROP dulu: kolom hasil bertambah (held) bila versi lama 0005 sudah pernah dijalankan
DROP FUNCTION IF EXISTS public.get_request_budget_availability(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_request_budget_availability(p_division_id uuid, p_category_id uuid)
RETURNS TABLE(allocated numeric, used numeric, reserved numeric, available numeric, held numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget public.division_budgets%ROWTYPE;
  v_reserved numeric;
  v_open numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.check_session_valid() THEN RAISE EXCEPTION 'Sesi tidak valid'; END IF;
  IF NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'finance'::public.app_role)
          OR COALESCE(public.can_use_division_budget(auth.uid(), p_division_id, p_category_id), false)) THEN
    RAISE EXCEPTION 'Akses anggaran tidak diizinkan';
  END IF;
  SELECT db.* INTO v_budget FROM public.division_budgets db JOIN public.budget_periods bp ON bp.id = db.period_id
  WHERE db.division_id = p_division_id AND db.category_id = p_category_id AND bp.is_active LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  v_reserved := public.budget_line_claims(v_budget.id);
  v_open := public.budget_line_open_amount(v_budget.id, true);
  -- held = plafon yang masih ditahan Rem Budget (0 bila pos tidak direm)
  RETURN QUERY SELECT v_budget.allocated_amount, v_budget.used_amount, v_reserved,
                      v_open - v_budget.used_amount - v_reserved,
                      GREATEST(v_budget.allocated_amount - v_open, 0);
END $$;
REVOKE ALL ON FUNCTION public.get_request_budget_availability(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_request_budget_availability(uuid, uuid) TO authenticated, service_role;
