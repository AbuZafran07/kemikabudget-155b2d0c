import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuditLog } from '@/hooks/useAuditLog';

export interface PaymentRequest {
  id: string;
  request_number: string;
  division_id: string;
  category_id: string;
  requester_id: string;
  description: string;
  vendor: string | null;
  amount: number;
  approved_amount: number | null;
  needed_date: string;
  status: string;
  funding_source_id: string | null;
  payment_method: string | null;
  beneficiary_name: string | null;
  beneficiary_bank: string | null;
  beneficiary_account: string | null;
  approved_at: string | null;
  created_at: string;
  divisions?: { code: string; name: string };
  cost_categories?: { code: string; name: string };
  profiles?: { full_name: string; email: string };
  funding_sources?: { code: string; name: string; type: string };
  hasInvoice?: boolean;
  hasQuotation?: boolean;
  hasReceipt?: boolean;
  daysSinceApproval?: number;
  isOverdue?: boolean;
}

const PAYMENT_SLA_DAYS = 3;

export function usePaymentQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifyPaid } = useNotifications();
  const { logRequestEvent } = useAuditLog();

  // Fetch approved requests pending payment
  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ['payment-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_source_options (code, name, type)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (error) throw error;
      
      // Map funding_source_options back to funding_sources key for compatibility
      const mappedData = (data || []).map(req => ({
        ...req,
        funding_sources: req.funding_source_options,
      }));

      // Get requester profiles
      const requesterIds = mappedData?.map(r => r.requester_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', requesterIds);

      // Get attachments to check for invoice/quotation
      const requestIds = mappedData?.map(r => r.id) || [];
      const { data: attachments } = await supabase
        .from('request_attachments')
        .select('request_id, attachment_type')
        .in('request_id', requestIds);

      // Merge and enrich data
      const enrichedData = mappedData?.map(request => {
        const approvedDate = request.approved_at ? new Date(request.approved_at) : new Date();
        const daysSinceApproval = differenceInDays(new Date(), approvedDate);
        const isOverdue = daysSinceApproval > PAYMENT_SLA_DAYS;

        const requestAttachments = attachments?.filter(a => a.request_id === request.id) || [];
        const hasInvoice = requestAttachments.some(a => a.attachment_type === 'invoice');
        const hasQuotation = requestAttachments.some(a => a.attachment_type === 'quotation');
        const hasReceipt = requestAttachments.some(a => a.attachment_type === 'receipt');

        return {
          ...request,
          profiles: profiles?.find(p => p.id === request.requester_id),
          hasInvoice,
          hasQuotation,
          hasReceipt,
          daysSinceApproval,
          isOverdue,
        };
      }) || [];

      return enrichedData as PaymentRequest[];
    },
  });

  // Fetch funding sources - use secure view for role-based access
  const { data: fundingSources } = useQuery({
    queryKey: ['funding_sources_secure'],
    queryFn: async () => {
      // Use secure view - bank details visible based on role (super_admin only)
      const { data, error } = await supabase
        .from('funding_sources_secure')
        .select('id, code, name, type, is_active, account_number, account_holder, bank_name, balance')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Pay request mutation
  const payRequest = useMutation({
    mutationFn: async ({ requestId, note }: { requestId: string; note?: string }) => {
      // Get request details first
      const { data: requestData } = await supabase
        .from('requests')
        .select('id, request_number, requester_id, amount, description')
        .eq('id', requestId)
        .single();

      const { data, error } = await supabase.rpc('pay_request', {
        p_request_id: requestId,
        p_payment_note: note || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string; funding_balance?: number };
      if (!result.success) {
        throw new Error(result.error || 'Failed to process payment');
      }

      return { result, requestData };
    },
    onSuccess: ({ result, requestData }) => {
      queryClient.invalidateQueries({ queryKey: ['payment-queue'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['funding_sources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Pembayaran Berhasil',
        description: result.message || 'Pembayaran telah diproses dan dana telah dikurangi',
      });

      // Log audit event
      if (requestData) {
        logRequestEvent('paid', requestData.id, requestData.request_number);
        
        // Send email notification to requester
        notifyPaid({
          id: requestData.id,
          request_number: requestData.request_number,
          requester_id: requestData.requester_id,
          amount: requestData.amount,
          description: requestData.description,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Memproses Pembayaran',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Settle request mutation
  const settleRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc('settle_request', {
        p_request_id: requestId,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to settle request');
      }

      return result;
    },
    onSuccess: (_, requestId) => {
      queryClient.invalidateQueries({ queryKey: ['payment-queue'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Selesai',
        description: 'Pengajuan telah diselesaikan',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Menyelesaikan',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get statistics
  const overdueCount = payments?.filter(p => p.isOverdue).length || 0;
  const totalPending = payments?.length || 0;
  const totalAmount = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

  return {
    payments,
    fundingSources,
    isLoading,
    refetch,
    payRequest,
    settleRequest,
    overdueCount,
    totalPending,
    totalAmount,
    PAYMENT_SLA_DAYS,
  };
}
