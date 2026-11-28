// Sinkron data penjualan (target vs realisasi invoice) dari aplikasi Finance Yield
// ke tabel sales_performance (dipakai Rem Budget).
//
// Secrets yang dibutuhkan (Lovable Cloud -> Secrets):
//   FINANCE_YIELD_EXPORT_URL  : URL edge function export-revenue di proyek Finance Yield
//   FINANCE_YIELD_SYNC_TOKEN  : token rahasia yang sama dengan FINANCE_YIELD_EXPORT_TOKEN di Finance Yield
//
// Body: { "year": 2027 }  — hanya Super Admin / Finance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

export function parseMonth(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12) return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 12 ? n : null;
  }
  const iso = s.match(/^\d{4}-(\d{2})/);
  if (iso) {
    const n = Number(iso[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTHS[s] ?? MONTHS[s.slice(0, 3)] ?? null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Row = Record<string, unknown>;

export function aggregateRevenue(rows: Row[], year: number) {
  const byMonth = new Map<number, { target: number; actual: number }>();
  // Baris kategori "all" (total) diabaikan bila bulan itu sudah punya baris per segmen, agar tidak terhitung dua kali.
  const segmentMonths = new Set<number>();
  for (const r of rows) {
    const m = parseMonth(r.month);
    if (m && String(r.category ?? "").toLowerCase() !== "all") segmentMonths.add(m);
  }
  for (const r of rows) {
    if (r.year !== undefined && r.year !== null && Number(r.year) !== year) continue;
    const m = parseMonth(r.month);
    if (!m) continue;
    if (String(r.category ?? "").toLowerCase() === "all" && segmentMonths.has(m)) continue;
    const cur = byMonth.get(m) ?? { target: 0, actual: 0 };
    cur.target += num(r.target);
    cur.actual += num(r.realisasi_invoice ?? r.actual_invoice ?? r.invoice);
    byMonth.set(m, cur);
  }
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, v]) => ({
    month,
    target_amount: Math.round(v.target),
    actual_invoice_amount: Math.round(v.actual),
  }));
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get("origin"));
  // Izinkan semua header yang diminta browser saat preflight (supabase-js versi baru mengirim header tambahan)
  const requestedHeaders = req.headers.get("access-control-request-headers");
  if (requestedHeaders) cors["Access-Control-Allow-Headers"] = requestedHeaders;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Authorization header required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ success: false, error: "Sesi tidak valid" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = (roles ?? []).some((r: { role: string }) => r.role === "super_admin" || r.role === "finance");
    if (!allowed) return json({ success: false, error: "Hanya Super Admin atau Finance yang dapat sinkron data penjualan" }, 403);

    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ success: false, error: "Tahun tidak valid" }, 400);

    const exportUrl = Deno.env.get("FINANCE_YIELD_EXPORT_URL");
    const token = Deno.env.get("FINANCE_YIELD_SYNC_TOKEN");
    if (!exportUrl || !token) {
      return json({ success: false, error: "Sinkron Finance Yield belum dikonfigurasi (secret FINANCE_YIELD_EXPORT_URL / FINANCE_YIELD_SYNC_TOKEN). Data penjualan masih bisa diisi manual." }, 400);
    }

    const url = new URL(exportUrl);
    url.searchParams.set("year", String(year));
    const resp = await fetch(url.toString(), { headers: { "x-export-token": token } });
    const text = await resp.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!resp.ok || !payload) {
      const status = `Gagal (${resp.status})`;
      await admin.from("budget_release_settings").update({ last_sync_at: new Date().toISOString(), last_sync_status: status, last_sync_by: user.id }).eq("id", true);
      return json({ success: false, error: `Finance Yield menolak permintaan (${resp.status}). Periksa URL & token.` }, 502);
    }
    const rows: Row[] = Array.isArray(payload) ? payload as Row[] : ((payload as { rows?: Row[]; data?: Row[] }).rows ?? (payload as { data?: Row[] }).data ?? []);
    const months = aggregateRevenue(rows, year);
    if (months.length === 0) {
      return json({ success: false, error: `Tidak ada data revenue tahun ${year} di Finance Yield` }, 404);
    }

    const now = new Date().toISOString();
    const { error: upErr } = await admin.from("sales_performance").upsert(
      months.map((m) => ({ year, ...m, source: "finance_yield", synced_at: now, updated_by: user.id })),
      { onConflict: "year,month" },
    );
    if (upErr) return json({ success: false, error: upErr.message }, 500);

    await admin.from("budget_release_settings").update({
      last_sync_at: now, last_sync_status: `OK — ${months.length} bulan (${year})`, last_sync_by: user.id,
    }).eq("id", true);

    return json({ success: true, year, months: months.length, data: months });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
