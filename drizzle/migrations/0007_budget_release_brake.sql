-- =====================================================================
-- 0007_budget_release_brake — "Rem Budget"
-- Plafon tiap pos (divisi x kategori) dibuka bertahap:
--   * Budget awal (initial_release_amount) dibuka lebih dulu, sisanya DITAHAN.
--   * Mode 'sales'  : sisa dibuka OTOMATIS sesuai pencapaian penjualan total perusahaan
--                     (realisasi invoice vs target, kumulatif s.d. bulan terakhir yang sudah lewat)
--                     saat dana terbuka pos tidak cukup untuk sebuah pengajuan.
--                     Default tingkat: <85% = 0, >=85% = 40%, >=90% = 75%, >=100% = 100% dari dana ditahan.
--   * Mode 'manual' : sisa hanya dibuka manual oleh Super Admin (mis. beli gudang, renovasi HO).
--   * Mode 'none'   : tanpa rem — seluruh plafon terbuka (default, perilaku lama).
--   * Dana yang sudah dibuka tidak pernah ditarik kembali.
--   * Super Admin dapat membuka manual dengan alasan; semua pembukaan tercatat.
-- Membutuhkan 0005 (titik sambung budget_line_open_amount / auto_release / brake_note / after_transfer).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Kolom pada pos anggaran
-- ---------------------------------------------------------------------
ALTER TABLE public.division_budgets
  ADD COLUMN IF NOT EXISTS release_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS initial_release_amount numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_amount numeric(15,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'division_budgets_release_mode_check') THEN
    ALTER TABLE public.division_budgets
      ADD CONSTRAINT division_budgets_release_mode_check CHECK (release_mode IN ('none', 'sales', 'manual'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Pengaturan tingkat pembukaan (satu baris)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_release_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  tiers jsonb NOT NULL DEFAULT '[{"min_pct":85,"release_pct":40},{"min_pct":90,"release_pct":75},{"min_pct":100,"release_pct":100}]'::jsonb,
  auto_release_enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.budget_release_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.budget_release_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view budget release settings" ON public.budget_release_settings;
CREATE POLICY "Authenticated can view budget release settings" ON public.budget_release_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin can update budget release settings" ON public.budget_release_settings;
CREATE POLICY "Super admin can update budget release settings" ON public.budget_release_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS "Super admin can restore budget release settings" ON public.budget_release_settings;
CREATE POLICY "Super admin can restore budget release settings" ON public.budget_release_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE ON public.budget_release_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_budget_release_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_t jsonb; v_prev_min numeric := -1; v_prev_rel numeric := -1;
BEGIN
  IF jsonb_typeof(NEW.tiers) <> 'array' THEN RAISE EXCEPTION 'Format tingkat pembukaan tidak valid'; END IF;
  FOR v_t IN SELECT value FROM jsonb_array_elements(NEW.tiers) ORDER BY (value->>'min_pct')::numeric LOOP
    IF (v_t->>'min_pct') IS NULL OR (v_t->>'release_pct') IS NULL
       OR (v_t->>'min_pct')::numeric < 0 OR (v_t->>'min_pct')::numeric > 1000
       OR (v_t->>'release_pct')::numeric < 0 OR (v_t->>'release_pct')::numeric > 100 THEN
      RAISE EXCEPTION 'Tingkat pembukaan: pencapaian minimal 0–1000%% dan persentase dibuka 0–100%%';
    END IF;
    IF (v_t->>'min_pct')::numeric = v_prev_min THEN RAISE EXCEPTION 'Tingkat pembukaan: pencapaian minimal tidak boleh sama'; END IF;
    IF (v_t->>'release_pct')::numeric < v_prev_rel THEN RAISE EXCEPTION 'Tingkat pembukaan: persentase dibuka harus naik mengikuti pencapaian'; END IF;
    v_prev_min := (v_t->>'min_pct')::numeric; v_prev_rel := (v_t->>'release_pct')::numeric;
  END LOOP;
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_budget_release_settings ON public.budget_release_settings;
CREATE TRIGGER trg_validate_budget_release_settings BEFORE INSERT OR UPDATE ON public.budget_release_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_budget_release_settings();

-- ---------------------------------------------------------------------
-- Data penjualan bulanan (total perusahaan) — disinkron dari Finance Yield atau diisi manual
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  actual_invoice_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (actual_invoice_amount >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'finance_yield')),
  synced_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);
ALTER TABLE public.sales_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Management can view sales performance" ON public.sales_performance;
CREATE POLICY "Management can view sales performance" ON public.sales_performance
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'executive'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Finance can manage sales performance" ON public.sales_performance;
CREATE POLICY "Finance can manage sales performance" ON public.sales_performance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_performance TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_performance_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sales_performance_touch ON public.sales_performance;
CREATE TRIGGER trg_sales_performance_touch BEFORE INSERT OR UPDATE ON public.sales_performance
  FOR EACH ROW EXECUTE FUNCTION public.sales_performance_touch();

-- ---------------------------------------------------------------------
-- Riwayat pembukaan dana
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_budget_id uuid NOT NULL REFERENCES public.division_budgets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('plan', 'auto', 'manual', 'transfer_in', 'transfer_out')),
  release_mode text,
  released_before numeric(15,2) NOT NULL DEFAULT 0,
  released_after numeric(15,2) NOT NULL DEFAULT 0,
  allocated_amount numeric(15,2),
  achievement_pct numeric(9,2),
  tier_release_pct numeric(6,2),
  reason text,
  reference_id uuid,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_release_events_budget ON public.budget_release_events (division_budget_id, created_at DESC);
ALTER TABLE public.budget_release_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Management can view budget release events" ON public.budget_release_events;
CREATE POLICY "Management can view budget release events" ON public.budget_release_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'executive'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));
-- tidak ada INSERT biasa: riwayat ditulis oleh fungsi Rem Budget. Super Admin boleh memulihkan dari backup.
DROP POLICY IF EXISTS "Super admin can restore budget release events" ON public.budget_release_events;
CREATE POLICY "Super admin can restore budget release events" ON public.budget_release_events
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS "Super admin can restore budget release events (update)" ON public.budget_release_events;
CREATE POLICY "Super admin can restore budget release events (update)" ON public.budget_release_events
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
GRANT SELECT, INSERT, UPDATE ON public.budget_release_events TO authenticated;

-- ---------------------------------------------------------------------
-- Penjaga kolom rem pada division_budgets
--   * hanya berubah lewat fungsi Rem Budget (atau Super Admin, mis. saat restore backup)
--   * initial & released tidak boleh melebihi plafon
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_division_budget_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.release_mode IS DISTINCT FROM OLD.release_mode
          OR NEW.initial_release_amount IS DISTINCT FROM OLD.initial_release_amount
          OR NEW.released_amount IS DISTINCT FROM OLD.released_amount)
     AND COALESCE(current_setting('kemika.budget_release_rpc', true), '') <> 'on'
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Pengaturan Rem Budget hanya dapat diubah melalui menu Rem Budget';
  END IF;
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND (NEW.release_mode <> 'none' OR NEW.initial_release_amount <> 0 OR NEW.released_amount <> 0) THEN
    NEW.release_mode := 'none'; NEW.initial_release_amount := 0; NEW.released_amount := 0;
  END IF;
  NEW.initial_release_amount := LEAST(GREATEST(COALESCE(NEW.initial_release_amount, 0), 0), GREATEST(NEW.allocated_amount, 0));
  NEW.released_amount := LEAST(GREATEST(COALESCE(NEW.released_amount, 0), 0), GREATEST(NEW.allocated_amount, 0));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_division_budget_release ON public.division_budgets;
CREATE TRIGGER trg_guard_division_budget_release BEFORE INSERT OR UPDATE ON public.division_budgets
  FOR EACH ROW EXECUTE FUNCTION public.guard_division_budget_release();

-- ---------------------------------------------------------------------
-- Pencapaian penjualan kumulatif
--   tahun lalu  : Januari–Desember
--   tahun ini   : Januari s.d. bulan terakhir yang sudah lewat (bulan berjalan belum dihitung)
--   tahun depan : belum ada bulan yang dihitung (pencapaian kosong = dana ditahan tetap ditahan)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_achievement(p_year int)
RETURNS TABLE(year int, months_counted int, last_month int, target_amount numeric, actual_amount numeric, achievement_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH lim AS (
    SELECT CASE
      WHEN p_year < extract(year FROM public.ca_today())::int THEN 12
      WHEN p_year = extract(year FROM public.ca_today())::int THEN extract(month FROM public.ca_today())::int - 1
      ELSE 0 END AS m
  ), agg AS (
    SELECT COUNT(*) FILTER (WHERE sp.target_amount > 0)::int AS n,
           MAX(sp.month) FILTER (WHERE sp.target_amount > 0) AS lm,
           COALESCE(SUM(sp.target_amount), 0) AS t,
           COALESCE(SUM(sp.actual_invoice_amount), 0) AS a
    FROM lim LEFT JOIN public.sales_performance sp ON sp.year = p_year AND sp.month <= lim.m
  )
  SELECT p_year, agg.n, agg.lm, agg.t, agg.a,
         CASE WHEN agg.t > 0 THEN ROUND(agg.a * 100 / agg.t, 2) END
  FROM agg
$$;

CREATE OR REPLACE FUNCTION public.budget_release_tier_pct(p_achievement numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT (t->>'release_pct')::numeric
    FROM public.budget_release_settings s, jsonb_array_elements(s.tiers) t
    WHERE p_achievement IS NOT NULL AND p_achievement >= (t->>'min_pct')::numeric
    ORDER BY (t->>'min_pct')::numeric DESC LIMIT 1), 0)
$$;

-- Plafon yang seharusnya terbuka menurut pencapaian penjualan saat ini (mode 'sales')
CREATE OR REPLACE FUNCTION public.budget_line_sales_target(p_budget_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN db.release_mode = 'sales' THEN
           LEAST(db.allocated_amount, db.initial_release_amount
             + FLOOR(GREATEST(db.allocated_amount - db.initial_release_amount, 0)
                     * public.budget_release_tier_pct((SELECT a.achievement_pct FROM public.sales_achievement(bp.year) a)) / 100))
         ELSE db.initial_release_amount END
  FROM public.division_budgets db JOIN public.budget_periods bp ON bp.id = db.period_id
  WHERE db.id = p_budget_id
$$;

-- ---------------------------------------------------------------------
-- Titik sambung dari 0005 — kini dengan logika Rem Budget
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.budget_line_open_amount(p_budget_id uuid, p_simulate boolean DEFAULT false)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN db.release_mode = 'none' THEN db.allocated_amount
    WHEN p_simulate AND db.release_mode = 'sales'
         AND COALESCE((SELECT auto_release_enabled FROM public.budget_release_settings LIMIT 1), false)
      THEN LEAST(db.allocated_amount, GREATEST(db.released_amount, public.budget_line_sales_target(db.id)))
    ELSE LEAST(db.allocated_amount, db.released_amount) END
  FROM public.division_budgets db WHERE db.id = p_budget_id
$$;

CREATE OR REPLACE FUNCTION public.budget_line_auto_release(p_budget_id uuid, p_required_open numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_db public.division_budgets%ROWTYPE;
  v_year int;
  v_target numeric;
  v_ach numeric;
BEGIN
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_budget_id;
  IF NOT FOUND OR v_db.release_mode <> 'sales' THEN RETURN; END IF;
  IF NOT COALESCE((SELECT auto_release_enabled FROM public.budget_release_settings LIMIT 1), false) THEN RETURN; END IF;
  IF COALESCE(p_required_open, 0) <= LEAST(v_db.released_amount, v_db.allocated_amount) THEN RETURN; END IF;
  v_target := public.budget_line_sales_target(p_budget_id);
  IF v_target <= v_db.released_amount THEN RETURN; END IF;
  SELECT bp.year INTO v_year FROM public.budget_periods bp WHERE bp.id = v_db.period_id;
  SELECT a.achievement_pct INTO v_ach FROM public.sales_achievement(v_year) a;
  PERFORM set_config('kemika.budget_release_rpc', 'on', true);
  UPDATE public.division_budgets SET released_amount = v_target, updated_at = now() WHERE id = p_budget_id;
  PERFORM set_config('kemika.budget_release_rpc', '', true);
  INSERT INTO public.budget_release_events (division_budget_id, event_type, release_mode, released_before, released_after,
    allocated_amount, achievement_pct, tier_release_pct, reason, performed_by)
  VALUES (p_budget_id, 'auto', v_db.release_mode, v_db.released_amount, v_target, v_db.allocated_amount, v_ach,
    public.budget_release_tier_pct(v_ach), 'Dibuka otomatis sesuai pencapaian penjualan', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.budget_line_brake_note(p_budget_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_db public.division_budgets%ROWTYPE;
  v_year int;
  v_open numeric;
  v_ach record;
  v_next numeric;
  v_txt text;
BEGIN
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_budget_id;
  IF NOT FOUND OR v_db.release_mode = 'none' THEN RETURN ''; END IF;
  v_open := LEAST(v_db.released_amount, v_db.allocated_amount);
  IF v_db.allocated_amount - v_open <= 0 THEN RETURN ''; END IF;
  v_txt := ' [Rem Budget] Pos ini baru dibuka Rp ' || to_char(v_open, 'FM999G999G999G990')
        || ' dari plafon Rp ' || to_char(v_db.allocated_amount, 'FM999G999G999G990')
        || '; Rp ' || to_char(v_db.allocated_amount - v_open, 'FM999G999G999G990') || ' masih ditahan';
  IF v_db.release_mode = 'manual' THEN
    RETURN v_txt || ' sampai dibuka oleh Super Admin.';
  END IF;
  SELECT bp.year INTO v_year FROM public.budget_periods bp WHERE bp.id = v_db.period_id;
  SELECT * INTO v_ach FROM public.sales_achievement(v_year);
  SELECT MIN((t->>'min_pct')::numeric) INTO v_next
  FROM public.budget_release_settings s, jsonb_array_elements(s.tiers) t
  WHERE (t->>'release_pct')::numeric > public.budget_release_tier_pct(v_ach.achievement_pct)
    AND (v_ach.achievement_pct IS NULL OR (t->>'min_pct')::numeric > v_ach.achievement_pct);
  RETURN v_txt
    || CASE WHEN v_ach.achievement_pct IS NULL THEN ' (pencapaian penjualan belum tersedia)'
            ELSE ' (pencapaian penjualan ' || to_char(v_ach.achievement_pct, 'FM990D0') || '% s.d. bulan ke-' || v_ach.last_month || ')' END
    || CASE WHEN v_next IS NOT NULL THEN '. Dana berikutnya terbuka otomatis saat pencapaian mencapai ' || to_char(v_next, 'FM990') || '%' ELSE '' END
    || ', atau minta Super Admin membuka secara manual.';
END $$;

CREATE OR REPLACE FUNCTION public.budget_line_after_transfer(p_from uuid, p_to uuid, p_amount numeric, p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_db public.division_budgets%ROWTYPE;
BEGIN
  PERFORM set_config('kemika.budget_release_rpc', 'on', true);
  -- pos asal: dana yang dipindahkan berasal dari bagian yang sudah dibuka
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_from;
  IF FOUND AND v_db.release_mode <> 'none' THEN
    UPDATE public.division_budgets
    SET released_amount = GREATEST(released_amount - p_amount, 0),
        initial_release_amount = GREATEST(initial_release_amount - p_amount, 0)
    WHERE id = p_from;
    INSERT INTO public.budget_release_events (division_budget_id, event_type, release_mode, released_before, released_after, allocated_amount, reason, reference_id, performed_by)
    SELECT p_from, 'transfer_out', v_db.release_mode, v_db.released_amount, db.released_amount, db.allocated_amount,
           'Transfer Anggaran keluar', p_transfer_id, auth.uid()
    FROM public.division_budgets db WHERE db.id = p_from;
  END IF;
  -- pos tujuan: dana transfer langsung terbuka
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_to;
  IF FOUND AND v_db.release_mode <> 'none' THEN
    UPDATE public.division_budgets
    SET released_amount = released_amount + p_amount,
        initial_release_amount = initial_release_amount + p_amount
    WHERE id = p_to;
    INSERT INTO public.budget_release_events (division_budget_id, event_type, release_mode, released_before, released_after, allocated_amount, reason, reference_id, performed_by)
    SELECT p_to, 'transfer_in', v_db.release_mode, v_db.released_amount, db.released_amount, db.allocated_amount,
           'Transfer Anggaran masuk (langsung terbuka)', p_transfer_id, auth.uid()
    FROM public.division_budgets db WHERE db.id = p_to;
  END IF;
  PERFORM set_config('kemika.budget_release_rpc', '', true);
END $$;

-- ---------------------------------------------------------------------
-- RPC: atur rencana rem per pos (Super Admin / Finance)
--   p_mode    : 'none' | 'sales' | 'manual'
--   p_initial : budget awal yang dibuka. Otomatis dinaikkan bila lebih kecil dari dana yang sudah
--               terpakai + dipesan, agar pengajuan yang sedang berjalan tidak tersangkut.
--   Dana yang sudah dibuka tidak pernah dikurangi.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_budget_release_plan(p_budget_id uuid, p_mode text, p_initial numeric, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_db public.division_budgets%ROWTYPE;
  v_min numeric;
  v_initial numeric;
  v_released numeric;
  v_raised boolean := false;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'super_admin'::public.app_role) OR public.has_role(v_uid, 'finance'::public.app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya Super Admin atau Finance yang dapat mengatur Rem Budget');
  END IF;
  IF p_mode NOT IN ('none', 'sales', 'manual') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mode Rem Budget tidak valid');
  END IF;
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_budget_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Pos anggaran tidak ditemukan'); END IF;
  IF EXISTS (SELECT 1 FROM public.budget_periods WHERE id = v_db.period_id AND is_closed) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Periode anggaran sudah ditutup');
  END IF;

  IF p_mode = 'none' THEN
    v_initial := v_db.allocated_amount; v_released := v_db.allocated_amount;
  ELSE
    IF p_initial IS NULL OR p_initial < 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Budget awal tidak valid'); END IF;
    IF p_initial > v_db.allocated_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Budget awal melebihi plafon pos (Rp ' || to_char(v_db.allocated_amount, 'FM999G999G999G990') || ')');
    END IF;
    v_min := LEAST(v_db.allocated_amount, v_db.used_amount + public.budget_line_claims(v_db.id));
    v_initial := GREATEST(ROUND(p_initial, 0), v_min);
    v_raised := v_initial > ROUND(p_initial, 0);
    -- dari "tanpa rem": seluruh plafon dianggap terbuka sebelumnya, jadi mulai dari budget awal;
    -- selain itu dana yang sudah dibuka dipertahankan
    v_released := CASE WHEN v_db.release_mode = 'none' THEN v_initial ELSE GREATEST(v_db.released_amount, v_initial) END;
  END IF;

  PERFORM set_config('kemika.budget_release_rpc', 'on', true);
  UPDATE public.division_budgets
  SET release_mode = p_mode, initial_release_amount = v_initial, released_amount = v_released, updated_at = now()
  WHERE id = p_budget_id;
  PERFORM set_config('kemika.budget_release_rpc', '', true);

  INSERT INTO public.budget_release_events (division_budget_id, event_type, release_mode, released_before, released_after, allocated_amount, reason, performed_by)
  VALUES (p_budget_id, 'plan', p_mode,
          CASE WHEN v_db.release_mode = 'none' THEN v_db.allocated_amount ELSE v_db.released_amount END,
          v_released, v_db.allocated_amount,
          COALESCE(NULLIF(btrim(p_note), ''),
            CASE p_mode WHEN 'none' THEN 'Tanpa rem (seluruh plafon terbuka)'
                        WHEN 'sales' THEN 'Rem mengikuti pencapaian penjualan; budget awal Rp ' || to_char(v_initial, 'FM999G999G999G990')
                        ELSE 'Rem manual; budget awal Rp ' || to_char(v_initial, 'FM999G999G999G990') END),
          v_uid);

  RETURN jsonb_build_object('success', true, 'initial', v_initial, 'released', v_released, 'raised', v_raised,
    'message', CASE WHEN v_raised THEN 'Budget awal dinaikkan menjadi Rp ' || to_char(v_initial, 'FM999G999G999G990') || ' karena sudah terpakai/dipesan sebesar itu' ELSE 'Rencana Rem Budget disimpan' END);
END $$;

-- Atur banyak pos sekaligus: budget awal = persentase plafon (mis. 30%)
CREATE OR REPLACE FUNCTION public.set_budget_release_plan_bulk(p_period_id uuid, p_division_id uuid, p_mode text, p_initial_pct numeric, p_only_unset boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row record;
  v_res jsonb;
  v_count int := 0;
  v_raised int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya Super Admin atau Finance yang dapat mengatur Rem Budget');
  END IF;
  IF p_initial_pct IS NULL OR p_initial_pct < 0 OR p_initial_pct > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Persentase budget awal harus 0–100');
  END IF;
  FOR v_row IN
    SELECT id, allocated_amount FROM public.division_budgets
    WHERE period_id = p_period_id AND (p_division_id IS NULL OR division_id = p_division_id)
      AND (NOT p_only_unset OR release_mode = 'none')
    ORDER BY id
  LOOP
    v_res := public.set_budget_release_plan(v_row.id, p_mode, ROUND(v_row.allocated_amount * p_initial_pct / 100, 0),
      'Pengaturan massal: budget awal ' || p_initial_pct || '% dari plafon');
    IF (v_res->>'success')::boolean THEN
      v_count := v_count + 1;
      IF (v_res->>'raised')::boolean THEN v_raised := v_raised + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'count', v_count, 'raised', v_raised);
END $$;

-- ---------------------------------------------------------------------
-- RPC: buka dana manual (Super Admin, wajib alasan)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_budget_manual(p_budget_id uuid, p_amount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_db public.division_budgets%ROWTYPE;
  v_after numeric;
  v_year int;
  v_ach numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'super_admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya Super Admin yang dapat membuka dana secara manual');
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan pembukaan wajib diisi (minimal 5 karakter)');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nominal pembukaan harus lebih dari 0');
  END IF;
  SELECT * INTO v_db FROM public.division_budgets WHERE id = p_budget_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Pos anggaran tidak ditemukan'); END IF;
  IF v_db.release_mode = 'none' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pos ini tanpa rem — seluruh plafon sudah terbuka');
  END IF;
  IF v_db.allocated_amount - v_db.released_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tidak ada dana yang masih ditahan pada pos ini');
  END IF;
  v_after := LEAST(v_db.allocated_amount, v_db.released_amount + ROUND(p_amount, 0));
  SELECT bp.year INTO v_year FROM public.budget_periods bp WHERE bp.id = v_db.period_id;
  SELECT a.achievement_pct INTO v_ach FROM public.sales_achievement(v_year) a;

  PERFORM set_config('kemika.budget_release_rpc', 'on', true);
  UPDATE public.division_budgets SET released_amount = v_after, updated_at = now() WHERE id = p_budget_id;
  PERFORM set_config('kemika.budget_release_rpc', '', true);

  INSERT INTO public.budget_release_events (division_budget_id, event_type, release_mode, released_before, released_after, allocated_amount, achievement_pct, reason, performed_by)
  VALUES (p_budget_id, 'manual', v_db.release_mode, v_db.released_amount, v_after, v_db.allocated_amount, v_ach, btrim(p_reason), v_uid);
  INSERT INTO public.audit_logs (user_id, event_type, entity_type, entity_id, description, metadata)
  VALUES (v_uid, 'budget_release', 'division_budget', p_budget_id,
    'Buka dana manual Rp ' || to_char(v_after - v_db.released_amount, 'FM999G999G999G990') || ': ' || btrim(p_reason),
    jsonb_build_object('before', v_db.released_amount, 'after', v_after, 'allocated', v_db.allocated_amount));

  RETURN jsonb_build_object('success', true, 'released', v_after, 'opened', v_after - v_db.released_amount);
END $$;

-- ---------------------------------------------------------------------
-- RPC: ringkasan untuk halaman Rem Budget
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_achievement(p_year int)
RETURNS TABLE(year int, months_counted int, last_month int, target_amount numeric, actual_amount numeric, achievement_pct numeric, tier_release_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)
     OR public.has_role(auth.uid(), 'executive'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Akses tidak diizinkan';
  END IF;
  RETURN QUERY SELECT a.year, a.months_counted, a.last_month, a.target_amount, a.actual_amount, a.achievement_pct,
                      public.budget_release_tier_pct(a.achievement_pct)
               FROM public.sales_achievement(p_year) a;
END $$;

CREATE OR REPLACE FUNCTION public.get_budget_brake_overview(p_period_id uuid)
RETURNS TABLE(budget_id uuid, division_id uuid, division_code text, division_name text, category_id uuid, category_code text, category_name text,
              release_mode text, allocated numeric, initial_release numeric, released numeric, used numeric, reserved numeric,
              available numeric, held numeric, auto_target numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'finance'::public.app_role)
     OR public.has_role(auth.uid(), 'executive'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Akses tidak diizinkan';
  END IF;
  RETURN QUERY
  SELECT db.id, d.id, d.code::text, d.name::text, cc.id, cc.code::text, cc.name::text,
         db.release_mode, db.allocated_amount::numeric, db.initial_release_amount::numeric,
         public.budget_line_open_amount(db.id), db.used_amount::numeric, c.claims,
         public.budget_line_open_amount(db.id) - db.used_amount - c.claims,
         GREATEST(db.allocated_amount - public.budget_line_open_amount(db.id), 0),
         CASE WHEN db.release_mode = 'sales' THEN public.budget_line_sales_target(db.id) END
  FROM public.division_budgets db
  JOIN public.divisions d ON d.id = db.division_id
  JOIN public.cost_categories cc ON cc.id = db.category_id
  CROSS JOIN LATERAL (SELECT public.budget_line_claims(db.id) AS claims) c
  WHERE db.period_id = p_period_id
  ORDER BY d.code, cc.code;
END $$;

-- ---------------------------------------------------------------------
-- Hak akses fungsi
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sales_achievement(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_release_tier_pct(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_sales_target(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_open_amount(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_auto_release(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_brake_note(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_line_after_transfer(uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_achievement(int), public.budget_release_tier_pct(numeric), public.budget_line_sales_target(uuid),
  public.budget_line_open_amount(uuid, boolean), public.budget_line_auto_release(uuid, numeric), public.budget_line_brake_note(uuid),
  public.budget_line_after_transfer(uuid, uuid, numeric, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_budget_release_plan(uuid, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_budget_release_plan_bulk(uuid, uuid, text, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_budget_manual(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_achievement(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_budget_brake_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_budget_release_plan(uuid, text, numeric, text),
  public.set_budget_release_plan_bulk(uuid, uuid, text, numeric, boolean),
  public.release_budget_manual(uuid, numeric, text),
  public.get_sales_achievement(int),
  public.get_budget_brake_overview(uuid) TO authenticated, service_role;
