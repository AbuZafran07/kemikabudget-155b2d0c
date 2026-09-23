import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-kemi-secret, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "X-Robots-Tag": "noindex, nofollow" },
  });

/** Constant-time comparison to avoid leaking the secret via response timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare fixed-length digests so unequal lengths don't short-circuit.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("KEMI_EXPORT_SECRET") ?? "";
  const provided = req.headers.get("x-kemi-secret") ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const [
      divisions,
      categories,
      periods,
      budgets,
      requests,
      cashAdvances,
      settlements,
      medical,
    ] = await Promise.all([
      supabase.from("divisions").select("id, code, name, is_active"),
      supabase.from("cost_categories").select("id, code, name, is_active"),
      supabase.from("budget_periods").select("id, year, name, start_date, end_date, is_active, is_closed"),
      supabase
        .from("division_budgets")
        .select("id, division_id, category_id, period_id, allocated_amount, used_amount"),
      supabase
        .from("requests")
        .select(
          "id, request_number, division_id, category_id, period_id, description, vendor, amount, approved_amount, needed_date, status, payment_method, submitted_at, approved_at, paid_at, settled_at, created_at",
        ),
      supabase
        .from("cash_advances")
        .select(
          "id, ca_number, division_id, category_id, period_id, purpose, total_amount, total_realized, needed_date, status, submitted_at, approved_at, paid_at, settled_at, created_at",
        ),
      supabase
        .from("cash_advance_settlements")
        .select(
          "id, settlement_number, cash_advance_id, status, total_realized, variance_amount, submitted_at, approved_at, created_at",
        ),
      // Medical: aggregate only — no patient, diagnosis, employee identity or clinic details.
      supabase
        .from("medical_claims")
        .select("claim_amount, approved_amount, status, claim_date, approved_at, paid_at"),
    ]);

    const errors = [divisions, categories, periods, budgets, requests, cashAdvances, settlements, medical]
      .map((r) => r.error?.message)
      .filter(Boolean);
    if (errors.length) {
      console.error("kemi-export query errors", errors);
      return json({ error: "Failed to load export data" }, 500);
    }

    // Medical summary grouped by year-month of claim_date, no personal fields.
    const medicalSummary: Record<string, { period: string; claim_count: number; total_claimed: number; total_approved: number }> = {};
    for (const c of medical.data ?? []) {
      const period = String(c.claim_date ?? "").slice(0, 7) || "unknown";
      const row = (medicalSummary[period] ??= {
        period,
        claim_count: 0,
        total_claimed: 0,
        total_approved: 0,
      });
      row.claim_count += 1;
      row.total_claimed += Number(c.claim_amount ?? 0);
      row.total_approved += Number(c.approved_amount ?? 0);
    }

    return json({
      generated_at: new Date().toISOString(),
      source: "kemika-expense-budget",
      divisions: divisions.data ?? [],
      cost_categories: categories.data ?? [],
      budget_periods: periods.data ?? [],
      division_budgets: (budgets.data ?? []).map((b) => ({
        ...b,
        remaining_amount: Number(b.allocated_amount ?? 0) - Number(b.used_amount ?? 0),
      })),
      requests: requests.data ?? [],
      cash_advances: cashAdvances.data ?? [],
      cash_advance_settlements: settlements.data ?? [],
      medical_summary: Object.values(medicalSummary).sort((a, b) => a.period.localeCompare(b.period)),
    });
  } catch (e) {
    console.error("kemi-export error", e);
    return json({ error: "Internal server error" }, 500);
  }
});
