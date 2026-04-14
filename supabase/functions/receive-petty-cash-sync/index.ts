import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SyncTransaction {
  id: string;
  date: string;
  accountNo: string;
  accountName: string;
  remarks: string;
  credit: number;
  debit: number;
  pic: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate sync secret - shared secret between the two apps
    const syncSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("PETTY_CASH_SYNC_SECRET");

    if (!expectedSecret) {
      return new Response(JSON.stringify({ error: "Sync not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!syncSecret || syncSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid sync secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { transactions, user_email } = await req.json() as {
      transactions: SyncTransaction[];
      user_email: string;
    };

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return new Response(JSON.stringify({ error: "No transactions provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_email || typeof user_email !== "string") {
      return new Response(JSON.stringify({ error: "user_email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client for this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find user profile by email
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, division_id")
      .eq("email", user_email)
      .eq("is_active", true)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({
        error: `User dengan email ${user_email} tidak ditemukan di Budget Expense.`
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find HRGA division
    const { data: hrgaDivision } = await adminClient
      .from("divisions")
      .select("id, code")
      .eq("code", "HRGA")
      .eq("is_active", true)
      .single();

    const targetDivisionId = hrgaDivision?.id || profile.division_id;

    if (!targetDivisionId) {
      return new Response(JSON.stringify({ error: "Tidak ada divisi target" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find a suitable cost category
    const { data: categories } = await adminClient
      .from("cost_categories")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name");

    if (!categories || categories.length === 0) {
      return new Response(JSON.stringify({ error: "Tidak ada kategori biaya" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to find a relevant category
    const category = categories.find(c =>
      c.code === "MISC" ||
      c.name.toLowerCase().includes("operasional") ||
      c.name.toLowerCase().includes("kas kecil") ||
      c.name.toLowerCase().includes("lain")
    ) || categories[0];

    // Find active budget period
    const { data: activePeriod } = await adminClient
      .from("budget_periods")
      .select("id")
      .eq("is_active", true)
      .eq("is_closed", false)
      .limit(1)
      .single();

    // Process each transaction
    const results: { transactionId: string; requestId: string; requestNumber: string }[] = [];
    const errors: { transactionId: string; error: string }[] = [];

    for (const tx of transactions) {
      try {
        // Validate transaction
        const amount = tx.credit > 0 ? tx.credit : tx.debit;
        if (!amount || amount <= 0) {
          errors.push({ transactionId: tx.id, error: "Amount must be > 0" });
          continue;
        }

        const neededDate = new Date(tx.date).toISOString().split("T")[0];

        // Generate request number using DB function
        const { data: reqNumber, error: seqError } = await adminClient.rpc(
          "get_next_document_number",
          {
            p_template_type: "request",
            p_division_id: targetDivisionId,
          }
        );

        if (seqError || !reqNumber) {
          // Fallback: generate a simple number
          const ts = Date.now().toString().slice(-8);
          const fallbackNumber = `PC-SYNC/${ts}/${tx.id.slice(0, 4)}`;
          console.error("Seq error, using fallback:", seqError);

          const { data: newRequest, error: insertError } = await adminClient
            .from("requests")
            .insert({
              requester_id: profile.id,
              division_id: targetDivisionId,
              category_id: category.id,
              description: `[Petty Cash Sync] ${tx.accountName} - ${tx.remarks}`,
              amount: amount,
              needed_date: neededDate,
              status: "draft",
              request_number: fallbackNumber,
              notes: `Sync dari Petty Cash Manager | PIC: ${tx.pic} | Akun: ${tx.accountNo} - ${tx.accountName}`,
              vendor: tx.pic || null,
              period_id: activePeriod?.id || null,
            })
            .select("id, request_number")
            .single();

          if (insertError) {
            errors.push({ transactionId: tx.id, error: insertError.message });
            continue;
          }

          results.push({
            transactionId: tx.id,
            requestId: newRequest!.id,
            requestNumber: newRequest!.request_number,
          });
          continue;
        }

        // Insert draft request
        const { data: newRequest, error: insertError } = await adminClient
          .from("requests")
          .insert({
            requester_id: profile.id,
            division_id: targetDivisionId,
            category_id: category.id,
            description: `[Petty Cash Sync] ${tx.accountName} - ${tx.remarks}`,
            amount: amount,
            needed_date: neededDate,
            status: "draft",
            request_number: reqNumber,
            notes: `Sync dari Petty Cash Manager | PIC: ${tx.pic} | Akun: ${tx.accountNo} - ${tx.accountName}`,
            vendor: tx.pic || null,
            period_id: activePeriod?.id || null,
          })
          .select("id, request_number")
          .single();

        if (insertError) {
          errors.push({ transactionId: tx.id, error: insertError.message });
          continue;
        }

        results.push({
          transactionId: tx.id,
          requestId: newRequest!.id,
          requestNumber: newRequest!.request_number,
        });

      } catch (txError: unknown) {
        const msg = txError instanceof Error ? txError.message : "Unknown error";
        errors.push({ transactionId: tx.id, error: msg });
      }
    }

    // Log to audit
    if (results.length > 0) {
      await adminClient.from("audit_logs").insert({
        user_id: profile.id,
        event_type: "petty_cash_sync",
        entity_type: "request",
        description: `Sync ${results.length} transaksi dari Petty Cash Manager (${errors.length} gagal)`,
        metadata: { synced_ids: results.map(r => r.requestId), source: "petty_cash_manager" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      synced: results.length,
      failed: errors.length,
      results,
      errors,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
