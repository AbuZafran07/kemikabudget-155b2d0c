import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useAuditLog } from '@/hooks/useAuditLog';

export interface BudgetTransfer {
  id: string;
  transfer_number: string;
  division_id: string;
  from_budget_id: string;
  to_budget_id: string;
  amount: number;
  reason: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  requester_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  from_budget?: {
    id: string;
    division: { name: string };
    category: { name: string; code: string };
    allocated_amount: number;
    used_amount: number;
  };
  to_budget?: {
    id: string;
    division: { name: string };
    category: { name: string; code: string };
  };
  division?: { name: string; code: string };
}

export function useBudgetTransfer() {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { logBudgetTransfer } = useAuditLog();

  // Get transfers based on user role
  const { data: transfers = [], isLoading: isLoadingTransfers } = useQuery({
    queryKey: ['budget-transfers', role, profile?.division_id],
    queryFn: async () => {
      let query = supabase
        .from('budget_transfers')
        .select(`
          *,
          division:divisions(name, code),
          from_budget:division_budgets!budget_transfers_from_budget_id_fkey(
            id,
            allocated_amount,
            used_amount,
            division:divisions(name),
            category:cost_categories(name, code)
          ),
          to_budget:division_budgets!budget_transfers_to_budget_id_fkey(
            id,
            division:divisions(name),
            category:cost_categories(name, code)
          )
        `)
        .order('created_at', { ascending: false });

      // Filter by division for non-super_admin/finance users
      if (role !== 'super_admin' && role !== 'finance' && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BudgetTransfer[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Get pending transfers for dashboard
  const { data: pendingTransfers = [] } = useQuery({
    queryKey: ['pending-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_transfers')
        .select('*')
        .eq('status', 'submitted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user && (role === 'super_admin'),
  });

  // Get division budgets for form
  const { data: divisionBudgets = [] } = useQuery({
    queryKey: ['division-budgets-for-transfer', profile?.division_id],
    queryFn: async () => {
      let query = supabase
        .from('division_budgets')
        .select(`
          id,
          allocated_amount,
          used_amount,
          division:divisions(id, name, code),
          category:cost_categories(id, name, code),
          period:budget_periods(id, name, is_active)
        `)
        .gt('allocated_amount', 0);

      // Filter by active period
      const { data: activePeriod } = await supabase
        .from('budget_periods')
        .select('id')
        .eq('is_active', true)
        .single();

      if (activePeriod) {
        query = query.eq('period_id', activePeriod.id);
      }

      // If not super_admin, filter by division
      if (role !== 'super_admin' && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Create transfer
  const createTransferMutation = useMutation({
    mutationFn: async (transfer: {
      division_id: string;
      from_budget_id: string;
      to_budget_id: string;
      amount: number;
      reason: string;
    }) => {
      const { data, error } = await supabase
        .from('budget_transfers')
        .insert({
          ...transfer,
          requester_id: user!.id,
          transfer_number: '', // Will be auto-generated
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      toast({ title: 'Transfer berhasil dibuat' });
      logBudgetTransfer('created', data.id, data.transfer_number);
    },
    onError: (error) => {
      toast({
        title: 'Gagal membuat transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update draft transfer (requester or super_admin, status=draft only per RLS)
  const updateTransferMutation = useMutation({
    mutationFn: async ({ transferId, ...update }: {
      transferId: string;
      from_budget_id: string;
      to_budget_id: string;
      amount: number;
      reason: string;
      division_id: string;
    }) => {
      const { data, error } = await supabase
        .from('budget_transfers')
        .update({
          division_id: update.division_id,
          from_budget_id: update.from_budget_id,
          to_budget_id: update.to_budget_id,
          amount: update.amount,
          reason: update.reason,
        })
        .eq('id', transferId)
        .eq('status', 'draft')
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('Anda tidak memiliki izin mengubah draft ini, atau draft sudah tidak berstatus draft.');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      toast({ title: 'Transfer berhasil diperbarui' });
      logBudgetTransfer('updated', data.id, data.transfer_number);
    },
    onError: (error) => {
      toast({
        title: 'Gagal memperbarui transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete draft transfer (requester or super_admin, status=draft only per RLS)
  const deleteTransferMutation = useMutation({
    mutationFn: async (transfer: { id: string; transfer_number: string }) => {
      const { data, error } = await supabase
        .from('budget_transfers')
        .delete()
        .eq('id', transfer.id)
        .eq('status', 'draft')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Anda tidak memiliki izin menghapus draft ini, atau draft sudah tidak berstatus draft.');
      }

      // Audit log (fire and forget)
      if (user?.id) {
        supabase.from('audit_logs').insert({
          user_id: user.id,
          event_type: 'delete',
          entity_type: 'budget_transfer',
          entity_id: transfer.id,
          description: `Draft transfer anggaran ${transfer.transfer_number} dihapus`,
        }).then();
      }
      return transfer;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      toast({ title: 'Draft transfer berhasil dihapus' });
      logBudgetTransfer('deleted', data.id, data.transfer_number);
    },
    onError: (error) => {
      toast({
        title: 'Gagal menghapus transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Submit transfer
  const submitTransferMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase
        .from('budget_transfers')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', transferId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      toast({ title: 'Transfer berhasil diajukan' });
      logBudgetTransfer('submitted', data.id, data.transfer_number);
    },
    onError: (error) => {
      toast({
        title: 'Gagal mengajukan transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Approve transfer
  const approveTransferMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase
        .rpc('approve_budget_transfer', { p_transfer_id: transferId });

      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || 'Unknown error');
      return result;
    },
    onSuccess: (_, transferId) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['division-budgets'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
      toast({ title: 'Transfer berhasil disetujui' });
    },
    onError: (error) => {
      toast({
        title: 'Gagal menyetujui transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reject transfer
  const rejectTransferMutation = useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: string; reason: string }) => {
      const { data, error } = await supabase
        .rpc('reject_budget_transfer', { 
          p_transfer_id: transferId,
          p_rejection_reason: reason,
        });

      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || 'Unknown error');
      return result;
    },
    onSuccess: (_, { transferId, reason }) => {
      queryClient.invalidateQueries({ queryKey: ['budget-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] });
      toast({ title: 'Transfer berhasil ditolak' });
    },
    onError: (error) => {
      toast({
        title: 'Gagal menolak transfer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    transfers,
    pendingTransfers,
    divisionBudgets,
    isLoadingTransfers,
    createTransfer: createTransferMutation.mutate,
    updateTransfer: updateTransferMutation.mutate,
    deleteTransfer: deleteTransferMutation.mutate,
    submitTransfer: submitTransferMutation.mutate,
    approveTransfer: approveTransferMutation.mutate,
    rejectTransfer: rejectTransferMutation.mutate,
    isCreating: createTransferMutation.isPending,
    isUpdating: updateTransferMutation.isPending,
    isDeleting: deleteTransferMutation.isPending,
    isSubmitting: submitTransferMutation.isPending,
    isApproving: approveTransferMutation.isPending,
    isRejecting: rejectTransferMutation.isPending,
  };
}