-- =====================================================================
-- 0003_ca_policy_enforcement
-- Kebijakan Cash Advance:
--   (a) tanggal kegiatan wajib + batas minimal pengajuan H-N (default 14 hari kalender)
--   (b) jatuh tempo laporan realisasi = tanggal selesai kegiatan + N hari (default 7)
--   (c) pengajuan CA baru diblokir bila pemohon punya laporan realisasi yang lewat jatuh tempo
--   (d) bukti lampiran wajib untuk realisasi (nota/kuitansi, bukti transfer/QRIS, tanda terima)
-- Semua aturan ditegakkan di database (trigger), sehingga berlaku untuk semua jalur pengajuan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pengaturan kebijakan (satu baris)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ca_policy_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  min_lead_days integer NOT NULL DEFAULT 14 CHECK (min_lead_days BETWEEN 0 AND 90),
  settlement_due_days integer NOT NULL DEFAULT 7 CHECK (settlement_due_days BETWEEN 1 AND 60),
  enforce_lead_time boolean NOT NULL DEFAULT true,
  block_on_overdue_settlement boolean NOT NULL DEFAULT true,
  require_settlement_attachment boolean NOT NULL DEFAULT true,
  attachment_rule_effective_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.ca_policy_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ca_policy_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.ca_policy_settings TO authenticated;
GRANT ALL ON public.ca_policy_settings TO service_role;

DROP POLICY IF EXISTS "Authenticated can read CA policy settings" ON public.ca_policy_settings;
CREATE POLICY "Authenticated can read CA policy settings"
  ON public.ca_policy_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin can update CA policy settings" ON public.ca_policy_settings;
CREATE POLICY "Super admin can update CA policy settings"
  ON public.ca_policy_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS session_must_be_valid ON public.ca_policy_settings;
CREATE POLICY session_must_be_valid
  ON public.ca_policy_settings
  AS RESTRICTIVE FOR ALL TO authenticated USING (public.check_session_valid());

CREATE OR REPLACE FUNCTION public.ca_policy_settings_touch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.id := true;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  -- Tanggal berlaku aturan lampiran tidak boleh diubah dari aplikasi
  NEW.attachment_rule_effective_at := OLD.attachment_rule_effective_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ca_policy_settings_touch ON public.ca_policy_settings;
CREATE TRIGGER trg_ca_policy_settings_touch BEFORE UPDATE ON public.ca_policy_settings
  FOR EACH ROW EXECUTE FUNCTION public.ca_policy_settings_touch();

-- Tanggal "hari ini" mengikuti zona waktu kantor (WIB)
CREATE OR REPLACE FUNCTION public.ca_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date
$$;
GRANT EXECUTE ON FUNCTION public.ca_today() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Tanggal kegiatan pada Cash Advance
--    Kolom nullable agar CA lama tetap valid; wajib diisi saat CA diajukan.
-- ---------------------------------------------------------------------
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS activity_start_date date;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS activity_end_date date;
ALTER TABLE public.cash_advances DROP CONSTRAINT IF EXISTS cash_advances_activity_dates_check;
ALTER TABLE public.cash_advances ADD CONSTRAINT cash_advances_activity_dates_check
  CHECK (activity_start_date IS NULL OR activity_end_date IS NULL OR activity_end_date >= activity_start_date);

-- ---------------------------------------------------------------------
-- 3. Daftar CA milik seorang pemohon yang laporan realisasinya lewat jatuh tempo
--    Laporan dianggap sudah disampaikan bila ada realisasi berstatus submitted/approved.
--    CA lama tanpa tanggal kegiatan tidak dihitung.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ca_overdue_settlements_for(p_user_id uuid, p_exclude_ca_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, ca_number text, activity_end_date date, settlement_due_date date, days_overdue integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ca.id, ca.ca_number, ca.activity_end_date,
         (ca.activity_end_date + s.settlement_due_days)::date AS settlement_due_date,
         (public.ca_today() - (ca.activity_end_date + s.settlement_due_days))::integer AS days_overdue
  FROM public.cash_advances ca
  CROSS JOIN public.ca_policy_settings s
  WHERE ca.requester_id = p_user_id
    AND (p_exclude_ca_id IS NULL OR ca.id <> p_exclude_ca_id)
    AND ca.status IN ('paid'::public.cash_advance_status, 'partially_settled'::public.cash_advance_status)
    AND ca.activity_end_date IS NOT NULL
    AND (ca.activity_end_date + s.settlement_due_days) < public.ca_today()
    AND NOT EXISTS (
      SELECT 1 FROM public.cash_advance_settlements st
      WHERE st.cash_advance_id = ca.id
        AND st.status IN ('submitted'::public.settlement_status, 'approved'::public.settlement_status)
    )
  ORDER BY ca.activity_end_date
$$;
REVOKE ALL ON FUNCTION public.ca_overdue_settlements_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_overdue_settlements_for(uuid, uuid) TO service_role;

-- Versi untuk aplikasi: hanya untuk user yang sedang login
CREATE OR REPLACE FUNCTION public.get_my_overdue_ca_settlements()
RETURNS TABLE(id uuid, ca_number text, activity_end_date date, settlement_due_date date, days_overdue integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.ca_overdue_settlements_for(auth.uid(), NULL)
  WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_my_overdue_ca_settlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_overdue_ca_settlements() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Penjaga saat CA berpindah draft -> submitted
--    Dipanggil di dalam submit_cash_advance (UPDATE status), sehingga bila gagal
--    seluruh transaksi (termasuk komitmen anggaran) ikut dibatalkan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_ca_policy_on_submit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.ca_policy_settings%ROWTYPE;
  v_today date := public.ca_today();
  v_deadline date;
  v_overdue record;
BEGIN
  SELECT * INTO v_settings FROM public.ca_policy_settings WHERE id = true;

  IF NEW.activity_start_date IS NULL OR NEW.activity_end_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal mulai dan tanggal selesai kegiatan wajib diisi sebelum CA diajukan.';
  END IF;
  IF NEW.activity_end_date < NEW.activity_start_date THEN
    RAISE EXCEPTION 'Tanggal selesai kegiatan tidak boleh sebelum tanggal mulai kegiatan.';
  END IF;

  IF COALESCE(v_settings.enforce_lead_time, true) THEN
    v_deadline := NEW.activity_start_date - COALESCE(v_settings.min_lead_days, 14);
    IF v_today > v_deadline THEN
      RAISE EXCEPTION 'Pengajuan CA paling lambat % hari kalender sebelum kegiatan. Kegiatan mulai %, batas pengajuan % (hari ini %). Pengajuan terlambat tidak dapat diproses.',
        COALESCE(v_settings.min_lead_days, 14),
        to_char(NEW.activity_start_date, 'DD-MM-YYYY'),
        to_char(v_deadline, 'DD-MM-YYYY'),
        to_char(v_today, 'DD-MM-YYYY');
    END IF;
  END IF;

  IF COALESCE(v_settings.block_on_overdue_settlement, true) THEN
    SELECT * INTO v_overdue FROM public.ca_overdue_settlements_for(NEW.requester_id, NEW.id) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Pengajuan CA baru diblokir: laporan realisasi % belum disampaikan (jatuh tempo %, terlambat % hari). Ajukan realisasinya terlebih dahulu.',
        v_overdue.ca_number,
        to_char(v_overdue.settlement_due_date, 'DD-MM-YYYY'),
        v_overdue.days_overdue;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ca_policy_on_submit ON public.cash_advances;
CREATE TRIGGER trg_ca_policy_on_submit
  BEFORE UPDATE OF status ON public.cash_advances
  FOR EACH ROW
  WHEN (OLD.status = 'draft'::public.cash_advance_status AND NEW.status = 'submitted'::public.cash_advance_status)
  EXECUTE FUNCTION public.guard_ca_policy_on_submit();

-- ---------------------------------------------------------------------
-- 5. Lampiran bukti realisasi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_advance_settlement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.cash_advance_settlements(id) ON DELETE CASCADE,
  cash_advance_id uuid NOT NULL REFERENCES public.cash_advances(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  attachment_type text NOT NULL DEFAULT 'receipt'
    CHECK (attachment_type IN ('receipt','transfer_proof','qris_proof','stamped_receipt','recipient_proof','other')),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ca_settlement_attachments_settlement ON public.cash_advance_settlement_attachments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_ca_settlement_attachments_ca ON public.cash_advance_settlement_attachments(cash_advance_id);
CREATE INDEX IF NOT EXISTS idx_ca_settlement_attachments_path ON public.cash_advance_settlement_attachments(file_path);

-- cash_advance_id selalu diambil dari realisasinya (tidak dipercaya dari klien)
CREATE OR REPLACE FUNCTION public.set_ca_settlement_attachment_ca() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT s.cash_advance_id INTO NEW.cash_advance_id
  FROM public.cash_advance_settlements s WHERE s.id = NEW.settlement_id;
  IF NEW.cash_advance_id IS NULL THEN
    RAISE EXCEPTION 'Realisasi tidak ditemukan';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_ca_settlement_attachment_ca ON public.cash_advance_settlement_attachments;
CREATE TRIGGER trg_set_ca_settlement_attachment_ca
  BEFORE INSERT ON public.cash_advance_settlement_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_ca_settlement_attachment_ca();

ALTER TABLE public.cash_advance_settlement_attachments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.cash_advance_settlement_attachments TO authenticated;
GRANT ALL ON public.cash_advance_settlement_attachments TO service_role;

DROP POLICY IF EXISTS "Users can view settlement attachments for accessible CAs" ON public.cash_advance_settlement_attachments;
CREATE POLICY "Users can view settlement attachments for accessible CAs"
  ON public.cash_advance_settlement_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cash_advances ca
    WHERE ca.id = cash_advance_settlement_attachments.cash_advance_id
      AND public.can_access_division(auth.uid(), ca.division_id)
  ));
DROP POLICY IF EXISTS "Creators can add attachments to pending settlements" ON public.cash_advance_settlement_attachments;
CREATE POLICY "Creators can add attachments to pending settlements"
  ON public.cash_advance_settlement_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.cash_advance_settlements s
      WHERE s.id = cash_advance_settlement_attachments.settlement_id
        AND s.created_by = auth.uid()
        AND s.status IN ('draft'::public.settlement_status, 'submitted'::public.settlement_status)
    )
  );
DROP POLICY IF EXISTS "Creators can delete attachments of pending settlements" ON public.cash_advance_settlement_attachments;
CREATE POLICY "Creators can delete attachments of pending settlements"
  ON public.cash_advance_settlement_attachments FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cash_advance_settlements s
    WHERE s.id = cash_advance_settlement_attachments.settlement_id
      AND s.created_by = auth.uid()
      AND s.status IN ('draft'::public.settlement_status, 'submitted'::public.settlement_status)
  ));
DROP POLICY IF EXISTS "Super admins can manage settlement attachments" ON public.cash_advance_settlement_attachments;
CREATE POLICY "Super admins can manage settlement attachments"
  ON public.cash_advance_settlement_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS session_must_be_valid ON public.cash_advance_settlement_attachments;
CREATE POLICY session_must_be_valid
  ON public.cash_advance_settlement_attachments
  AS RESTRICTIVE FOR ALL TO authenticated USING (public.check_session_valid());

-- Storage bucket privat
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ca-settlement-attachments', 'ca-settlement-attachments', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "CA settlement attachments: owner upload" ON storage.objects;
CREATE POLICY "CA settlement attachments: owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ca-settlement-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "CA settlement attachments: view" ON storage.objects;
CREATE POLICY "CA settlement attachments: view"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ca-settlement-attachments'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.cash_advance_settlement_attachments a WHERE a.file_path = storage.objects.name)
    )
  );
DROP POLICY IF EXISTS "CA settlement attachments: owner delete" ON storage.objects;
CREATE POLICY "CA settlement attachments: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ca-settlement-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 6. Penjaga status realisasi
--    - submitted_at selalu waktu server
--    - draft -> submitted wajib ada lampiran
--    - submitted -> approved wajib ada lampiran (kecuali realisasi yang
--      sudah diajukan sebelum aturan ini berlaku)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_ca_settlement_attachments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.ca_policy_settings%ROWTYPE;
  v_has_attachment boolean;
BEGIN
  IF NEW.status = 'submitted'::public.settlement_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.submitted_at := now();
  ELSIF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        AND NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)) THEN
    NEW.submitted_at := OLD.submitted_at;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.ca_policy_settings WHERE id = true;
  IF NOT COALESCE(v_settings.require_settlement_attachment, true) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.cash_advance_settlement_attachments a WHERE a.settlement_id = NEW.id)
    INTO v_has_attachment;

  IF NEW.status = 'submitted'::public.settlement_status AND NOT v_has_attachment THEN
    RAISE EXCEPTION 'Lampirkan minimal 1 bukti realisasi (nota/kuitansi, bukti transfer/QRIS, atau tanda terima) sebelum realisasi diajukan.';
  END IF;

  IF NEW.status = 'approved'::public.settlement_status AND NOT v_has_attachment
     AND OLD.submitted_at IS NOT NULL
     AND OLD.submitted_at >= v_settings.attachment_rule_effective_at THEN
    RAISE EXCEPTION 'Realisasi belum memiliki bukti lampiran sehingga tidak dapat disetujui. Tolak realisasi agar pemohon melengkapi bukti.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_ca_settlement_attachments ON public.cash_advance_settlements;
CREATE TRIGGER trg_guard_ca_settlement_attachments
  BEFORE UPDATE ON public.cash_advance_settlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_ca_settlement_attachments();

-- ---------------------------------------------------------------------
-- 7. unlock_settlement: sama persis dengan versi berjalan, ditambah penyalinan lampiran
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_settlement(p_settlement_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- [CA policy] Bawa bukti realisasi ke draft revisi (file storage tetap sama, riwayat lama tidak diubah)
  INSERT INTO cash_advance_settlement_attachments (settlement_id, cash_advance_id, file_name, file_path, file_type, file_size, attachment_type, uploaded_by, created_at)
  SELECT v_new_settlement_id, cash_advance_id, file_name, file_path, file_type, file_size, attachment_type, uploaded_by, created_at
  FROM cash_advance_settlement_attachments WHERE settlement_id = p_settlement_id;

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

REVOKE ALL ON FUNCTION public.unlock_settlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_settlement(uuid, text) TO authenticated, service_role;

-- Realtime (opsional, mengikuti tabel lampiran lain)
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_advance_settlement_attachments;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END;
END $$;
