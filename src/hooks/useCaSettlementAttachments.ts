import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CaSettlementAttachment {
  id: string;
  settlement_id: string;
  cash_advance_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  attachment_type: string;
  uploaded_by: string;
  created_at: string;
}

export const caSettlementAttachmentsKey = (settlementId: string) => ["ca-settlement-attachments", settlementId];

/** Lampiran bukti untuk satu realisasi CA. */
export const useCaSettlementAttachments = (settlementId: string | null | undefined) => {
  return useQuery({
    queryKey: caSettlementAttachmentsKey(settlementId || ""),
    queryFn: async (): Promise<CaSettlementAttachment[]> => {
      const { data, error } = await supabase
        .from("cash_advance_settlement_attachments")
        .select("*")
        .eq("settlement_id", settlementId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as CaSettlementAttachment[];
    },
    enabled: !!settlementId,
  });
};
