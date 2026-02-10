import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface AdjustmentFormData {
  reference_type: 'expense_request' | 'cash_advance' | 'medical_claim';
  reference_id: string;
  original_amount: number;
  adjusted_amount: number;
  reason: string;
  division_id: string;
  category_id?: string;
  period_id?: string;
  funding_source_id?: string;
  adjust_budget: boolean;
  adjust_cash: boolean;
}

export function useAdjustments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const adjustmentsQuery = useQuery({
    queryKey: ['adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('adjustments')
        .select(`
          *,
          divisions:division_id(name, code),
          cost_categories:category_id(name, code),
          budget_periods:period_id(name, year)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createAdjustment = useMutation({
    mutationFn: async (formData: AdjustmentFormData) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Get next adjustment number
      const { data: adjNumber, error: numError } = await supabase
        .rpc('get_next_adjustment_number');
      if (numError) throw numError;

      const difference = formData.adjusted_amount - formData.original_amount;

      const { data, error } = await supabase
        .from('adjustments')
        .insert({
          adjustment_number: adjNumber,
          reference_type: formData.reference_type,
          reference_id: formData.reference_id,
          original_amount: formData.original_amount,
          adjusted_amount: formData.adjusted_amount,
          difference_amount: difference,
          reason: formData.reason,
          division_id: formData.division_id,
          category_id: formData.category_id || null,
          period_id: formData.period_id || null,
          funding_source_id: formData.funding_source_id || null,
          adjust_budget: formData.adjust_budget,
          adjust_cash: formData.adjust_cash,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      toast({ title: 'Adjustment berhasil dibuat dan menunggu persetujuan Super Admin' });
    },
    onError: (error: Error) => {
      toast({ title: 'Gagal membuat adjustment', description: error.message, variant: 'destructive' });
    },
  });

  const approveAdjustment = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { data, error } = await supabase.rpc('approve_adjustment', {
        p_adjustment_id: id,
        p_note: note || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['division-budgets'] });
      queryClient.invalidateQueries({ queryKey: ['funding-sources'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Adjustment berhasil disetujui' });
    },
    onError: (error: Error) => {
      toast({ title: 'Gagal menyetujui adjustment', description: error.message, variant: 'destructive' });
    },
  });

  const rejectAdjustment = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('reject_adjustment', {
        p_adjustment_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      toast({ title: 'Adjustment ditolak' });
    },
    onError: (error: Error) => {
      toast({ title: 'Gagal menolak adjustment', description: error.message, variant: 'destructive' });
    },
  });

  return {
    adjustments: adjustmentsQuery.data || [],
    isLoading: adjustmentsQuery.isLoading,
    createAdjustment,
    approveAdjustment,
    rejectAdjustment,
  };
}
