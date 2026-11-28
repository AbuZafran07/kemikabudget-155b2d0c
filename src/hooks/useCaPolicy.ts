import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_CA_POLICY, type CaPolicySettings } from "@/lib/ca-policy";

export interface CaPolicySettingsRow extends CaPolicySettings {
  updated_at: string | null;
  updated_by: string | null;
}

/** Pengaturan kebijakan CA (satu baris). Jatuh ke nilai default bila belum dapat dimuat. */
export const useCaPolicySettings = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ca-policy-settings"],
    queryFn: async (): Promise<CaPolicySettingsRow> => {
      const { data, error } = await supabase
        .from("ca_policy_settings")
        .select("min_lead_days, settlement_due_days, enforce_lead_time, block_on_overdue_settlement, require_settlement_attachment, require_entertainment_nominative, company_legal_name, company_npwp, updated_at, updated_by")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data ?? { ...DEFAULT_CA_POLICY, updated_at: null, updated_by: null };
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
};

export const useUpdateCaPolicySettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: CaPolicySettings) => {
      const { data, error } = await supabase
        .from("ca_policy_settings")
        .update(values)
        .eq("id", true)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Hanya Super Admin yang dapat mengubah kebijakan Cash Advance.");
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ca-policy-settings"] });
      queryClient.invalidateQueries({ queryKey: ["my-overdue-ca-settlements"] });
      toast({ title: "Kebijakan Cash Advance disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: error.message });
    },
  });
};

/** CA milik user login yang laporan realisasinya sudah lewat jatuh tempo. */
export const useMyOverdueCaSettlements = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-overdue-ca-settlements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_overdue_ca_settlements");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
  });
};
