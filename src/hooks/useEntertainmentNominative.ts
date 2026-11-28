import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  NominativeEntryInput,
  NominativeEntryRow,
  NominativeHeaderRow,
  NominativeSource,
  NominativeStatus,
} from "@/lib/entertainment-nominative";
import { ENTERTAINMENT_NOMINATIVE_BUCKET } from "@/lib/entertainment-nominative";

const sourceKey = (source: NominativeSource) => (source.settlementId ? `s:${source.settlementId}` : `r:${source.requestId}`);
export const nominativeKeys = {
  data: (source: NominativeSource) => ["entertainment-nominative", sourceKey(source)],
  status: (source: NominativeSource) => ["entertainment-nominative-status", sourceKey(source)],
};

/** Id kategori biaya yang mewajibkan Daftar Nominatif (default: Entertainment). */
export const useNominativeCategoryIds = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["nominative-category-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_categories").select("id").eq("requires_nominative", true);
      if (error) throw error;
      return new Set((data || []).map((c) => c.id));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
};

export interface NominativeData {
  header: NominativeHeaderRow | null;
  entries: NominativeEntryRow[];
}

export const useEntertainmentNominative = (source: NominativeSource | null) => {
  return useQuery({
    queryKey: source ? nominativeKeys.data(source) : ["entertainment-nominative", "none"],
    queryFn: async (): Promise<NominativeData> => {
      let query = supabase.from("entertainment_nominatives").select("*");
      query = source!.settlementId ? query.eq("settlement_id", source!.settlementId) : query.eq("request_id", source!.requestId!);
      const { data: header, error } = await query.maybeSingle();
      if (error) throw error;
      if (!header) return { header: null, entries: [] };
      const { data: entries, error: entriesError } = await supabase
        .from("entertainment_nominative_entries")
        .select("*")
        .eq("nominative_id", header.id)
        .order("line_no", { ascending: true });
      if (entriesError) throw entriesError;
      return { header: header as NominativeHeaderRow, entries: (entries || []) as NominativeEntryRow[] };
    },
    enabled: !!source && !!(source.settlementId || source.requestId),
  });
};

/** Status kelengkapan dihitung di database (sama dengan aturan penjaga). */
export const useNominativeStatus = (source: NominativeSource | null) => {
  return useQuery({
    queryKey: source ? nominativeKeys.status(source) : ["entertainment-nominative-status", "none"],
    queryFn: async (): Promise<NominativeStatus | null> => {
      const { data, error } = await supabase.rpc("entertainment_nominative_status", {
        p_settlement_id: source!.settlementId ?? undefined,
        p_request_id: source!.requestId ?? undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return row
        ? { ...row, required_amount: Number(row.required_amount), entries_total: Number(row.entries_total) }
        : null;
    },
    enabled: !!source && !!(source.settlementId || source.requestId),
  });
};

export interface SaveNominativeParams {
  source: NominativeSource;
  headerId: string | null;
  signerName: string;
  signerCity: string;
  signedDate: string;
  entries: NominativeEntryInput[];
}

export const useSaveNominative = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: SaveNominativeParams) => {
      if (!user?.id) throw new Error("Not authenticated");
      let headerId = params.headerId;
      if (!headerId) {
        const { data, error } = await supabase
          .from("entertainment_nominatives")
          .insert({
            settlement_id: params.source.settlementId ?? null,
            request_id: params.source.requestId ?? null,
            signer_name: params.signerName.trim(),
            signer_city: params.signerCity.trim() || "Jakarta",
            signed_date: params.signedDate || null,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        headerId = data.id;
      } else {
        const { error } = await supabase
          .from("entertainment_nominatives")
          .update({
            signer_name: params.signerName.trim(),
            signer_city: params.signerCity.trim() || "Jakarta",
            signed_date: params.signedDate || null,
          })
          .eq("id", headerId);
        if (error) throw error;
      }

      // Ganti seluruh baris (urutan = nomor baris)
      const { error: delError } = await supabase.from("entertainment_nominative_entries").delete().eq("nominative_id", headerId);
      if (delError) throw delError;
      if (params.entries.length > 0) {
        const { error: insError } = await supabase.from("entertainment_nominative_entries").insert(
          params.entries.map((e, index) => ({
            nominative_id: headerId!,
            line_no: index + 1,
            entry_date: e.entry_date,
            place: e.place.trim(),
            address: e.address.trim(),
            entertainment_type: e.entertainment_type.trim(),
            amount: Number(e.amount),
            recipient_name: e.recipient_name.trim(),
            recipient_position: e.recipient_position.trim(),
            recipient_company: e.recipient_company.trim(),
            recipient_business_type: e.recipient_business_type.trim(),
            notes: e.notes.trim() || null,
          })),
        );
        if (insError) throw insError;
      }
      return headerId;
    },
    onSuccess: (_id, params) => {
      queryClient.invalidateQueries({ queryKey: nominativeKeys.data(params.source) });
      queryClient.invalidateQueries({ queryKey: nominativeKeys.status(params.source) });
    },
  });
};

export const useUploadSignedNominative = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { source: NominativeSource; headerId: string; file: File; oldPath: string | null }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const sanitized = params.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = `${user.id}/${params.headerId}/${Date.now()}_${sanitized}`;
      const { error: uploadError } = await supabase.storage.from(ENTERTAINMENT_NOMINATIVE_BUCKET).upload(path, params.file);
      if (uploadError) throw uploadError;
      const { error } = await supabase
        .from("entertainment_nominatives")
        .update({
          signed_file_path: path,
          signed_file_name: params.file.name,
          signed_file_type: params.file.type,
          signed_file_size: params.file.size,
        })
        .eq("id", params.headerId);
      if (error) {
        await supabase.storage.from(ENTERTAINMENT_NOMINATIVE_BUCKET).remove([path]);
        throw error;
      }
      // File lama dihapus hanya bila tidak dipakai dokumen lain (mis. riwayat revisi realisasi)
      if (params.oldPath && params.oldPath.startsWith(`${user.id}/`)) {
        const { count } = await supabase
          .from("entertainment_nominatives")
          .select("id", { count: "exact", head: true })
          .eq("signed_file_path", params.oldPath);
        if (!count) await supabase.storage.from(ENTERTAINMENT_NOMINATIVE_BUCKET).remove([params.oldPath]);
      }
      return path;
    },
    onSuccess: (_p, params) => {
      queryClient.invalidateQueries({ queryKey: nominativeKeys.data(params.source) });
      queryClient.invalidateQueries({ queryKey: nominativeKeys.status(params.source) });
    },
  });
};

export async function openSignedNominative(path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(ENTERTAINMENT_NOMINATIVE_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return true;
}
