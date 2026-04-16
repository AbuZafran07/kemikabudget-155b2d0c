import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface DashboardKpis {
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  pendingApprovals: number;
  pendingPayments: number;
  overdueApprovals: number;
  overduePayments: number;
  thisMonthRequests: number;
}

export interface CategorySpend {
  name: string;
  value: number;
  color: string;
}

export interface PendingItem {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'settled' | 'cancelled';
  requestNumber: string;
  time: string;
  amount: number;
}

const CATEGORY_COLORS = [
  'hsl(152, 60%, 28%)',
  'hsl(43, 75%, 50%)',
  'hsl(150, 30%, 60%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(200, 70%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(170, 60%, 40%)',
];

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  return `${diffDays} hari lalu`;
}

export function useDashboard() {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdminOrFinance = role === 'super_admin' || role === 'finance';

  // Set up real-time subscriptions for dashboard updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
        },
        () => {
          // Invalidate dashboard queries on any request change
          queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-pending-approvals'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-pending-payments'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-category-spend'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_advances',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-pending-payments'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medical_claims',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-pending-payments'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'division_budgets',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-monthly-data'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Get KPIs
  const { data: kpis, isLoading: isLoadingKpis } = useQuery({
    queryKey: ['dashboard-kpis', role, profile?.division_id],
    queryFn: async (): Promise<DashboardKpis> => {
      // Get budget totals
      let budgetQuery = supabase
        .from('division_budgets')
        .select('allocated_amount, used_amount');

      if (!isSuperAdminOrFinance && profile?.division_id) {
        budgetQuery = budgetQuery.eq('division_id', profile.division_id);
      }

      const { data: budgets } = await budgetQuery;
      
      const totalBudget = budgets?.reduce((sum, b) => sum + Number(b.allocated_amount), 0) || 0;
      const usedBudget = budgets?.reduce((sum, b) => sum + Number(b.used_amount), 0) || 0;
      const remainingBudget = totalBudget - usedBudget;

      // Get pending approvals (submitted requests)
      let approvalsQuery = supabase
        .from('requests')
        .select('id, submitted_at', { count: 'exact' })
        .in('status', ['submitted', 'under_review']);

      if (!isSuperAdminOrFinance && profile?.division_id) {
        approvalsQuery = approvalsQuery.eq('division_id', profile.division_id);
      }

      const { count: pendingApprovals, data: pendingApprovalsData } = await approvalsQuery;

      // Get pending payments (approved requests not yet paid) - includes all 3 types
      let paymentsQuery = supabase
        .from('requests')
        .select('id, approved_at', { count: 'exact' })
        .eq('status', 'approved');

      if (!isSuperAdminOrFinance && profile?.division_id) {
        paymentsQuery = paymentsQuery.eq('division_id', profile.division_id);
      }

      const { count: pendingRequestPayments, data: pendingPaymentsData } = await paymentsQuery;

      // Also count Cash Advances ready to pay
      const { count: pendingCAPayments } = await supabase
        .from('cash_advances')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      // Also count Medical Claims ready to pay
      const { count: pendingMedicalPayments } = await supabase
        .from('medical_claims')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      const pendingPayments = (pendingRequestPayments || 0) + (pendingCAPayments || 0) + (pendingMedicalPayments || 0);

      // Calculate overdue (SLA = 3 days)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const overdueApprovals = pendingApprovalsData?.filter(
        r => r.submitted_at && new Date(r.submitted_at) < threeDaysAgo
      ).length || 0;

      const overduePayments = pendingPaymentsData?.filter(
        r => r.approved_at && new Date(r.approved_at) < threeDaysAgo
      ).length || 0;

      // Get this month's requests
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      let monthQuery = supabase
        .from('requests')
        .select('id', { count: 'exact' })
        .gte('created_at', startOfMonth.toISOString());

      if (!isSuperAdminOrFinance && profile?.division_id) {
        monthQuery = monthQuery.eq('division_id', profile.division_id);
      }

      const { count: thisMonthRequests } = await monthQuery;

      return {
        totalBudget,
        usedBudget,
        remainingBudget,
        pendingApprovals: pendingApprovals || 0,
        pendingPayments: pendingPayments || 0,
        overdueApprovals,
        overduePayments,
        thisMonthRequests: thisMonthRequests || 0,
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get expense by category
  const { data: categorySpend = [] } = useQuery({
    queryKey: ['dashboard-category-spend', role, profile?.division_id],
    queryFn: async (): Promise<CategorySpend[]> => {
      // Fetch requests
      let query = supabase
        .from('requests')
        .select(`
          amount,
          category:cost_categories(name)
        `)
        .in('status', ['approved', 'paid', 'settled']);

      if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data: requests } = await query;

      // Also fetch Cash Advances (category is on items, not CA itself)
      let caQuery = supabase
        .from('cash_advances')
        .select(`
          id,
          total_amount,
          total_realized,
          status
        `)
        .in('status', ['approved', 'paid', 'partially_settled', 'settled']);

      if (!isSuperAdminOrFinance && profile?.division_id) {
        caQuery = caQuery.eq('division_id', profile.division_id);
      }

      const { data: cashAdvances } = await caQuery;

      // Fetch CA items with categories
      let caCategoryAmounts: { catName: string; amount: number }[] = [];
      if (cashAdvances && cashAdvances.length > 0) {
        const caIds = cashAdvances.map(ca => ca.id);
        const { data: caItems } = await supabase
          .from('cash_advance_items')
          .select('cash_advance_id, amount, category:cost_categories(name)')
          .in('cash_advance_id', caIds);

        // For settled CAs, scale item amounts proportionally to total_realized
        caItems?.forEach((item: any) => {
          const ca = cashAdvances.find(c => c.id === item.cash_advance_id);
          if (!ca) return;
          const catName = (item.category as any)?.name || 'Lainnya';
          const isSettled = ca.status === 'settled' || ca.status === 'partially_settled';
          // Use item amount as-is (proportional scaling would be complex; item-level is accurate enough)
          caCategoryAmounts.push({ catName, amount: Number(item.amount) });
        });
      }

      // Group by category
      const categoryTotals: Record<string, number> = {};
      requests?.forEach(r => {
        const catName = (r.category as any)?.name || 'Lainnya';
        categoryTotals[catName] = (categoryTotals[catName] || 0) + Number(r.amount);
      });

      caCategoryAmounts.forEach(({ catName, amount }) => {
        categoryTotals[catName] = (categoryTotals[catName] || 0) + amount;
      });

      return Object.entries(categoryTotals)
        .map(([name, value], idx) => ({
          name,
          value,
          color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    },
    enabled: !!user,
  });

  // Get pending approval items
  const { data: pendingApprovalItems = [] } = useQuery({
    queryKey: ['dashboard-pending-approvals', role],
    queryFn: async (): Promise<PendingItem[]> => {
      const { data } = await supabase
        .from('requests')
        .select(`
          id,
          description,
          amount,
          request_number,
          status,
          submitted_at,
          division:divisions(name)
        `)
        .in('status', ['submitted', 'under_review'])
        .order('submitted_at', { ascending: false })
        .limit(10);

      return (data || []).map(r => ({
        id: r.id,
        title: r.description.substring(0, 50) + (r.description.length > 50 ? '...' : ''),
        description: `${(r.division as any)?.name || 'Unknown'} - Rp ${Number(r.amount).toLocaleString('id-ID')}`,
        status: r.status as any,
        requestNumber: r.request_number,
        time: r.submitted_at ? formatTimeAgo(r.submitted_at) : 'Baru',
        amount: Number(r.amount),
      }));
    },
    enabled: !!user && role === 'super_admin',
  });

  // Get pending payment items - includes Requests, Cash Advances, and Medical Claims
  const { data: pendingPaymentItems = [] } = useQuery({
    queryKey: ['dashboard-pending-payments', role],
    queryFn: async (): Promise<PendingItem[]> => {
      const items: PendingItem[] = [];

      // 1. Approved Requests
      const { data: requests } = await supabase
        .from('requests')
        .select(`
          id,
          description,
          amount,
          request_number,
          status,
          approved_at,
          division:divisions(name)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(5);

      requests?.forEach(r => {
        items.push({
          id: r.id,
          title: r.description.substring(0, 50) + (r.description.length > 50 ? '...' : ''),
          description: `${(r.division as any)?.name || 'Unknown'} - Rp ${Number(r.amount).toLocaleString('id-ID')}`,
          status: r.status as any,
          requestNumber: r.request_number,
          time: r.approved_at ? formatTimeAgo(r.approved_at) : 'Baru',
          amount: Number(r.amount),
        });
      });

      // 2. Approved Cash Advances
      const { data: cashAdvances } = await supabase
        .from('cash_advances')
        .select(`
          id,
          purpose,
          total_amount,
          ca_number,
          status,
          approved_at,
          division:divisions(name)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(5);

      cashAdvances?.forEach(ca => {
        items.push({
          id: ca.id,
          title: ca.purpose.substring(0, 50) + (ca.purpose.length > 50 ? '...' : ''),
          description: `${(ca.division as any)?.name || 'Unknown'} - Rp ${Number(ca.total_amount).toLocaleString('id-ID')}`,
          status: ca.status as any,
          requestNumber: ca.ca_number,
          time: ca.approved_at ? formatTimeAgo(ca.approved_at) : 'Baru',
          amount: Number(ca.total_amount),
        });
      });

      // 3. Approved Medical Claims
      const { data: medicalClaims } = await supabase
        .from('medical_claims')
        .select(`
          id,
          patient_name,
          claim_amount,
          approved_amount,
          claim_number,
          status,
          approved_at,
          employee:profiles_secure!medical_claims_employee_id_fkey(full_name)
        `)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(5);

      medicalClaims?.forEach(mc => {
        const amount = mc.approved_amount || mc.claim_amount;
        items.push({
          id: mc.id,
          title: `${(mc.employee as any)?.full_name || 'Unknown'} - ${mc.patient_name}`,
          description: `Medical - Rp ${Number(amount).toLocaleString('id-ID')}`,
          status: mc.status as any,
          requestNumber: mc.claim_number,
          time: mc.approved_at ? formatTimeAgo(mc.approved_at) : 'Baru',
          amount: Number(amount),
        });
      });

      // Sort by time (most recent first) and limit to 10
      return items
        .sort((a, b) => {
          // Extract time number for sorting
          const getTimeValue = (time: string) => {
            if (time === 'Baru') return 0;
            const match = time.match(/(\d+)/);
            if (!match) return 999;
            const num = parseInt(match[1]);
            if (time.includes('menit')) return num;
            if (time.includes('jam')) return num * 60;
            return num * 60 * 24;
          };
          return getTimeValue(a.time) - getTimeValue(b.time);
        })
        .slice(0, 10);
    },
    enabled: !!user && (role === 'super_admin' || role === 'finance'),
  });

  // Get monthly budget data for chart
  const { data: monthlyData = [] } = useQuery({
    queryKey: ['dashboard-monthly-data', role, profile?.division_id],
    queryFn: async () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const currentYear = new Date().getFullYear();
      
      // Get requests for current year
      let query = supabase
        .from('requests')
        .select('amount, status, paid_at, approved_at, created_at')
        .gte('created_at', `${currentYear}-01-01`)
        .lte('created_at', `${currentYear}-12-31`);

      if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data: requests } = await query;

      // Get Cash Advances for current year
      let caQuery = supabase
        .from('cash_advances')
        .select('total_amount, total_realized, status, paid_at, approved_at, created_at')
        .gte('created_at', `${currentYear}-01-01`)
        .lte('created_at', `${currentYear}-12-31`);

      if (!isSuperAdminOrFinance && profile?.division_id) {
        caQuery = caQuery.eq('division_id', profile.division_id);
      }

      const { data: cashAdvances } = await caQuery;

      // Get budget allocation
      let budgetQuery = supabase
        .from('division_budgets')
        .select('allocated_amount');

      if (!isSuperAdminOrFinance && profile?.division_id) {
        budgetQuery = budgetQuery.eq('division_id', profile.division_id);
      }

      const { data: budgets } = await budgetQuery;
      const totalBudget = budgets?.reduce((sum, b) => sum + Number(b.allocated_amount), 0) || 0;
      const monthlyBudget = totalBudget / 12;

      // Calculate monthly data
      return months.map((month, idx) => {
        const monthRequests = requests?.filter(r => {
          const date = new Date(r.created_at);
          return date.getMonth() === idx;
        }) || [];

        const monthCAs = cashAdvances?.filter(ca => {
          const date = new Date(ca.created_at);
          return date.getMonth() === idx;
        }) || [];

        const actualReq = monthRequests
          .filter(r => ['paid', 'settled'].includes(r.status))
          .reduce((sum, r) => sum + Number(r.amount), 0);

        const actualCA = monthCAs
          .filter(ca => ['paid', 'settled', 'partially_settled'].includes(ca.status))
          .reduce((sum, ca) => {
            const isSettled = ca.status === 'settled' || ca.status === 'partially_settled';
            return sum + (isSettled && ca.total_realized ? Number(ca.total_realized) : Number(ca.total_amount));
          }, 0);

        const commitmentReq = monthRequests
          .filter(r => ['approved'].includes(r.status))
          .reduce((sum, r) => sum + Number(r.amount), 0);

        const commitmentCA = monthCAs
          .filter(ca => ['approved'].includes(ca.status))
          .reduce((sum, ca) => sum + Number(ca.total_amount), 0);

        return {
          month,
          budget: monthlyBudget,
          actual: actualReq + actualCA,
          commitment: commitmentReq + commitmentCA,
        };
      });
    },
    enabled: !!user,
  });

  return {
    kpis: kpis || {
      totalBudget: 0,
      usedBudget: 0,
      remainingBudget: 0,
      pendingApprovals: 0,
      pendingPayments: 0,
      overdueApprovals: 0,
      overduePayments: 0,
      thisMonthRequests: 0,
    },
    categorySpend,
    pendingApprovalItems,
    pendingPaymentItems,
    monthlyData,
    isLoadingKpis,
  };
}