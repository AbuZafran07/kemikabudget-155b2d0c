import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_TIERS, parseTiers, type ReleaseMode, type ReleaseTier } from "@/lib/budget-brake";

type RpcResult = { success?: boolean; error?: string; message?: string; [k: string]: unknown };

function unwrap(data: unknown, fallbackError: string): RpcResult {
  const r = (data ?? {}) as RpcResult;
  if (r.success === false) throw new Error(r.error || fallbackError);
  return r;
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["budget-brake-overview"] });
  qc.invalidateQueries({ queryKey: ["budget-release-events"] });
  qc.invalidateQueries({ queryKey: ["sales-achievement"] });
  qc.invalidateQueries({ queryKey: ["sales-performance"] });
  qc.invalidateQueries({ queryKey: ["budget-release-settings"] });
  qc.invalidateQueries({ queryKey: ["ca-budget-options"] });
  qc.invalidateQueries({ queryKey: ["request-budget-availability"] });
};

export interface BudgetReleaseSettings {
  tiers: ReleaseTier[];
  auto_release_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  updated_at: string | null;
}

export const useBudgetReleaseSettings = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["budget-release-settings"],
    queryFn: async (): Promise<BudgetReleaseSettings> => {
      const { data, error } = await supabase
        .from("budget_release_settings")
        .select("tiers, auto_release_enabled, last_sync_at, last_sync_status, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { tiers: [...DEFAULT_TIERS], auto_release_enabled: true, last_sync_at: null, last_sync_status: null, updated_at: null };
      return { ...data, tiers: parseTiers(data.tiers) };
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
};

export const useUpdateBudgetReleaseSettings = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { tiers: ReleaseTier[]; auto_release_enabled: boolean }) => {
      const { data, error } = await supabase
        .from("budget_release_settings")
        .update({ tiers: values.tiers as unknown as never, auto_release_enabled: values.auto_release_enabled })
        .eq("id", true)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Hanya Super Admin yang dapat mengubah pengaturan Rem Budget.");
      return true;
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast({ title: "Pengaturan Rem Budget disimpan" });
    },
    onError: (e: Error) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });
};

export interface SalesAchievement {
  year: number;
  months_counted: number;
  last_month: number | null;
  target_amount: number;
  actual_amount: number;
  achievement_pct: number | null;
  tier_release_pct: number;
}

export const useSalesAchievement = (year: number | undefined) => {
  return useQuery({
    queryKey: ["sales-achievement", year],
    queryFn: async (): Promise<SalesAchievement | null> => {
      const { data, error } = await supabase.rpc("get_sales_achievement", { p_year: year as number });
      if (error) throw error;
      return (data?.[0] as SalesAchievement | undefined) ?? null;
    },
    enabled: !!year,
  });
};

export interface SalesPerformanceRow {
  id?: string;
  year: number;
  month: number;
  target_amount: number;
  actual_invoice_amount: number;
  source: string;
  synced_at: string | null;
  updated_at?: string;
}

export const useSalesPerformance = (year: number | undefined) => {
  return useQuery({
    queryKey: ["sales-performance", year],
    queryFn: async (): Promise<SalesPerformanceRow[]> => {
      const { data, error } = await supabase
        .from("sales_performance")
        .select("id, year, month, target_amount, actual_invoice_amount, source, synced_at, updated_at")
        .eq("year", year as number)
        .order("month");
      if (error) throw error;
      return (data ?? []) as SalesPerformanceRow[];
    },
    enabled: !!year,
  });
};

export const useSaveSalesPerformance = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rows: { year: number; month: number; target_amount: number; actual_invoice_amount: number }[]) => {
      const { error } = await supabase
        .from("sales_performance")
        .upsert(rows.map((r) => ({ ...r, source: "manual" })), { onConflict: "year,month" });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast({ title: "Data penjualan disimpan" });
    },
    onError: (e: Error) => toast({ title: "Gagal menyimpan data penjualan", description: e.message, variant: "destructive" }),
  });
};

export const useSyncSalesPerformance = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (year: number) => {
      const { data, error } = await supabase.functions.invoke("sync-sales-performance", { body: { year } });
      if (error) {
        // pesan dari edge function (status non-2xx) ada di context response
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {
          /* abaikan */
        }
        throw new Error(msg);
      }
      return unwrap(data, "Sinkron gagal");
    },
    onSuccess: (r) => {
      invalidateAll(qc);
      toast({ title: "Sinkron Finance Yield berhasil", description: `${r.months ?? 0} bulan diperbarui` });
    },
    onError: (e: Error) => {
      invalidateAll(qc);
      toast({ title: "Sinkron Finance Yield gagal", description: e.message, variant: "destructive" });
    },
  });
};

export interface BudgetBrakeLine {
  budget_id: string;
  division_id: string;
  division_code: string;
  division_name: string;
  category_id: string;
  category_code: string;
  category_name: string;
  release_mode: ReleaseMode;
  allocated: number;
  initial_release: number;
  released: number;
  used: number;
  reserved: number;
  available: number;
  held: number;
  auto_target: number | null;
}

export const useBudgetBrakeOverview = (periodId: string | undefined) => {
  return useQuery({
    queryKey: ["budget-brake-overview", periodId],
    queryFn: async (): Promise<BudgetBrakeLine[]> => {
      const { data, error } = await supabase.rpc("get_budget_brake_overview", { p_period_id: periodId as string });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        release_mode: (r.release_mode as ReleaseMode) ?? "none",
        allocated: Number(r.allocated) || 0,
        initial_release: Number(r.initial_release) || 0,
        released: Number(r.released) || 0,
        used: Number(r.used) || 0,
        reserved: Number(r.reserved) || 0,
        available: Number(r.available) || 0,
        held: Number(r.held) || 0,
        auto_target: r.auto_target === null ? null : Number(r.auto_target),
      }));
    },
    enabled: !!periodId,
  });
};

export interface BudgetReleaseEvent {
  id: string;
  division_budget_id: string;
  event_type: string;
  release_mode: string | null;
  released_before: number;
  released_after: number;
  allocated_amount: number | null;
  achievement_pct: number | null;
  tier_release_pct: number | null;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
  performer_name?: string | null;
}

export const useBudgetReleaseEvents = (budgetIds: string[] | undefined, limit = 100) => {
  return useQuery({
    queryKey: ["budget-release-events", budgetIds?.length ?? 0, limit, budgetIds?.[0] ?? ""],
    queryFn: async (): Promise<BudgetReleaseEvent[]> => {
      if (!budgetIds || budgetIds.length === 0) return [];
      const { data, error } = await supabase
        .from("budget_release_events")
        .select("*")
        .in("division_budget_id", budgetIds.slice(0, 500))
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const events = (data ?? []) as BudgetReleaseEvent[];
      const ids = [...new Set(events.map((e) => e.performed_by).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
        events.forEach((e) => { e.performer_name = e.performed_by ? map.get(e.performed_by) ?? null : null; });
      }
      return events;
    },
    enabled: !!budgetIds,
  });
};

export const useSetBudgetReleasePlan = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { budgetId: string; mode: ReleaseMode; initial: number; note?: string }) => {
      const { data, error } = await supabase.rpc("set_budget_release_plan", {
        p_budget_id: v.budgetId, p_mode: v.mode, p_initial: v.initial, p_note: v.note ?? undefined,
      });
      if (error) throw error;
      return unwrap(data, "Gagal menyimpan rencana");
    },
    onSuccess: (r) => {
      invalidateAll(qc);
      toast({ title: "Rencana Rem Budget disimpan", description: (r.message as string) || undefined });
    },
    onError: (e: Error) => toast({ title: "Gagal menyimpan rencana", description: e.message, variant: "destructive" }),
  });
};

export const useSetBudgetReleasePlanBulk = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { periodId: string; divisionId: string | null; mode: ReleaseMode; initialPct: number; onlyUnset: boolean }) => {
      const { data, error } = await supabase.rpc("set_budget_release_plan_bulk", {
        p_period_id: v.periodId, p_division_id: v.divisionId, p_mode: v.mode, p_initial_pct: v.initialPct, p_only_unset: v.onlyUnset,
      });
      if (error) throw error;
      return unwrap(data, "Gagal mengatur massal");
    },
    onSuccess: (r) => {
      invalidateAll(qc);
      toast({
        title: `${r.count ?? 0} pos diatur`,
        description: Number(r.raised) > 0 ? `${r.raised} pos budget awalnya dinaikkan karena sudah terpakai/dipesan lebih besar` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Gagal mengatur massal", description: e.message, variant: "destructive" }),
  });
};

export const useReleaseBudgetManual = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { budgetId: string; amount: number; reason: string }) => {
      const { data, error } = await supabase.rpc("release_budget_manual", {
        p_budget_id: v.budgetId, p_amount: v.amount, p_reason: v.reason,
      });
      if (error) throw error;
      return unwrap(data, "Gagal membuka dana");
    },
    onSuccess: () => {
      invalidateAll(qc);
      toast({ title: "Dana berhasil dibuka" });
    },
    onError: (e: Error) => toast({ title: "Gagal membuka dana", description: e.message, variant: "destructive" }),
  });
};
