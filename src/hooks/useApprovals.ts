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
}

const APPROVAL_SLA_DAYS = 3;

export function useApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifyApproved, notifyRejected } = useNotifications();
  const { logRequestEvent } = useAuditLog();

  // Fetch pending approvals
  const { data: approvals, isLoading, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_source_options (code, name, type)
        `)
        .in('status', ['submitted', 'under_review'])
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      
      // Map funding_source_options to funding_sources for compatibility
      const mappedData = (data || []).map(req => ({
        ...req,
        funding_sources: req.funding_source_options,
      }));

      // Get requester profiles separately
      const requesterIds = mappedData?.map(r => r.requester_id) || [];
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('id, full_name, email')
        .in('id', requesterIds);

      // Merge and calculate pending days
      const enrichedData = mappedData?.map(request => {
        const submittedDate = request.submitted_at ? new Date(request.submitted_at) : new Date(request.created_at);
        const daysPending = differenceInDays(new Date(), submittedDate);
        const isOverdue = daysPending > APPROVAL_SLA_DAYS;

        return {
          ...request,
          profiles: profiles?.find(p => p.id === request.requester_id),
          daysPending,
          isOverdue,
        };
      }) || [];

      return enrichedData as ApprovalRequest[];
    },
  });

  // Approve request mutation
  const approveRequest = useMutation({
    mutationFn: async ({ requestId, note, approvedAmount }: { requestId: string; note?: string; approvedAmount?: number }) => {
      // Get request details first
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

      return { result, requestData, approvedAmount: result.approved_amount || approvedAmount };
    },
    onSuccess: ({ result, requestData, approvedAmount }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['division_budgets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Disetujui',
        description: result.message || 'Pengajuan berhasil disetujui dan anggaran telah dikurangi',
      });

      // Log audit event
      if (requestData) {
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
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      // Get request details first
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

      return { result, requestData, reason };
    },
    onSuccess: ({ requestData, reason }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Ditolak',
        description: 'Pengajuan telah ditolak',
      });

      // Log audit event
      if (requestData) {
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
