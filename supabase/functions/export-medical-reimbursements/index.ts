import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://kemikaattendance.lovable.app",
  "https://kemikaattendance.web.id",
];

function getCors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const BodySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be ISO date YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be ISO date YYYY-MM-DD"),
  employees: z
    .array(
      z.object({
        email: z.string().email(),
        full_name: z.string().min(1).max(255),
      })
    )
    .min(1)
    .max(500),
});

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  const cors = getCors(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // API key auth
    const apiKey = req.headers.get("x-api-key");
    const expected = Deno.env.get("HRIS_INTEGRATION_SECRET");
    if (!expected || !apiKey || apiKey !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.flatten() }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    const { start_date, end_date, employees } = parsed.data;

    if (start_date > end_date) {
      return new Response(JSON.stringify({ error: "start_date must be <= end_date" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const startISO = `${start_date}T00:00:00Z`;
    const endISO = `${end_date}T23:59:59.999Z`;

    // Fetch claims joined with profiles
    const { data: claims, error } = await supabase
      .from("medical_claims")
      .select(
        `id, claim_number, claim_amount, approved_amount, status, submitted_at, approved_at,
         employee:profiles!medical_claims_employee_id_fkey ( id, email, full_name )`
      )
      .in("status", ["approved", "paid", "review_finance"]);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: "Database query failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Filter by effective date (approved_at fallback submitted_at) within range
    const inRange = (claims ?? []).filter((c: any) => {
      const eff = c.approved_at ?? c.submitted_at;
      if (!eff) return false;
      return eff >= startISO && eff <= endISO;
    });

    // Build lookup maps
    const byEmail = new Map<string, any[]>();
    const byName = new Map<string, any[]>();
    for (const c of inRange) {
      const emp = c.employee;
      if (!emp) continue;
      const e = norm(emp.email);
      const n = norm(emp.full_name);
      if (e) {
        if (!byEmail.has(e)) byEmail.set(e, []);
        byEmail.get(e)!.push(c);
      }
      if (n) {
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n)!.push(c);
      }
    }

    const results = employees.map((emp) => {
      const e = norm(emp.email);
      const n = norm(emp.full_name);
      let matched: any[] = [];
      let matched_by: "email" | "full_name" | "none" = "none";

      if (e && byEmail.has(e)) {
        matched = byEmail.get(e)!;
        matched_by = "email";
      } else if (n && byName.has(n)) {
        matched = byName.get(n)!;
        matched_by = "full_name";
      }

      const claimList = matched.map((c: any) => {
        const amt = Number(c.approved_amount ?? c.claim_amount ?? 0);
        return {
          claim_number: c.claim_number,
          amount: amt,
          status: c.status,
          approved_at: c.approved_at,
          submitted_at: c.submitted_at,
        };
      });
      const total_amount = claimList.reduce((s, c) => s + (c.amount || 0), 0);

      return {
        email: emp.email,
        full_name: emp.full_name,
        matched_by,
        total_amount,
        claim_count: claimList.length,
        claims: claimList,
      };
    });

    return new Response(
      JSON.stringify({
        period: { start: start_date, end: end_date },
        results,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
