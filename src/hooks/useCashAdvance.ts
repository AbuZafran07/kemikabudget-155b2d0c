import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveSignatureUrl } from "@/lib/signatureUrl";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Database } from "@/integrations/supabase/types";

type CashAdvanceStatus = Database["public"]["Enums"]["cash_advance_status"];

export interface CashAdvance {
  id: string;
  ca_number: string;
  division_id: string;
  category_id: string | null;
  period_id: string | null;
  requester_id: string;
  status: CashAdvanceStatus;
  purpose: string;
  total_amount: number;
  needed_date: string;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_note: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  paid_by: string | null;
  funding_source_id: string | null;
  total_realized: number;
  settled_at: string | null;
  settled_by: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  division?: { id: string; code: string; name: string };
  category?: { id: string; code: string; name: string } | null;
  requester?: { id: string; full_name: string; email: string };
  approver?: { id: string; full_name: string };
  payer?: { id: string; full_name: string };
  funding_source?: { id: string; name: string; code: string };
}

export interface CashAdvanceItem {
  id: string;
  cash_advance_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  notes: string | null;
  category_id: string | null;
  created_at: string;
  // Joined
  category?: { id: string; code: string; name: string };
}

export interface CashAdvanceSettlement {
  id: string;
  settlement_number: string;
  cash_advance_id: string;
  status: string;
  total_realized: number;
  variance_amount: number;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_note: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CashAdvanceSettlementItem {
  id: string;
  settlement_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  receipt_number: string | null;
  receipt_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface CashAdvanceEvent {
  id: string;
  cash_advance_id: string;
  event_type: string;
  description: string;
  performed_by: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  performer?: { full_name: string };
}

export interface CreateCashAdvanceData {
  purpose: string;
  needed_date: string;
  notes?: string;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    notes?: string;
    category_id: string;
  }[];
}

interface RpcResult {
  success?: boolean;
  error?: string;
  variance?: number;
}

export const useCashAdvances = (filters?: {
  status?: string;
  division_id?: string;
  search?: string;
}) => {
  const { user, profile, role } = useAuth();

  return useQuery({
    queryKey: ["cash-advances", filters, user?.id],
    queryFn: async () => {
      let query = supabase
        .from("cash_advances")
        .select(`
          *,
          division:divisions!inner(id, code, name)
        `)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status as CashAdvanceStatus);
      }

      if (filters?.division_id) {
        query = query.eq("division_id", filters.division_id);
      }

      if (filters?.search) {
        query = query.or(`ca_number.ilike.%${filters.search}%,purpose.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CashAdvance[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
};

export const useCashAdvance = (id: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["cash-advance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advances")
        .select(`
          *,
          division:divisions!inner(id, code, name)
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Fetch requester from profiles (including signature_url)
      const { data: requester } = await supabase
        .from("profiles")
        .select("id, full_name, email, signature_url")
        .eq("id", data.requester_id)
        .maybeSingle();
      if (requester) {
        (requester as any).signature_url = await resolveSignatureUrl(requester.id, (requester as any).signature_url);
      }

      // Fetch approver if exists
      let approver = null;
      if (data.approved_by) {
        const { data: approverData } = await supabase
          .from("profiles")
          .select("id, full_name, signature_url")
          .eq("id", data.approved_by)
          .maybeSingle();
        if (approverData) {
          (approverData as any).signature_url = await resolveSignatureUrl(approverData.id, (approverData as any).signature_url);
        }
        approver = approverData;
      }

      // Fetch payer if exists
      let payer = null;
      if (data.paid_by) {
        const { data: payerData } = await supabase
          .from("profiles")
          .select("id, full_name, signature_url")
          .eq("id", data.paid_by)
          .maybeSingle();
        if (payerData) {
          (payerData as any).signature_url = await resolveSignatureUrl(payerData.id, (payerData as any).signature_url);
        }
        payer = payerData;
      }

      // Fetch funding source if exists
      let funding_source = null;
      if (data.funding_source_id) {
        const sources = await supabase.rpc("get_funding_source_options");
        funding_source = sources.data?.find((s: { id: string }) => s.id === data.funding_source_id);
      }

      return {
        ...data,
        requester,
        approver,
        payer,
        funding_source,
      } as CashAdvance;
    },
    enabled: !!user?.id && !!id,
  });
};

export const useCashAdvanceItems = (cashAdvanceId: string) => {
  return useQuery({
    queryKey: ["cash-advance-items", cashAdvanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_items")
        .select(`
          *,
          category:cost_categories(id, code, name)
        `)
        .eq("cash_advance_id", cashAdvanceId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as CashAdvanceItem[];
    },
    enabled: !!cashAdvanceId,
  });
};

export const useCashAdvanceEvents = (cashAdvanceId: string) => {
  return useQuery({
    queryKey: ["cash-advance-events", cashAdvanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_events")
        .select("*")
        .eq("cash_advance_id", cashAdvanceId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch performer names
      const performerIds = [...new Set(data.map((e) => e.performed_by))];
      const { data: performers } = await supabase
        .from("profiles_secure")
        .select("id, full_name")
        .in("id", performerIds);

      return data.map((event) => ({
        ...event,
        performer: performers?.find((p) => p.id === event.performed_by),
      })) as CashAdvanceEvent[];
    },
    enabled: !!cashAdvanceId,
  });
};

export const useCashAdvanceSettlements = (cashAdvanceId: string) => {
  return useQuery({
    queryKey: ["cash-advance-settlements", cashAdvanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_settlements")
        .select("*")
        .eq("cash_advance_id", cashAdvanceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CashAdvanceSettlement[];
    },
    enabled: !!cashAdvanceId,
  });
};

export const useCashAdvanceSettlementItems = (settlementId: string) => {
  return useQuery({
    queryKey: ["cash-advance-settlement-items", settlementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advance_settlement_items")
        .select("*")
        .eq("settlement_id", settlementId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as CashAdvanceSettlementItem[];
    },
    enabled: !!settlementId,
  });
};

export const useCreateCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateCashAdvanceData & { division_id?: string }) => {
      const divisionId = data.division_id || profile?.division_id;
      if (!user?.id || !divisionId) throw new Error("Not authenticated or no division assigned");

      const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

      // Generate CA number
      const { data: seqData } = await supabase.rpc("get_next_document_number", {
        p_template_type: "cash_advance",
        p_division_id: divisionId,
      });

      const caNumber = seqData || `CA-${Date.now()}`;

      // Create cash advance (category_id is now per-item, not on CA header)
      const { data: ca, error: caError } = await supabase
        .from("cash_advances")
        .insert({
          ca_number: caNumber,
          division_id: divisionId,
          requester_id: user.id,
          purpose: data.purpose,
          total_amount: totalAmount,
          needed_date: data.needed_date,
          notes: data.notes || null,
        })
        .select()
        .single();

      if (caError) throw caError;

      // Create items with category_id per item
      const itemsToInsert = data.items.map((item) => ({
        cash_advance_id: ca.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        notes: item.notes || null,
        category_id: item.category_id,
      }));

      const { error: itemsError } = await supabase
        .from("cash_advance_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Log event
      await supabase.from("cash_advance_events").insert({
        cash_advance_id: ca.id,
        event_type: "created",
        description: "Cash advance created",
        performed_by: user.id,
      });

      return ca;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      toast({
        title: t("cashAdvance.createSuccess"),
        description: t("cashAdvance.createSuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useSubmitCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (caId: string) => {
      const { data, error } = await supabase.rpc("submit_cash_advance", {
        p_ca_id: caId,
      });

      if (error) throw error;
      const result = data as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to submit");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      toast({
        title: t("cashAdvance.submitSuccess"),
        description: t("cashAdvance.submitSuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useApproveCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ caId, note }: { caId: string; note?: string }) => {
      const { data, error } = await supabase.rpc("approve_cash_advance", {
        p_ca_id: caId,
        p_note: note || null,
      });

      if (error) throw error;
      const result = data as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to approve");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      toast({
        title: t("cashAdvance.approveSuccess"),
        description: t("cashAdvance.approveSuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useRejectCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ caId, reason }: { caId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_cash_advance", {
        p_ca_id: caId,
        p_reason: reason,
      });

      if (error) throw error;
      const result = data as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to reject");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      toast({
        title: t("cashAdvance.rejectSuccess"),
        description: t("cashAdvance.rejectSuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const usePayCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ caId, fundingSourceId }: { caId: string; fundingSourceId: string }) => {
      const { data, error } = await supabase.rpc("pay_cash_advance", {
        p_ca_id: caId,
        p_funding_source_id: fundingSourceId,
      });

      if (error) throw error;
      const result = data as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to pay");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      queryClient.invalidateQueries({ queryKey: ["funding-sources"] });
      toast({
        title: t("cashAdvance.paySuccess"),
        description: t("cashAdvance.paySuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useCreateSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      cashAdvanceId,
      notes,
      items,
    }: {
      cashAdvanceId: string;
      notes?: string;
      items: {
        description: string;
        quantity: number;
        unit_price: number;
        amount: number;
        receipt_number?: string;
        receipt_date?: string;
        notes?: string;
      }[];
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const totalRealized = items.reduce((sum, item) => sum + item.amount, 0);

      // Get CA to generate settlement number
      const { data: ca } = await supabase
        .from("cash_advances")
        .select("ca_number, division_id")
        .eq("id", cashAdvanceId)
        .single();

      const settlementNumber = `STL-${ca?.ca_number?.replace("CA-", "") || Date.now()}`;

      // Create settlement
      const { data: settlement, error: settlementError } = await supabase
        .from("cash_advance_settlements")
        .insert({
          settlement_number: settlementNumber,
          cash_advance_id: cashAdvanceId,
          total_realized: totalRealized,
          variance_amount: 0, // Will be calculated when approved
          notes: notes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Create items
      const itemsToInsert = items.map((item) => ({
        settlement_id: settlement.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        receipt_number: item.receipt_number || null,
        receipt_date: item.receipt_date || null,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("cash_advance_settlement_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Log event
      await supabase.from("cash_advance_events").insert({
        cash_advance_id: cashAdvanceId,
        event_type: "settlement_created",
        description: `Settlement ${settlement.settlement_number} created with total ${totalRealized}`,
        performed_by: user.id,
        metadata: { settlement_id: settlement.id, total_realized: totalRealized },
      });

      return settlement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });
      toast({
        title: t("cashAdvance.settlementCreateSuccess"),
        description: t("cashAdvance.settlementCreateSuccessDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useSubmitSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("cash_advance_settlements")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", settlementId);

      if (error) throw error;

      // Get settlement for event logging
      const { data: settlement } = await supabase
        .from("cash_advance_settlements")
        .select("cash_advance_id, settlement_number")
        .eq("id", settlementId)
        .single();

      if (settlement) {
        await supabase.from("cash_advance_events").insert({
          cash_advance_id: settlement.cash_advance_id,
          event_type: "settlement_submitted",
          description: `Settlement ${settlement.settlement_number} submitted for approval`,
          performed_by: user.id,
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });
      toast({
        title: t("cashAdvance.settlementSubmitSuccess"),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useUpdateSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      settlementId,
      notes,
      items,
    }: {
      settlementId: string;
      notes?: string;
      items: {
        description: string;
        quantity: number;
        unit_price: number;
        amount: number;
        receipt_number?: string;
        receipt_date?: string;
        notes?: string;
      }[];
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const totalRealized = items.reduce((sum, item) => sum + item.amount, 0);

      // Update settlement header (only drafts allowed by RLS)
      const { error: updErr } = await supabase
        .from("cash_advance_settlements")
        .update({
          total_realized: totalRealized,
          notes: notes || null,
        })
        .eq("id", settlementId);

      if (updErr) throw updErr;

      // Replace items: delete existing then insert new
      const { error: delErr } = await supabase
        .from("cash_advance_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);
      if (delErr) throw delErr;

      const itemsToInsert = items.map((item) => ({
        settlement_id: settlementId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        receipt_number: item.receipt_number || null,
        receipt_date: item.receipt_date || null,
        notes: item.notes || null,
      }));

      const { error: insErr } = await supabase
        .from("cash_advance_settlement_items")
        .insert(itemsToInsert);
      if (insErr) throw insErr;

      return { success: true, id: settlementId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlement-items"] });
      queryClient.invalidateQueries({ queryKey: ["all-settlement-items"] });
      toast({ title: t("cashAdvance.settlementUpdateSuccess") || "Realisasi diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });
};

export const useDeleteSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      // Get info for event logging before delete
      const { data: settlement } = await supabase
        .from("cash_advance_settlements")
        .select("cash_advance_id, settlement_number")
        .eq("id", settlementId)
        .maybeSingle();

      // Delete items first (in case FK ON DELETE is not cascade)
      await supabase
        .from("cash_advance_settlement_items")
        .delete()
        .eq("settlement_id", settlementId);

      const { error } = await supabase
        .from("cash_advance_settlements")
        .delete()
        .eq("id", settlementId);
      if (error) throw error;

      if (settlement) {
        await supabase.from("cash_advance_events").insert({
          cash_advance_id: settlement.cash_advance_id,
          event_type: "settlement_deleted",
          description: `Settlement ${settlement.settlement_number} deleted (draft)`,
          performed_by: user.id,
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });
      queryClient.invalidateQueries({ queryKey: ["all-settlement-items"] });
      toast({ title: t("cashAdvance.settlementDeleteSuccess") || "Realisasi dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });
};

export const useUnlockSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ settlementId, reason }: { settlementId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("unlock_settlement", {
        p_settlement_id: settlementId,
        p_reason: reason,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || "Gagal membuka kunci realisasi");

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });
      queryClient.invalidateQueries({ queryKey: ["all-settlement-items"] });
      toast({
        title: "Realisasi dibuka untuk revisi",
        description: "Status realisasi kembali menjadi Diajukan dan dapat diedit.",
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });
};

export const useApproveSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ settlementId, note }: { settlementId: string; note?: string }) => {
      const { data, error } = await supabase.rpc("approve_settlement", {
        p_settlement_id: settlementId,
        p_note: note || null,
      });

      if (error) throw error;
      const result = data as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to approve settlement");
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });
      queryClient.invalidateQueries({ queryKey: ["division-budgets"] });

      const variance = data?.variance || 0;
      let description = t("cashAdvance.settlementApproveSuccessDesc");
      if (variance > 0) {
        description += ` ${t("cashAdvance.refundRequired")}: ${new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(variance)}`;
      } else if (variance < 0) {
        description += ` ${t("cashAdvance.topUpRequired")}: ${new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(Math.abs(variance))}`;
      }

      toast({
        title: t("cashAdvance.settlementApproveSuccess"),
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useRejectSettlement = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ settlementId, reason }: { settlementId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_settlement" as any, {
        p_settlement_id: settlementId,
        p_reason: reason,
      });

      if (error) throw error;
      const result = data as unknown as RpcResult;
      if (!result?.success) throw new Error(result?.error || "Failed to reject settlement");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events"] });

      toast({
        title: t("cashAdvance.settlementRejectSuccess") || "Realisasi ditolak",
        description: t("cashAdvance.settlementRejectSuccessDesc") || "Realisasi berhasil ditolak. Pemohon dapat mengajukan ulang.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};

export const useBudgetLedger = (divisionBudgetId?: string) => {
  return useQuery({
    queryKey: ["budget-ledger", divisionBudgetId],
    queryFn: async () => {
      let query = supabase
        .from("budget_ledger")
        .select("*")
        .order("created_at", { ascending: false });

      if (divisionBudgetId) {
        query = query.eq("division_budget_id", divisionBudgetId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!divisionBudgetId,
  });
};

// Calculate commitment and actual from budget ledger
export const useBudgetCommitment = (divisionBudgetId: string) => {
  return useQuery({
    queryKey: ["budget-commitment", divisionBudgetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_ledger")
        .select("entry_type, amount")
        .eq("division_budget_id", divisionBudgetId);

      if (error) throw error;

      let commitment = 0;
      let actual = 0;

      data?.forEach((entry) => {
        switch (entry.entry_type) {
          case "commitment_add":
            commitment += Number(entry.amount);
            break;
          case "commitment_release":
            commitment -= Number(entry.amount);
            break;
          case "actual_add":
            actual += Number(entry.amount);
            break;
          case "actual_release":
            actual -= Number(entry.amount);
            break;
        }
      });

      return { commitment, actual };
    },
    enabled: !!divisionBudgetId,
  });
};

// Delete Cash Advance (Super Admin only)
export const useDeleteCashAdvance = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (caId: string) => {
      const { data, error } = await supabase.rpc("delete_cash_advance", {
        p_ca_id: caId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || "Failed to delete cash advance");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["budget-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["funding-sources"] });
      toast({ title: "Cash Advance berhasil dihapus" });
    },
    onError: (error: any) => {
      toast({
        title: "Gagal menghapus Cash Advance",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useUpdateCashAdvance = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (
      params: { caId: string } & CreateCashAdvanceData & { division_id?: string }
    ) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { caId, items, purpose, needed_date, notes, division_id } = params;

      // Ensure CA exists and is still draft
      const { data: existing, error: exErr } = await supabase
        .from("cash_advances")
        .select("id, status, requester_id")
        .eq("id", caId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) throw new Error("Cash advance not found");
      if (existing.status !== "draft") {
        throw new Error("Only draft cash advances can be edited");
      }

      const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);

      const updatePayload: Record<string, unknown> = {
        purpose,
        needed_date,
        notes: notes || null,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      };
      if (division_id) updatePayload.division_id = division_id;

      const { error: updErr } = await supabase
        .from("cash_advances")
        .update(updatePayload)
        .eq("id", caId);
      if (updErr) throw updErr;

      // Replace items
      const { error: delErr } = await supabase
        .from("cash_advance_items")
        .delete()
        .eq("cash_advance_id", caId);
      if (delErr) throw delErr;

      const itemsToInsert = items.map((item) => ({
        cash_advance_id: caId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        notes: item.notes || null,
        category_id: item.category_id,
      }));

      const { error: insErr } = await supabase
        .from("cash_advance_items")
        .insert(itemsToInsert);
      if (insErr) throw insErr;

      await supabase.from("cash_advance_events").insert({
        cash_advance_id: caId,
        event_type: "updated",
        description: "Cash advance draft updated",
        performed_by: user.id,
      });

      return { id: caId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cash-advances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance", data.id] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-items", data.id] });
      queryClient.invalidateQueries({ queryKey: ["cash-advance-events", data.id] });
      toast({ title: t("cashAdvance.updateSuccess") || "Cash advance diperbarui" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: error.message,
      });
    },
  });
};
