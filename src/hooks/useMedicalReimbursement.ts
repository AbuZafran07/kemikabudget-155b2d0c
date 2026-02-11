import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

export interface MedicalBudget {
  id: string;
  employee_id: string;
  year: number;
  total_entitlement: number;
  used_amount: number;
  remaining_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalClaim {
  id: string;
  claim_number: string;
  employee_id: string;
  medical_budget_id: string | null;
  claim_date: string;
  treatment_date: string;
  claim_amount: number;
  approved_amount: number | null;
  claim_type: string;
  patient_name: string;
  patient_relationship: string;
  diagnosis: string | null;
  hospital_clinic: string | null;
  doctor_name: string | null;
  notes: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_hrga_at: string | null;
  reviewed_hrga_by: string | null;
  reviewed_finance_at: string | null;
  reviewed_finance_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  paid_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  employee?: {
    id: string;
    full_name: string;
    email: string;
    division_id: string | null;
  };
}

export interface MedicalClaimAttachment {
  id: string;
  claim_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  attachment_type: string;
  uploaded_by: string;
  created_at: string;
}

export interface MedicalClaimEvent {
  id: string;
  claim_id: string;
  event_type: string;
  description: string;
  performed_by: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  performer?: {
    full_name: string;
  };
}

export interface CreateMedicalClaimData {
  treatment_date: string;
  claim_amount: number;
  claim_type: string;
  patient_name: string;
  patient_relationship: string;
  diagnosis?: string;
  hospital_clinic?: string;
  doctor_name?: string;
  notes?: string;
}

export function useMedicalBudget() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  return useQuery({
    queryKey: ["medical-budget", user?.id, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_medical_budgets")
        .select("*")
        .eq("employee_id", user?.id)
        .eq("year", currentYear)
        .maybeSingle();

      if (error) throw error;
      return data as MedicalBudget | null;
    },
    enabled: !!user?.id,
  });
}

export function useMedicalClaims(filters?: { status?: string; employeeId?: string }) {
  const { user, hasRole } = useAuth();
  // Only Super Admin can view all claims
  const isSuperAdmin = hasRole("super_admin");

  return useQuery({
    queryKey: ["medical-claims", filters, user?.id, isSuperAdmin],
    queryFn: async () => {
      let query = supabase
        .from("medical_claims")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status as "draft" | "submitted" | "review_hrga" | "review_finance" | "approved" | "rejected" | "paid" | "closed" | "cancelled");
      }

      // CRITICAL: Only Super Admin can see all claims
      // All other roles (admin, finance, user) only see their own claims
      // This filter is applied in addition to RLS for defense in depth
      if (!isSuperAdmin) {
        query = query.eq("employee_id", user?.id);
      } else if (filters?.employeeId) {
        query = query.eq("employee_id", filters.employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch employee data separately
      const employeeIds = [...new Set(data?.map(c => c.employee_id).filter(Boolean))];
      const employeeMap: Record<string, { id: string; full_name: string; email: string; division_id: string | null }> = {};
      
      if (employeeIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_secure")
          .select("id, full_name, email, division_id")
          .in("id", employeeIds);
        
        profiles?.forEach(p => {
          if (p.id) employeeMap[p.id] = p as { id: string; full_name: string; email: string; division_id: string | null };
        });
      }

      return data?.map(c => ({
        ...c,
        employee: employeeMap[c.employee_id] || null
      })) as MedicalClaim[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export function useMedicalClaim(id: string | undefined) {
  return useQuery({
    queryKey: ["medical-claim", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_claims")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      
      // Fetch employee separately
      let employee = null;
      if (data.employee_id) {
        const { data: empData } = await supabase
          .from("profiles_secure")
          .select("id, full_name, email, division_id")
          .eq("id", data.employee_id)
          .maybeSingle();
        employee = empData;
      }

      return { ...data, employee } as MedicalClaim;
    },
    enabled: !!id,
  });
}

export function useMedicalClaimEvents(claimId: string | undefined) {
  return useQuery({
    queryKey: ["medical-claim-events", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_claim_events")
        .select("*")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      // Fetch performer names separately
      const performerIds = [...new Set(data?.map(e => e.performed_by).filter(Boolean))];
      const performerMap: Record<string, string> = {};
      
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_secure")
          .select("id, full_name")
          .in("id", performerIds);
        
        profiles?.forEach(p => {
          if (p.id) performerMap[p.id] = p.full_name || "";
        });
      }

      return data?.map(e => ({
        ...e,
        performer: { full_name: performerMap[e.performed_by] || "" }
      })) as MedicalClaimEvent[];
    },
    enabled: !!claimId,
  });
}

export function useMedicalClaimAttachments(claimId: string | undefined) {
  return useQuery({
    queryKey: ["medical-claim-attachments", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_claim_attachments")
        .select("*")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MedicalClaimAttachment[];
    },
    enabled: !!claimId,
  });
}

export function useCreateMedicalClaim() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async (data: CreateMedicalClaimData) => {
      // Get next claim number
      const { data: claimNumber, error: numError } = await supabase.rpc(
        "get_next_medical_claim_number"
      );
      if (numError) throw numError;

      const { data: claim, error } = await supabase
        .from("medical_claims")
        .insert({
          claim_number: claimNumber,
          employee_id: user?.id,
          ...data,
        })
        .select()
        .single();

      if (error) throw error;

      // Add event
      await supabase.from("medical_claim_events").insert({
        claim_id: claim.id,
        event_type: "created",
        description: "Claim created",
        performed_by: user?.id,
      });

      return claim;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      toast({
        title: t("medical.createSuccess"),
        description: t("medical.createSuccessDesc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateMedicalClaim() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateMedicalClaimData>;
    }) => {
      const { data: claim, error } = await supabase
        .from("medical_claims")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      await supabase.from("medical_claim_events").insert({
        claim_id: id,
        event_type: "updated",
        description: "Claim updated",
        performed_by: user?.id,
      });

      return claim;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-claim", variables.id] });
      toast({
        title: t("medical.updateSuccess"),
        description: t("medical.updateSuccessDesc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSubmitMedicalClaim() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data, error } = await supabase.rpc("submit_medical_claim", {
        p_claim_id: claimId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-budget"] });
      toast({
        title: t("medical.submitSuccess"),
        description: t("medical.submitSuccessDesc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReviewMedicalClaimHRGA() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async ({
      claimId,
      action,
      note,
    }: {
      claimId: string;
      action: "approve" | "reject";
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc("review_medical_claim_hrga", {
        p_claim_id: claimId,
        p_action: action,
        p_note: note,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-claim"] });
      toast({
        title: variables.action === "approve" 
          ? t("medical.hrgaApproveSuccess")
          : t("medical.hrgaRejectSuccess"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReviewMedicalClaimFinance() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async ({
      claimId,
      action,
      approvedAmount,
      note,
    }: {
      claimId: string;
      action: "approve" | "reject";
      approvedAmount?: number;
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc("review_medical_claim_finance", {
        p_claim_id: claimId,
        p_action: action,
        p_approved_amount: approvedAmount,
        p_note: note,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-claim"] });
      toast({
        title: variables.action === "approve" 
          ? t("medical.financeApproveSuccess")
          : t("medical.financeRejectSuccess"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function usePayMedicalClaim() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data, error } = await supabase.rpc("pay_medical_claim", {
        p_claim_id: claimId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-claim"] });
      queryClient.invalidateQueries({ queryKey: ["medical-budget"] });
      toast({
        title: t("medical.paySuccess"),
        description: t("medical.paySuccessDesc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCloseMedicalClaim() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data, error } = await supabase.rpc("close_medical_claim", {
        p_claim_id: claimId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medical-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medical-claim"] });
      toast({
        title: t("medical.closeSuccess"),
        description: t("medical.closeSuccessDesc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
