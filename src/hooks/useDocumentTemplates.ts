import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DocumentTemplate {
  id: string;
  template_type: string;
  header_company_name: string;
  header_address: string | null;
  header_phone: string | null;
  header_email: string | null;
  header_logo_url: string | null;
  show_header: boolean;
  footer_text: string | null;
  footer_page_number: boolean;
  show_footer: boolean;
  number_format: string;
  number_prefix: string | null;
  reset_sequence_yearly: boolean;
  reset_sequence_monthly: boolean;
  draft_watermark_text: string;
  draft_watermark_opacity: number;
  show_draft_watermark: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DocumentSequence {
  id: string;
  template_type: string;
  division_id: string | null;
  year: number;
  month: number | null;
  current_sequence: number;
  created_at: string;
  updated_at: string;
  division?: {
    code: string;
    name: string;
  };
}

export function useDocumentTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("template_type");

      if (error) throw error;
      return data as DocumentTemplate[];
    },
  });

  const { data: sequences, isLoading: sequencesLoading } = useQuery({
    queryKey: ["document-sequences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_sequences")
        .select(`
          *,
          division:divisions(code, name)
        `)
        .order("year", { ascending: false });

      if (error) throw error;
      return data as DocumentSequence[];
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (template: Partial<DocumentTemplate> & { id: string }) => {
      const { id, ...updates } = template;
      const { data, error } = await supabase
        .from("document_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({
        title: "Berhasil",
        description: "Template dokumen berhasil diperbarui",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Omit<DocumentTemplate, "id" | "created_at" | "updated_at" | "updated_by">) => {
      const { data, error } = await supabase
        .from("document_templates")
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({
        title: "Berhasil",
        description: "Template dokumen berhasil dibuat",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetSequence = useMutation({
    mutationFn: async (sequenceId: string) => {
      const { error } = await supabase
        .from("document_sequences")
        .update({ current_sequence: 0 })
        .eq("id", sequenceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-sequences"] });
      toast({
        title: "Berhasil",
        description: "Sequence berhasil direset",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    templates,
    sequences,
    templatesLoading,
    sequencesLoading,
    updateTemplate,
    createTemplate,
    resetSequence,
  };
}

// Helper to get template by type
export function useDocumentTemplate(templateType: string) {
  return useQuery({
    queryKey: ["document-template", templateType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("template_type", templateType)
        .maybeSingle();

      if (error) throw error;
      return data as DocumentTemplate | null;
    },
  });
}
