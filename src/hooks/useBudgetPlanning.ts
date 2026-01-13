import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DivisionBudget {
  id: string;
  division_id: string;
  category_id: string;
  period_id: string;
  allocated_amount: number;
  used_amount: number;
  created_at: string;
  updated_at: string;
  divisions?: { code: string; name: string };
  cost_categories?: { code: string; name: string };
  budget_periods?: { name: string; year: number };
}

export interface BudgetPeriod {
  id: string;
  name: string;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
}

export function useBudgetPlanning() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch budget periods
  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ['budget_periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_periods')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      return data as BudgetPeriod[];
    },
  });

  // Fetch division budgets with relations
  const { data: budgets, isLoading: budgetsLoading, refetch } = useQuery({
    queryKey: ['division_budgets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('division_budgets')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          budget_periods (name, year)
        `)
        .order('divisions(name)', { ascending: true });

      if (error) throw error;
      return data as unknown as DivisionBudget[];
    },
  });

  // Fetch divisions
  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['cost_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Create budget allocation
  const createBudget = useMutation({
    mutationFn: async ({
      divisionId,
      categoryId,
      periodId,
      allocatedAmount,
    }: {
      divisionId: string;
      categoryId: string;
      periodId: string;
      allocatedAmount: number;
    }) => {
      const { data, error } = await supabase
        .from('division_budgets')
        .insert({
          division_id: divisionId,
          category_id: categoryId,
          period_id: periodId,
          allocated_amount: allocatedAmount,
          used_amount: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['division_budgets'] });
      toast({
        title: 'Berhasil',
        description: 'Alokasi anggaran berhasil dibuat',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update budget allocation
  const updateBudget = useMutation({
    mutationFn: async ({
      budgetId,
      allocatedAmount,
    }: {
      budgetId: string;
      allocatedAmount: number;
    }) => {
      const { data, error } = await supabase
        .from('division_budgets')
        .update({
          allocated_amount: allocatedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', budgetId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['division_budgets'] });
      toast({
        title: 'Berhasil',
        description: 'Alokasi anggaran berhasil diperbarui',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Calculate totals
  const activePeriod = periods?.find(p => p.is_active);
  const activeBudgets = budgets?.filter(b => b.period_id === activePeriod?.id) || [];
  const totalAllocated = activeBudgets.reduce((sum, b) => sum + b.allocated_amount, 0);
  const totalUsed = activeBudgets.reduce((sum, b) => sum + b.used_amount, 0);
  const totalRemaining = totalAllocated - totalUsed;

  return {
    periods,
    budgets,
    divisions,
    categories,
    activePeriod,
    isLoading: periodsLoading || budgetsLoading,
    refetch,
    createBudget,
    updateBudget,
    totalAllocated,
    totalUsed,
    totalRemaining,
  };
}
