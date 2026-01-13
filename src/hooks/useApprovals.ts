import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays } from 'date-fns';

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
          funding_sources (code, name, type)
        `)
        .in('status', ['submitted', 'under_review'])
        .order('submitted_at', { ascending: true });

      if (error) throw error;

      // Get requester profiles separately
      const requesterIds = data?.map(r => r.requester_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', requesterIds);

      // Merge and calculate pending days
      const enrichedData = data?.map(request => {
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
    mutationFn: async ({ requestId, note }: { requestId: string; note?: string }) => {
      const { data, error } = await supabase.rpc('approve_request', {
        p_request_id: requestId,
        p_approval_note: note || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to approve request');
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['division_budgets'] });
      toast({
        title: 'Disetujui',
        description: result.message || 'Pengajuan berhasil disetujui dan anggaran telah dikurangi',
      });
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
      const { data, error } = await supabase.rpc('reject_request', {
        p_request_id: requestId,
        p_rejection_reason: reason,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to reject request');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast({
        title: 'Ditolak',
        description: 'Pengajuan telah ditolak',
      });
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
