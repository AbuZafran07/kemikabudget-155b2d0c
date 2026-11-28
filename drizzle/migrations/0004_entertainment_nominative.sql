-- =====================================================================
-- 0004_entertainment_nominative
-- Daftar Nominatif Biaya Entertainment (format Lampiran SPT)
--   * Kategori biaya bertanda requires_nominative (default: kode ENT)
--   * Realisasi CA dengan baris pos Entertainment wajib melampirkan Daftar Nominatif
--     yang totalnya sama dengan realisasi pos tersebut + file versi bertanda tangan
--   * Pengajuan Dana pos Entertainment wajib Daftar Nominatif lengkap sebelum di-settle
--   * Rekap tahunan untuk Lampiran SPT
-- Membutuhkan migrasi 0003_ca_policy_enforcement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Penanda kategori & pengaturan
-- ---------------------------------------------------------------------
ALTER TABLE public.cost_categories ADD COLUMN IF NOT EXISTS requires_nominative boolean NOT NULL DEFAULT false;
UPDATE public.cost_categories SET requires_nominative = true
WHERE upper(code) = 'ENT' OR name ILIKE 'entertain%';

ALTER TABLE public.ca_policy_settings ADD COLUMN IF NOT EXISTS require_entertainment_nominative boolean NOT NULL DEFAULT true;
ALTER TABLE public.ca_policy_settings ADD COLUMN IF NOT EXISTS entertainment_rule_effective_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.ca_policy_settings ADD COLUMN IF NOT EXISTS company_legal_name text NOT NULL DEFAULT 'PT KEMIKA KARYA PRATAMA';
ALTER TABLE public.ca_policy_settings ADD COLUMN IF NOT EXISTS company_npwp text NOT NULL DEFAULT '71.608.326.6-416.000';

CREATE OR REPLACE FUNCTION public.ca_policy_settings_touch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.id := true;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  -- Tanggal berlaku aturan tidak boleh diubah dari aplikasi
  NEW.attachment_rule_effective_at := OLD.attachment_rule_effective_at;
  NEW.entertainment_rule_effective_at := OLD.entertainment_rule_effective_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.category_requires_nominative(p_category_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT requires_nominative FROM public.cost_categories WHERE id = p_category_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.category_requires_nominative(uuid) TO authenticated, service_role;

-- Pos anggaran per baris realisasi (sebelumnya hanya ditampilkan, tidak disimpan)
ALTER TABLE public.cash_advance_settlement_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.cost_categories(id);
CREATE INDEX IF NOT EXISTS idx_ca_settlement_items_category ON public.cash_advance_settlement_items(category_id);

-- ---------------------------------------------------------------------
-- 2. Tabel Daftar Nominatif
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entertainment_nominatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid UNIQUE REFERENCES public.cash_advance_settlements(id) ON DELETE CASCADE,
  request_id uuid UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,
  cash_advance_id uuid REFERENCES public.cash_advances(id) ON DELETE CASCADE,
  signer_name text NOT NULL DEFAULT '',
  signer_city text NOT NULL DEFAULT 'Jakarta',
  signed_date date,
  signed_file_name text,
  signed_file_path text,
  signed_file_type text,
  signed_file_size integer,
  signed_uploaded_at timestamptz,
  signed_uploaded_by uuid,
  -- sidik isi baris saat file bertanda tangan diunggah; bila isi berubah, file harus diunggah ulang
  signed_fingerprint text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entertainment_nominatives_one_source CHECK (num_nonnulls(settlement_id, request_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_ent_nominatives_ca ON public.entertainment_nominatives(cash_advance_id);
CREATE INDEX IF NOT EXISTS idx_ent_nominatives_signed_path ON public.entertainment_nominatives(signed_file_path);

CREATE TABLE IF NOT EXISTS public.entertainment_nominative_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nominative_id uuid NOT NULL REFERENCES public.entertainment_nominatives(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  entry_date date NOT NULL,
  place text NOT NULL CHECK (length(btrim(place)) > 0),
  address text NOT NULL CHECK (length(btrim(address)) > 0),
  entertainment_type text NOT NULL CHECK (length(btrim(entertainment_type)) > 0),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  recipient_name text NOT NULL CHECK (length(btrim(recipient_name)) > 0),
  recipient_position text NOT NULL CHECK (length(btrim(recipient_position)) > 0),
  recipient_company text NOT NULL CHECK (length(btrim(recipient_company)) > 0),
  recipient_business_type text NOT NULL CHECK (length(btrim(recipient_business_type)) > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ent_nominative_entries_header ON public.entertainment_nominative_entries(nominative_id);
CREATE INDEX IF NOT EXISTS idx_ent_nominative_entries_date ON public.entertainment_nominative_entries(entry_date);

CREATE OR REPLACE FUNCTION public.entertainment_entries_fingerprint(p_nominative_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(COALESCE(string_agg(x.line, '#' ORDER BY x.line), ''))
  FROM (
    SELECT concat_ws('|', e.line_no::text, e.entry_date::text, e.place, e.address, e.entertainment_type, e.amount::text,
                     e.recipient_name, e.recipient_position, e.recipient_company, e.recipient_business_type, COALESCE(e.notes, '')) AS line
    FROM public.entertainment_nominative_entries e WHERE e.nominative_id = p_nominative_id
  ) x
$$;
GRANT EXECUTE ON FUNCTION public.entertainment_entries_fingerprint(uuid) TO authenticated, service_role;

-- Header: isi otomatis cash_advance_id & nama penandatangan (pemohon), kunci sumber dokumen
CREATE OR REPLACE FUNCTION public.entertainment_nominatives_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester uuid;
  v_keep boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.settlement_id := OLD.settlement_id;
    NEW.request_id := OLD.request_id;
    NEW.cash_advance_id := OLD.cash_advance_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  ELSE
    IF NEW.settlement_id IS NOT NULL THEN
      SELECT s.cash_advance_id, ca.requester_id INTO NEW.cash_advance_id, v_requester
      FROM public.cash_advance_settlements s JOIN public.cash_advances ca ON ca.id = s.cash_advance_id
      WHERE s.id = NEW.settlement_id;
      IF NEW.cash_advance_id IS NULL THEN RAISE EXCEPTION 'Realisasi tidak ditemukan'; END IF;
    ELSIF NEW.request_id IS NOT NULL THEN
      NEW.cash_advance_id := NULL;
      SELECT r.requester_id INTO v_requester FROM public.requests r WHERE r.id = NEW.request_id;
      IF v_requester IS NULL THEN RAISE EXCEPTION 'Pengajuan dana tidak ditemukan'; END IF;
    END IF;
    IF btrim(COALESCE(NEW.signer_name, '')) = '' THEN
      SELECT COALESCE(p.full_name, p.email, '') INTO NEW.signer_name FROM public.profiles p WHERE p.id = v_requester;
      NEW.signer_name := COALESCE(NEW.signer_name, '');
    END IF;
  END IF;
  -- File bertanda tangan: waktu, pengunggah, dan sidik isi ditentukan server.
  -- Pengecualian: penyalinan revisi & pemulihan backup oleh Super Admin mempertahankan nilai lama.
  v_keep := current_setting('kemika.copying_nominative', true) = 'on'
            OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
  IF NEW.signed_file_path IS NULL THEN
    NEW.signed_file_name := NULL; NEW.signed_file_type := NULL; NEW.signed_file_size := NULL;
    NEW.signed_uploaded_at := NULL; NEW.signed_uploaded_by := NULL; NEW.signed_fingerprint := NULL;
  ELSIF TG_OP = 'UPDATE' AND NEW.signed_file_path IS DISTINCT FROM OLD.signed_file_path THEN
    NEW.signed_uploaded_at := now();
    NEW.signed_uploaded_by := auth.uid();
    NEW.signed_fingerprint := public.entertainment_entries_fingerprint(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_keep THEN
      NEW.signed_uploaded_at := OLD.signed_uploaded_at;
      NEW.signed_uploaded_by := OLD.signed_uploaded_by;
      NEW.signed_fingerprint := OLD.signed_fingerprint;
    END IF;
  ELSIF NOT v_keep OR NEW.signed_fingerprint IS NULL THEN
    -- INSERT langsung dengan file
    NEW.signed_uploaded_at := now();
    NEW.signed_uploaded_by := auth.uid();
    NEW.signed_fingerprint := public.entertainment_entries_fingerprint(NEW.id);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entertainment_nominatives_before_write ON public.entertainment_nominatives;
CREATE TRIGGER trg_entertainment_nominatives_before_write
  BEFORE INSERT OR UPDATE ON public.entertainment_nominatives
  FOR EACH ROW EXECUTE FUNCTION public.entertainment_nominatives_before_write();

-- ---------------------------------------------------------------------
-- 3. Hak akses
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_entertainment_nominative(p_settlement_id uuid, p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN true
    WHEN p_settlement_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.cash_advance_settlements s
      WHERE s.id = p_settlement_id AND s.created_by = auth.uid()
        AND s.status IN ('draft'::public.settlement_status, 'submitted'::public.settlement_status))
    WHEN p_request_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = p_request_id AND r.requester_id = auth.uid()
        AND r.status IN ('draft'::public.request_status, 'submitted'::public.request_status, 'revision'::public.request_status,
                         'under_review'::public.request_status, 'approved'::public.request_status, 'paid'::public.request_status))
    ELSE false
  END
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_entertainment_nominative(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.entertainment_nominatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entertainment_nominative_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entertainment_nominatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entertainment_nominative_entries TO authenticated;
GRANT ALL ON public.entertainment_nominatives TO service_role;
GRANT ALL ON public.entertainment_nominative_entries TO service_role;

-- Lihat: mengikuti hak lihat dokumen sumbernya (RLS realisasi CA / pengajuan dana)
DROP POLICY IF EXISTS "View nominatives of visible documents" ON public.entertainment_nominatives;
CREATE POLICY "View nominatives of visible documents"
  ON public.entertainment_nominatives FOR SELECT TO authenticated
  USING (
    (settlement_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cash_advance_settlements s WHERE s.id = entertainment_nominatives.settlement_id))
    OR (request_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.requests r WHERE r.id = entertainment_nominatives.request_id))
  );
DROP POLICY IF EXISTS "Owners create nominatives" ON public.entertainment_nominatives;
CREATE POLICY "Owners create nominatives"
  ON public.entertainment_nominatives FOR INSERT TO authenticated
  WITH CHECK (
    (created_by = auth.uid() AND public.can_edit_entertainment_nominative(settlement_id, request_id))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)  -- pemulihan backup
  );
DROP POLICY IF EXISTS "Owners update nominatives" ON public.entertainment_nominatives;
CREATE POLICY "Owners update nominatives"
  ON public.entertainment_nominatives FOR UPDATE TO authenticated
  USING (public.can_edit_entertainment_nominative(settlement_id, request_id))
  WITH CHECK (public.can_edit_entertainment_nominative(settlement_id, request_id));
DROP POLICY IF EXISTS "Owners delete nominatives" ON public.entertainment_nominatives;
CREATE POLICY "Owners delete nominatives"
  ON public.entertainment_nominatives FOR DELETE TO authenticated
  USING (public.can_edit_entertainment_nominative(settlement_id, request_id));
DROP POLICY IF EXISTS session_must_be_valid ON public.entertainment_nominatives;
CREATE POLICY session_must_be_valid
  ON public.entertainment_nominatives AS RESTRICTIVE FOR ALL TO authenticated USING (public.check_session_valid());

DROP POLICY IF EXISTS "View entries of visible nominatives" ON public.entertainment_nominative_entries;
CREATE POLICY "View entries of visible nominatives"
  ON public.entertainment_nominative_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entertainment_nominatives h WHERE h.id = entertainment_nominative_entries.nominative_id));
DROP POLICY IF EXISTS "Owners manage entries" ON public.entertainment_nominative_entries;
CREATE POLICY "Owners manage entries"
  ON public.entertainment_nominative_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entertainment_nominatives h
                 WHERE h.id = entertainment_nominative_entries.nominative_id
                   AND public.can_edit_entertainment_nominative(h.settlement_id, h.request_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.entertainment_nominatives h
                 WHERE h.id = entertainment_nominative_entries.nominative_id
                   AND public.can_edit_entertainment_nominative(h.settlement_id, h.request_id)));
DROP POLICY IF EXISTS session_must_be_valid ON public.entertainment_nominative_entries;
CREATE POLICY session_must_be_valid
  ON public.entertainment_nominative_entries AS RESTRICTIVE FOR ALL TO authenticated USING (public.check_session_valid());

-- Storage untuk file Daftar Nominatif bertanda tangan
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('entertainment-nominatives', 'entertainment-nominatives', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Entertainment nominative files: owner upload" ON storage.objects;
CREATE POLICY "Entertainment nominative files: owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entertainment-nominatives' AND auth.uid() IS NOT NULL
              AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Entertainment nominative files: view" ON storage.objects;
CREATE POLICY "Entertainment nominative files: view"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'entertainment-nominatives' AND auth.uid() IS NOT NULL AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.entertainment_nominatives h WHERE h.signed_file_path = storage.objects.name)));
DROP POLICY IF EXISTS "Entertainment nominative files: owner delete" ON storage.objects;
CREATE POLICY "Entertainment nominative files: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'entertainment-nominatives' AND auth.uid() IS NOT NULL
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 4. Status kelengkapan (dipakai UI dan trigger)
--    SECURITY INVOKER: hanya membaca data yang memang boleh dilihat pemanggil.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entertainment_nominative_status(p_settlement_id uuid DEFAULT NULL, p_request_id uuid DEFAULT NULL)
RETURNS TABLE(required boolean, required_amount numeric, entries_total numeric, entry_count integer,
              has_signed_file boolean, signed_outdated boolean, missing_category boolean, is_complete boolean)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_ca_id uuid;
  v_has_ent boolean := false;
  v_cat_count integer := 0;
  v_header public.entertainment_nominatives%ROWTYPE;
BEGIN
  required := false; required_amount := 0; entries_total := 0; entry_count := 0;
  has_signed_file := false; signed_outdated := false; missing_category := false;

  IF p_settlement_id IS NOT NULL THEN
    SELECT s.cash_advance_id INTO v_ca_id FROM public.cash_advance_settlements s WHERE s.id = p_settlement_id;
    IF v_ca_id IS NOT NULL THEN
      SELECT bool_or(public.category_requires_nominative(i.category_id)), COUNT(DISTINCT i.category_id)
        INTO v_has_ent, v_cat_count
      FROM public.cash_advance_items i WHERE i.cash_advance_id = v_ca_id AND i.category_id IS NOT NULL;
      v_has_ent := COALESCE(v_has_ent, false);
      IF v_has_ent THEN
        IF v_cat_count = 1 THEN
          SELECT COALESCE(SUM(si.amount), 0) INTO required_amount
          FROM public.cash_advance_settlement_items si WHERE si.settlement_id = p_settlement_id;
        ELSE
          SELECT EXISTS (SELECT 1 FROM public.cash_advance_settlement_items si
                         WHERE si.settlement_id = p_settlement_id AND si.category_id IS NULL)
            INTO missing_category;
          SELECT COALESCE(SUM(si.amount), 0) INTO required_amount
          FROM public.cash_advance_settlement_items si
          WHERE si.settlement_id = p_settlement_id AND public.category_requires_nominative(si.category_id);
        END IF;
      END IF;
    END IF;
    SELECT * INTO v_header FROM public.entertainment_nominatives h WHERE h.settlement_id = p_settlement_id;
  ELSIF p_request_id IS NOT NULL THEN
    SELECT COALESCE(r.approved_amount, r.amount) INTO required_amount
    FROM public.requests r WHERE r.id = p_request_id AND public.category_requires_nominative(r.category_id);
    required_amount := COALESCE(required_amount, 0);
    SELECT * INTO v_header FROM public.entertainment_nominatives h WHERE h.request_id = p_request_id;
  END IF;

  required := required_amount > 0;
  IF v_header.id IS NOT NULL THEN
    SELECT COALESCE(SUM(e.amount), 0), COUNT(*) INTO entries_total, entry_count
    FROM public.entertainment_nominative_entries e WHERE e.nominative_id = v_header.id;
    IF v_header.signed_file_path IS NOT NULL THEN
      signed_outdated := v_header.signed_fingerprint IS DISTINCT FROM public.entertainment_entries_fingerprint(v_header.id);
      has_signed_file := NOT signed_outdated;
    END IF;
  END IF;
  is_complete := NOT missing_category AND (NOT required OR (entry_count > 0 AND entries_total = required_amount AND has_signed_file));
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.entertainment_nominative_status(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.entertainment_nominative_error(
  p_required_amount numeric, p_entries_total numeric, p_entry_count integer, p_has_signed boolean, p_outdated boolean DEFAULT false)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_entry_count = 0 THEN
      'Lengkapi Daftar Nominatif Entertainment (data penerima) untuk pos Entertainment sebesar Rp ' || to_char(p_required_amount, 'FM999G999G999G990') || '.'
    WHEN p_entries_total <> p_required_amount THEN
      'Total Daftar Nominatif Entertainment (Rp ' || to_char(p_entries_total, 'FM999G999G999G990') ||
      ') harus sama dengan realisasi pos Entertainment (Rp ' || to_char(p_required_amount, 'FM999G999G999G990') || ').'
    WHEN NOT p_has_signed AND p_outdated THEN
      'Isi Daftar Nominatif Entertainment berubah setelah file bertanda tangan diunggah. Cetak ulang, tanda tangani, lalu unggah kembali.'
    WHEN NOT p_has_signed THEN
      'Unggah Daftar Nominatif Entertainment yang sudah ditandatangani.'
    ELSE 'Daftar Nominatif Entertainment belum lengkap.'
  END
$$;

-- ---------------------------------------------------------------------
-- 5. Penjaga: realisasi CA (submit & approve)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_entertainment_on_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.ca_policy_settings%ROWTYPE;
  v_st record;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status NOT IN ('submitted'::public.settlement_status, 'approved'::public.settlement_status) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_settings FROM public.ca_policy_settings WHERE id = true;
  IF NOT COALESCE(v_settings.require_entertainment_nominative, true) THEN
    RETURN NEW;
  END IF;
  -- realisasi yang diajukan sebelum aturan berlaku tetap bisa disetujui
  IF NEW.status = 'approved'::public.settlement_status
     AND (OLD.submitted_at IS NULL OR OLD.submitted_at < v_settings.entertainment_rule_effective_at) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_st FROM public.entertainment_nominative_status(NEW.id, NULL);
  IF v_st.missing_category THEN
    RAISE EXCEPTION 'CA ini memiliki pos Entertainment: pilih pos anggaran untuk setiap baris realisasi.';
  END IF;
  IF v_st.required AND NOT v_st.is_complete THEN
    RAISE EXCEPTION '%', public.entertainment_nominative_error(v_st.required_amount, v_st.entries_total, v_st.entry_count, v_st.has_signed_file, v_st.signed_outdated);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_entertainment_on_settlement ON public.cash_advance_settlements;
CREATE TRIGGER trg_guard_entertainment_on_settlement
  BEFORE UPDATE ON public.cash_advance_settlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_entertainment_on_settlement();

-- ---------------------------------------------------------------------
-- 6. Penjaga: Pengajuan Dana paid -> settled
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_entertainment_on_request_settle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.ca_policy_settings%ROWTYPE;
  v_st record;
BEGIN
  SELECT * INTO v_settings FROM public.ca_policy_settings WHERE id = true;
  IF NOT COALESCE(v_settings.require_entertainment_nominative, true) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(OLD.submitted_at, OLD.created_at) < v_settings.entertainment_rule_effective_at THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_st FROM public.entertainment_nominative_status(NULL, NEW.id);
  IF v_st.required AND NOT v_st.is_complete THEN
    RAISE EXCEPTION 'Pengajuan % belum dapat diselesaikan. %', OLD.request_number,
      public.entertainment_nominative_error(v_st.required_amount, v_st.entries_total, v_st.entry_count, v_st.has_signed_file, v_st.signed_outdated);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_entertainment_on_request_settle ON public.requests;
CREATE TRIGGER trg_guard_entertainment_on_request_settle
  BEFORE UPDATE OF status ON public.requests
  FOR EACH ROW
  WHEN (OLD.status = 'paid'::public.request_status AND NEW.status = 'settled'::public.request_status)
  EXECUTE FUNCTION public.guard_entertainment_on_request_settle();

-- ---------------------------------------------------------------------
-- 7. Salin Daftar Nominatif saat realisasi direvisi (unlock)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_entertainment_nominative_to_settlement(p_from_settlement uuid, p_to_settlement uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.entertainment_nominatives%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_old FROM public.entertainment_nominatives WHERE settlement_id = p_from_settlement;
  IF v_old.id IS NULL THEN RETURN; END IF;

  PERFORM set_config('kemika.copying_nominative', 'on', true);
  INSERT INTO public.entertainment_nominatives (settlement_id, signer_name, signer_city, signed_date,
    signed_file_name, signed_file_path, signed_file_type, signed_file_size,
    signed_uploaded_at, signed_uploaded_by, signed_fingerprint, created_by)
  VALUES (p_to_settlement, v_old.signer_name, v_old.signer_city, v_old.signed_date,
    v_old.signed_file_name, v_old.signed_file_path, v_old.signed_file_type, v_old.signed_file_size,
    v_old.signed_uploaded_at, v_old.signed_uploaded_by, v_old.signed_fingerprint, v_old.created_by)
  RETURNING id INTO v_new_id;

  INSERT INTO public.entertainment_nominative_entries (nominative_id, line_no, entry_date, place, address, entertainment_type,
    amount, recipient_name, recipient_position, recipient_company, recipient_business_type, notes)
  SELECT v_new_id, line_no, entry_date, place, address, entertainment_type,
    amount, recipient_name, recipient_position, recipient_company, recipient_business_type, notes
  FROM public.entertainment_nominative_entries WHERE nominative_id = v_old.id;
  PERFORM set_config('kemika.copying_nominative', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.copy_entertainment_nominative_to_settlement(uuid, uuid) FROM PUBLIC, anon, authenticated;

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

  INSERT INTO cash_advance_settlement_items (settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes, category_id)
  SELECT v_new_settlement_id, description, quantity, unit_price, amount, receipt_number, receipt_date, notes, category_id
  FROM cash_advance_settlement_items WHERE settlement_id = p_settlement_id;

  -- [CA policy] Bawa bukti realisasi ke draft revisi (file storage tetap sama, riwayat lama tidak diubah)
  INSERT INTO cash_advance_settlement_attachments (settlement_id, cash_advance_id, file_name, file_path, file_type, file_size, attachment_type, uploaded_by, created_at)
  SELECT v_new_settlement_id, cash_advance_id, file_name, file_path, file_type, file_size, attachment_type, uploaded_by, created_at
  FROM cash_advance_settlement_attachments WHERE settlement_id = p_settlement_id;

  -- [Entertainment] Bawa Daftar Nominatif (beserta file bertanda tangan) ke draft revisi
  PERFORM public.copy_entertainment_nominative_to_settlement(p_settlement_id, v_new_settlement_id);

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

-- ---------------------------------------------------------------------
-- 8. Rekap tahunan (Lampiran SPT) — hanya dokumen final:
--    realisasi CA berstatus approved, pengajuan dana berstatus paid/settled
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entertainment_nominative_report(p_year integer)
RETURNS TABLE(entry_id uuid, entry_date date, place text, address text, entertainment_type text, amount numeric,
              recipient_name text, recipient_position text, recipient_company text, recipient_business_type text,
              notes text, source_type text, source_number text, division_name text, signer_name text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT e.id, e.entry_date, e.place, e.address, e.entertainment_type, e.amount,
         e.recipient_name, e.recipient_position, e.recipient_company, e.recipient_business_type, e.notes,
         CASE WHEN h.settlement_id IS NOT NULL THEN 'cash_advance' ELSE 'request' END,
         COALESCE(ca.ca_number || ' / ' || s.settlement_number, r.request_number),
         COALESCE(dca.name, dr.name),
         h.signer_name
  FROM public.entertainment_nominative_entries e
  JOIN public.entertainment_nominatives h ON h.id = e.nominative_id
  LEFT JOIN public.cash_advance_settlements s ON s.id = h.settlement_id
  LEFT JOIN public.cash_advances ca ON ca.id = s.cash_advance_id
  LEFT JOIN public.divisions dca ON dca.id = ca.division_id
  LEFT JOIN public.requests r ON r.id = h.request_id
  LEFT JOIN public.divisions dr ON dr.id = r.division_id
  WHERE EXTRACT(YEAR FROM e.entry_date) = p_year
    AND (
      (h.settlement_id IS NOT NULL AND s.status = 'approved'::public.settlement_status)
      OR (h.request_id IS NOT NULL AND r.status IN ('paid'::public.request_status, 'settled'::public.request_status))
    )
  ORDER BY e.entry_date, COALESCE(ca.ca_number, r.request_number), e.line_no
$$;
GRANT EXECUTE ON FUNCTION public.get_entertainment_nominative_report(integer) TO authenticated, service_role;
