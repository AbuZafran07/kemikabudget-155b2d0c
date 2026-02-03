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
  // Type discriminator
  type: 'request' | 'medical_claim' | 'cash_advance';
  // Medical claim specific
  claim_type?: string;
  patient_name?: string;
  // Cash advance specific
  purpose?: string;
  total_amount?: number;
}

const PAYMENT_SLA_DAYS = 3;

export function usePaymentQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifyPaid } = useNotifications();
  const { logRequestEvent } = useAuditLog();

  // Fetch approved requests pending payment (requests + medical claims + cash advances)
  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ['payment-queue'],
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
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (reqError) throw reqError;
      
      // Map funding_source_options back to funding_sources key for compatibility
      const mappedRequests = (requestsData || []).map(req => ({
        ...req,
        funding_sources: req.funding_source_options,
        type: 'request' as const,
      }));

      // Fetch medical claims with status 'approved'
      const { data: medicalData, error: medError } = await supabase
        .from('medical_claims')
        .select('*')
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (medError) throw medError;

      // Fetch cash advances with status 'approved'
      const { data: cashAdvanceData, error: caError } = await supabase
        .from('cash_advances')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_source_options (code, name, type)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: true });

      if (caError) throw caError;

      // Map cash advances
      const mappedCashAdvances = (cashAdvanceData || []).map(ca => ({
        ...ca,
        funding_sources: ca.funding_source_options,
        type: 'cash_advance' as const,
      }));

      // Get all profile IDs
      const requesterIds = mappedRequests?.map(r => r.requester_id) || [];
      const employeeIds = medicalData?.map(m => m.employee_id) || [];
      const caRequesterIds = mappedCashAdvances?.map(ca => ca.requester_id) || [];
      const allProfileIds = [...new Set([...requesterIds, ...employeeIds, ...caRequesterIds])];

      // Fetch profiles
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

      // Get attachments for requests
      const requestIds = mappedRequests?.map(r => r.id) || [];
      const { data: attachments } = await supabase
        .from('request_attachments')
        .select('request_id, attachment_type')
        .in('request_id', requestIds);

      // Enrich requests
      const enrichedRequests = mappedRequests?.map(request => {
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
          type: 'request' as const,
        };
      }) || [];

      // Enrich medical claims
      const enrichedMedical = medicalData?.map(claim => {
        const approvedDate = claim.approved_at ? new Date(claim.approved_at) : new Date();
        const daysSinceApproval = differenceInDays(new Date(), approvedDate);
        const isOverdue = daysSinceApproval > PAYMENT_SLA_DAYS;
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
          approved_amount: claim.approved_amount,
          needed_date: claim.treatment_date,
          status: claim.status,
          funding_source_id: null,
          payment_method: null,
          beneficiary_name: employee?.full_name || null,
          beneficiary_bank: null,
          beneficiary_account: null,
          approved_at: claim.approved_at,
          created_at: claim.created_at,
          divisions: division ? { code: division.code, name: division.name } : undefined,
          cost_categories: { code: 'MEDICAL', name: 'Medical Reimbursement' },
          profiles: employee ? { full_name: employee.full_name || '', email: employee.email || '' } : undefined,
          hasInvoice: false,
          hasQuotation: false,
          hasReceipt: false,
          daysSinceApproval,
          isOverdue,
          type: 'medical_claim' as const,
          claim_type: claim.claim_type,
          patient_name: claim.patient_name,
        };
      }) || [];

      // Enrich cash advances
      const enrichedCashAdvances = mappedCashAdvances?.map(ca => {
        const approvedDate = ca.approved_at ? new Date(ca.approved_at) : new Date();
        const daysSinceApproval = differenceInDays(new Date(), approvedDate);
        const isOverdue = daysSinceApproval > PAYMENT_SLA_DAYS;
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
          approved_amount: ca.total_amount,
          needed_date: ca.needed_date,
          status: ca.status,
          funding_source_id: ca.funding_source_id,
          payment_method: null,
          beneficiary_name: requester?.full_name || null,
          beneficiary_bank: null,
          beneficiary_account: null,
          approved_at: ca.approved_at,
          created_at: ca.created_at,
          divisions: ca.divisions,
          cost_categories: ca.cost_categories,
          profiles: requester ? { full_name: requester.full_name || '', email: requester.email || '' } : undefined,
          funding_sources: ca.funding_sources,
          hasInvoice: false,
          hasQuotation: false,
          hasReceipt: false,
          daysSinceApproval,
          isOverdue,
          type: 'cash_advance' as const,
          purpose: ca.purpose,
          total_amount: ca.total_amount,
        };
      }) || [];

      // Combine and sort
      const combined = [...enrichedRequests, ...enrichedMedical, ...enrichedCashAdvances].sort((a, b) => {
        const dateA = a.approved_at ? new Date(a.approved_at).getTime() : 0;
        const dateB = b.approved_at ? new Date(b.approved_at).getTime() : 0;
        return dateA - dateB;
      });

      return combined as PaymentRequest[];
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
    mutationFn: async ({ requestId, note, fundingSourceId, type = 'request' }: { requestId: string; note?: string; fundingSourceId?: string; type?: 'request' | 'medical_claim' | 'cash_advance' }) => {
      if (type === 'cash_advance') {
        // Pay cash advance
        const { data: caData } = await supabase
          .from('cash_advances')
          .select('id, ca_number, requester_id, total_amount, purpose')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('pay_cash_advance', {
          p_ca_id: requestId,
          p_funding_source_id: fundingSourceId || '',
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to pay cash advance');

        return { result: { success: true, message: 'Cash advance paid' }, requestData: caData, type: 'cash_advance' as const };
      }

      if (type === 'medical_claim') {
        // Pay medical claim
        const { data: claimData } = await supabase
          .from('medical_claims')
          .select('id, claim_number, employee_id, claim_amount, approved_amount, patient_name')
          .eq('id', requestId)
          .single();

        const { data, error } = await supabase.rpc('pay_medical_claim', {
          p_claim_id: requestId,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) throw new Error(result.error || 'Failed to pay medical claim');

        return { result: { success: true, message: 'Medical claim paid' }, requestData: claimData, type: 'medical_claim' as const };
      }

      // Regular request payment
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

      return { result, requestData, type: 'request' as const };
    },
    onSuccess: ({ result, requestData, type }) => {
      queryClient.invalidateQueries({ queryKey: ['payment-queue'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['medical-claims'] });
      queryClient.invalidateQueries({ queryKey: ['cash-advances'] });
      queryClient.invalidateQueries({ queryKey: ['funding_sources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({
        title: 'Pembayaran Berhasil',
        description: result.message || 'Pembayaran telah diproses',
      });

      // Log audit event and notify - only for regular requests
      if (requestData && type === 'request' && 'request_number' in requestData) {
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
  const totalAmount = payments?.reduce((sum, p) => sum + (p.approved_amount || p.amount), 0) || 0;

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
