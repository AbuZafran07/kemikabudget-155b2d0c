import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PettyCashTransaction {
  id: string;
  funding_source_id: string;
  request_id: string | null;
  transaction_type: 'top_up' | 'withdrawal' | 'payment' | 'adjustment';
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_number: string | null;
  performed_by: string;
  created_at: string;
  profiles?: { full_name: string };
  requests?: { request_number: string };
}

export interface CashReconciliation {
  id: string;
  funding_source_id: string;
  reconciliation_date: string;
  system_balance: number;
  physical_balance: number;
  variance: number;
  variance_reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reconciled_by: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  reconciled_by_profile?: { full_name: string };
}

export interface FundingSource {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  is_active: boolean;
}

export function usePettyCash() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch petty cash accounts
  const { data: pettyCashAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['petty_cash_accounts'],
    queryFn: async () => {
      // Use secure view - bank details visible based on role (super_admin only)
      const { data, error } = await supabase
        .from('funding_sources_secure')
        .select('id, code, name, type, is_active, account_number, account_holder, bank_name, balance')
        .eq('type', 'petty_cash')
        .order('name');

      if (error) throw error;
      return data as FundingSource[];
    },
  });

  // Fetch bank accounts for source selection in top-up
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funding_sources_secure')
        .select('id, code, name, type, is_active, bank_name, balance')
        .eq('type', 'bank')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as FundingSource[];
    },
  });

  // Fetch transactions
  const { data: transactions, isLoading: transactionsLoading, refetch } = useQuery({
    queryKey: ['petty_cash_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('petty_cash_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Get performer profiles - use profiles_secure view for data masking
      const performerIds = [...new Set(data?.map(t => t.performed_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('id, full_name')
        .in('id', performerIds);

      // Enrich with profiles
      const enrichedData = data?.map(txn => ({
        ...txn,
        profiles: profiles?.find(p => p.id === txn.performed_by),
      })) || [];

      return enrichedData as PettyCashTransaction[];
    },
  });

  // Fetch reconciliations
  const { data: reconciliations, isLoading: reconciliationsLoading } = useQuery({
    queryKey: ['cash_reconciliations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_reconciliations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get reconciled_by profiles - use profiles_secure view for data masking
      const reconciledByIds = [...new Set(data?.map(r => r.reconciled_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('id, full_name')
        .in('id', reconciledByIds);

      const enrichedData = data?.map(recon => ({
        ...recon,
        reconciled_by_profile: profiles?.find(p => p.id === recon.reconciled_by),
      })) || [];

      return enrichedData as CashReconciliation[];
    },
  });

  // Top-up mutation
  const topUp = useMutation({
    mutationFn: async ({
      fundingSourceId,
      amount,
      description,
      referenceNumber,
      sourceBankId,
    }: {
      fundingSourceId: string;
      amount: number;
      description?: string;
      referenceNumber?: string;
      sourceBankId?: string;
    }) => {
      const { data, error } = await supabase.rpc('topup_petty_cash', {
        p_funding_source_id: fundingSourceId,
        p_amount: amount,
        p_source_bank_id: sourceBankId || null,
        p_description: description || null,
        p_reference_number: referenceNumber || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; new_petty_balance?: number; new_bank_balance?: number; source_bank_name?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to top up');
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['petty_cash_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['petty_cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['funding_sources'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      
      const message = result.source_bank_name
        ? `Saldo kas kecil: Rp ${result.new_petty_balance?.toLocaleString('id-ID')}. Dikurangi dari ${result.source_bank_name}.`
        : `Saldo baru: Rp ${result.new_petty_balance?.toLocaleString('id-ID')}`;
      
      toast({
        title: 'Top-up Berhasil',
        description: message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Top-up',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Create reconciliation mutation
  const createReconciliation = useMutation({
    mutationFn: async ({
      fundingSourceId,
      physicalBalance,
      notes,
    }: {
      fundingSourceId: string;
      physicalBalance: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('create_reconciliation', {
        p_funding_source_id: fundingSourceId,
        p_physical_balance: physicalBalance,
        p_notes: notes || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; variance?: number };
      if (!result.success) {
        throw new Error(result.error || 'Failed to create reconciliation');
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cash_reconciliations'] });
      const varianceText = result.variance === 0 
        ? 'Tidak ada selisih' 
        : `Selisih: Rp ${Math.abs(result.variance || 0).toLocaleString('id-ID')}`;
      toast({
        title: 'Rekonsiliasi Dibuat',
        description: varianceText,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Membuat Rekonsiliasi',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Calculate summary
  const totalBalance = pettyCashAccounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
  const todayTransactions = transactions?.filter(t => {
    const today = new Date().toDateString();
    return new Date(t.created_at).toDateString() === today;
  }) || [];
  const todayIn = todayTransactions.filter(t => t.transaction_type === 'top_up').reduce((sum, t) => sum + t.amount, 0);
  const todayOut = todayTransactions.filter(t => t.transaction_type !== 'top_up').reduce((sum, t) => sum + t.amount, 0);

  return {
    pettyCashAccounts,
    bankAccounts,
    transactions,
    reconciliations,
    isLoading: accountsLoading || transactionsLoading || reconciliationsLoading,
    refetch,
    topUp,
    createReconciliation,
    totalBalance,
    todayIn,
    todayOut,
  };
}
