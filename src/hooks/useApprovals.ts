import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuditLog } from '@/hooks/useAuditLog';

export interface ApprovalRequest {
  id: string;
  request_number: string;
  division_id: string;
  category_id: string;
  requester_id: string;
  description: string;
  vendor: string | null;
  amount: number;
  needed_date: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  divisions?: { code: string; name: string };
  cost_categories?: { code: string; name: string };
  profiles?: { full_name: string; email: string };
  funding_sources?: { code: string; name: string; type: string };
  daysPending?: number;
  isOverdue?: boolean;
  // Type discriminator
  type: 'request' | 'medical_claim' | 'cash_advance';
  // Medical claim specific fields
  claim_type?: string;
  patient_name?: string;
  employee?: { full_name: string; email: string };
  // Cash advance specific fields
  purpose?: string;
  total_amount?: number;
}

const APPROVAL_SLA_DAYS = 3;

export function useApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifyApproved, notifyRejected } = useNotifications();
  const { logRequestEvent } = useAuditLog();

  // Fetch pending approvals (requests + medical claims + cash advances)
  const { data: approvals, isLoading, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      // Fetch regular requests
      const { data: requestsData, error: reqError } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_source_options (code, name, type)
        `)
        .in('status', ['submitted', 'under_review'])
        .order('submitted_at', { ascending: true });

      if (reqError) throw reqError;
      
      // Map funding_source_options to funding_sources for compatibility
      const mappedRequests = (requestsData || []).map(req => ({
        ...req,
        funding_sources: req.funding_source_options,
        type: 'request' as const,
      }));

      // Get requester profiles for requests
      const requesterIds = mappedRequests?.map(r => r.requester_id) || [];
      
      // Fetch medical claims with status 'submitted'
      const { data: medicalData, error: medError } = await supabase
        .from('medical_claims')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });

      if (medError) throw medError;

      // Fetch cash advances with status 'submitted'
      // Note: cash_advances.category_id is optional, categories are in cash_advance_items
      const { data: cashAdvanceData, error: caError } = await supabase
        .from('cash_advances')
        .select(`
          *,
          divisions (code, name)
        `)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });

      if (caError) throw caError;

      // Add employee IDs from medical claims and cash advances
      const employeeIds = medicalData?.map(m => m.employee_id) || [];
      const caRequesterIds = cashAdvanceData?.map(ca => ca.requester_id) || [];
      const allProfileIds = [...new Set([...requesterIds, ...employeeIds, ...caRequesterIds])];

      // Fetch all profiles at once
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('id, full_name, email, division_id')
        .in('id', allProfileIds);

      // Get divisions for medical claims
      const divisionIds = profiles?.map(p => p.division_id).filter(Boolean) as string[] || [];
      const { data: divisions } = await supabase
        .from('divisions')
        .select('id, code, name')
        .in('id', divisionIds);

      // Enrich requests
      const enrichedRequests = mappedRequests?.map(request => {
        const submittedDate = request.submitted_at ? new Date(request.submitted_at) : new Date(request.created_at);
        const daysPending = differenceInDays(new Date(), submittedDate);
        const isOverdue = daysPending > APPROVAL_SLA_DAYS;

        return {
          ...request,
          profiles: profiles?.find(p => p.id === request.requester_id),
          daysPending,
          isOverdue,
          type: 'request' as const,
        };
      }) || [];

      // Enrich medical claims to match ApprovalRequest structure
      const enrichedMedical = medicalData?.map(claim => {
        const submittedDate = claim.submitted_at ? new Date(claim.submitted_at) : new Date(claim.created_at);
        const daysPending = differenceInDays(new Date(), submittedDate);
        const isOverdue = daysPending > APPROVAL_SLA_DAYS;
        const employee = profiles?.find(p => p.id === claim.employee_id);
        const division = divisions?.find(d => d.id === employee?.division_id);

        return {
          id: claim.id,
          request_number: claim.claim_number,
          division_id: employee?.division_id || '',
          category_id: '',
          requester_id: claim.employee_id,
          description: `${claim.claim_type} - ${claim.patient_name}`,
          vendor: claim.hospital_clinic,
          amount: claim.claim_amount,
          needed_date: claim.treatment_date,
          status: claim.status,
          submitted_at: claim.submitted_at,
          created_at: claim.created_at,
          divisions: division ? { code: division.code, name: division.name } : undefined,
          cost_categories: { code: 'MEDICAL', name: 'Medical Reimbursement' },
          profiles: employee ? { full_name: employee.full_name || '', email: employee.email || '' } : undefined,
          daysPending,
          isOverdue,
          type: 'medical_claim' as const,
          claim_type: claim.claim_type,
          patient_name: claim.patient_name,
          employee: employee ? { full_name: employee.full_name || '', email: employee.email || '' } : undefined,
        };
      }) || [];

      // Enrich cash advances to match ApprovalRequest structure
      const enrichedCashAdvances = cashAdvanceData?.map(ca => {
        const submittedDate = ca.submitted_at ? new Date(ca.submitted_at) : new Date(ca.created_at);
        const daysPending = differenceInDays(new Date(), submittedDate);
        const isOverdue = daysPending > APPROVAL_SLA_DAYS;
        const requester = profiles?.find(p => p.id === ca.requester_id);

        return {
          id: ca.id,
          request_number: ca.ca_number,
          division_id: ca.division_id,
          category_id: ca.category_id || '',
          requester_id: ca.requester_id,
          description: ca.purpose,
          vendor: null,
          amount: ca.total_amount,
          needed_date: ca.needed_date,
          status: ca.status,
          submitted_at: ca.submitted_at,
          created_at: ca.created_at,
          divisions: ca.divisions,
          cost_categories: undefined, // CA uses item-level categories, not header-level
          profiles: requester ? { full_name: requester.full_name || '', email: requester.email || '' } : undefined,
          daysPending,
          isOverdue,
          type: 'cash_advance' as const,
          purpose: ca.purpose,
          total_amount: ca.total_amount,
        };
      }) || [];

      // Combine and sort by submitted_at
      const combined = [...enrichedRequests, ...enrichedMedical, ...enrichedCashAdvances].sort((a, b) => {
        const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : new Date(a.created_at).getTime();
        const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : new Date(b.created_at).getTime();
        return dateA - dateB;
      });

      return combined as ApprovalRequest[];
    },
  });

  // Approve request mutation
  const approveRequest = useMutation({
    mutationFn: async ({ requestId, note, approvedAmount, type = 'request' }: { requestId: string; note?: string; approvedAmount?: number; type?: 'request' | 'medical_claim' | 'cash_advance' }) => {
      if (type === 'cash_advance') {
        // Approve cash advance
        const { data: caData } = await supabase
          .from('cash_advances')
          .select('id, ca_number, requester_id, total_amount, purpose')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('approve_cash_advance', {
          p_ca_id: requestId,
          p_note: note || null,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to approve cash advance');

        return { result: { success: true, message: 'Cash advance approved' }, requestData: caData, approvedAmount: caData?.total_amount, type: 'cash_advance' as const };
      }

      if (type === 'medical_claim') {
        // Approve medical claim
        const { data: claimData } = await supabase
          .from('medical_claims')
          .select('id, claim_number, employee_id, claim_amount, patient_name')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('review_medical_claim_hrga', {
          p_claim_id: requestId,
          p_action: 'approve',
          p_note: note || null,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to approve medical claim');

        return { result: { success: true, message: 'Medical claim approved' }, requestData: claimData, approvedAmount: claimData?.claim_amount, type: 'medical_claim' };
      }

      // Regular request approval
      const { data: requestData } = await supabase
        .from('requests')
        .select('id, request_number, requester_id, amount, description')
        .eq('id', requestId)
        .single();

      const { data, error } = await supabase.rpc('approve_request', {
        p_request_id: requestId,
        p_approval_note: note || null,
        p_approved_amount: approvedAmount || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string; approved_amount?: number };
      if (!result.success) {
        throw new Error(result.error || 'Failed to approve request');
      }

      return { result, requestData, approvedAmount: result.approved_amount || approvedAmount, type: 'request' as const };
    },
    onSuccess: ({ result, requestData, approvedAmount, type }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['medical-claims'] });
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] });
      queryClient.invalidateQueries({ queryKey: ['division_budgets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Disetujui',
        description: result.message || 'Pengajuan berhasil disetujui',
      });

      // Log audit event and notify - only for regular requests
      if (requestData && type === 'request' && 'request_number' in requestData) {
        logRequestEvent('approved', requestData.id, requestData.request_number);
        
        // Send email notification to requester with approved amount
        notifyApproved({
          id: requestData.id,
          request_number: requestData.request_number,
          requester_id: requestData.requester_id,
          amount: approvedAmount || requestData.amount,
          description: requestData.description,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Menyetujui',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reject request mutation
  const rejectRequest = useMutation({
    mutationFn: async ({ requestId, reason, type = 'request' }: { requestId: string; reason: string; type?: 'request' | 'medical_claim' | 'cash_advance' }) => {
      if (type === 'cash_advance') {
        // Reject cash advance
        const { data: caData } = await supabase
          .from('cash_advances')
          .select('id, ca_number, requester_id, total_amount, purpose')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('reject_cash_advance', {
          p_ca_id: requestId,
          p_reason: reason,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to reject cash advance');

        return { result: { success: true }, requestData: caData, reason, type: 'cash_advance' as const };
      }

      if (type === 'medical_claim') {
        // Reject medical claim
        const { data: claimData } = await supabase
          .from('medical_claims')
          .select('id, claim_number, employee_id, claim_amount, patient_name')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('review_medical_claim_hrga', {
          p_claim_id: requestId,
          p_action: 'reject',
          p_note: reason,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to reject medical claim');

        return { result: { success: true }, requestData: claimData, reason, type: 'medical_claim' as const };
      }

      // Regular request rejection
      const { data: requestData } = await supabase
        .from('requests')
        .select('id, request_number, requester_id, amount, description')
        .eq('id', requestId)
        .single();

      const { data, error } = await supabase.rpc('reject_request', {
        p_request_id: requestId,
        p_rejection_reason: reason,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to reject request');
      }

      return { result, requestData, reason, type: 'request' as const };
    },
    onSuccess: ({ requestData, reason, type }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['medical-claims'] });
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Ditolak',
        description: 'Pengajuan telah ditolak',
      });

      // Log audit event and notify - only for regular requests
      if (requestData && type === 'request' && 'request_number' in requestData) {
        logRequestEvent('rejected', requestData.id, requestData.request_number, reason);
        
        // Send email notification to requester
        notifyRejected({
          id: requestData.id,
          request_number: requestData.request_number,
          requester_id: requestData.requester_id,
          amount: requestData.amount,
          description: requestData.description,
          rejection_reason: reason,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Menolak',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get statistics
  const overdueCount = approvals?.filter(a => a.isOverdue).length || 0;
  const totalPending = approvals?.length || 0;

  return {
    approvals,
    isLoading,
    refetch,
    approveRequest,
    rejectRequest,
    overdueCount,
    totalPending,
    APPROVAL_SLA_DAYS,
  };
}
