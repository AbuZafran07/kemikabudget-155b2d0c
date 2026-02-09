import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import KpiCard from "@/components/dashboard/KpiCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BudgetChart from "@/components/dashboard/BudgetChart";
import ExpenseByCategory from "@/components/dashboard/ExpenseByCategory";
import TransactionDetailDialog from "@/components/dashboard/TransactionDetailDialog";
import PendingMedicalClaimsCard from "@/components/dashboard/PendingMedicalClaimsCard";
import { useDashboard } from "@/hooks/useDashboard";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  FileText,
  PiggyBank,
  Loader2,
} from "lucide-react";

const formatCurrency = (value: number) => {
  if (value >= 1000000000) {
    return `Rp ${(value / 1000000000).toFixed(1)}M`;
  }
  if (value >= 1000000) {
    return `Rp ${(value / 1000000).toFixed(0)}jt`;
  }
  return `Rp ${value.toLocaleString("id-ID")}`;
};

interface DrillDownState {
  open: boolean;
  type: 'category' | 'month' | null;
  value: string;
  dataType?: 'budget' | 'actual' | 'commitment';
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const { t } = useLanguage();
  
  // Enable realtime updates
  useDashboardRealtime();
  
  const {
    kpis,
    categorySpend,
    pendingApprovalItems,
    pendingPaymentItems,
    monthlyData,
    isLoadingKpis,
  } = useDashboard();

  const [drillDown, setDrillDown] = useState<DrillDownState>({
    open: false,
    type: null,
    value: '',
  });

  const isSuperAdmin = role === 'super_admin';
  const isFinance = role === 'finance';
  const isSuperAdminOrFinance = isSuperAdmin || isFinance;
  const utilization = kpis.totalBudget > 0 
    ? Math.round((kpis.usedBudget / kpis.totalBudget) * 100) 
    : 0;

  // Month name to number mapping
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5,
    'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11,
  };

  // Query for drill-down data
  const { data: drillDownTransactions = [], isLoading: isDrillDownLoading } = useQuery({
    queryKey: ['dashboard-drilldown', drillDown.type, drillDown.value, drillDown.dataType, profile?.division_id],
    queryFn: async () => {
      let query = supabase
        .from('requests')
        .select(`
          id,
          request_number,
          description,
          amount,
          status,
          created_at,
          division:divisions(name),
          category:cost_categories(name)
        `)
        .order('created_at', { ascending: false });

      if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      if (drillDown.type === 'category') {
        // Filter by category name
        const { data } = await query.in('status', ['approved', 'paid', 'settled']);
        return (data || [])
          .filter(r => (r.category as any)?.name === drillDown.value)
          .map(r => ({
            id: r.id,
            request_number: r.request_number,
            description: r.description,
            amount: Number(r.amount),
            status: r.status,
            division_name: (r.division as any)?.name,
            category_name: (r.category as any)?.name,
            created_at: r.created_at,
          }));
      } else if (drillDown.type === 'month') {
        const monthIndex = monthMap[drillDown.value];
        const currentYear = new Date().getFullYear();
        const startOfMonth = new Date(currentYear, monthIndex, 1);
        const endOfMonth = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59);

        query = query
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString());

        // Filter by data type
        if (drillDown.dataType === 'actual') {
          query = query.in('status', ['paid', 'settled']);
        } else if (drillDown.dataType === 'commitment') {
          query = query.eq('status', 'approved');
        }
        // 'budget' shows all for the month

        const { data } = await query;
        return (data || []).map(r => ({
          id: r.id,
          request_number: r.request_number,
          description: r.description,
          amount: Number(r.amount),
          status: r.status,
          division_name: (r.division as any)?.name,
          category_name: (r.category as any)?.name,
          created_at: r.created_at,
        }));
      }

      return [];
    },
    enabled: drillDown.open && !!drillDown.type,
  });

  const handleCategoryClick = (categoryName: string) => {
    setDrillDown({
      open: true,
      type: 'category',
      value: categoryName,
    });
  };

  const handleBarClick = (month: string, dataType: 'budget' | 'actual' | 'commitment') => {
    setDrillDown({
      open: true,
      type: 'month',
      value: month,
      dataType,
    });
  };

  const getDrillDownTitle = () => {
    if (drillDown.type === 'category') {
      return `${t('dashboard.expenseByCategory')}: ${drillDown.value}`;
    }
    if (drillDown.type === 'month') {
      const typeLabel = drillDown.dataType === 'actual' 
        ? 'Actual' 
        : drillDown.dataType === 'commitment' 
          ? 'Commitment' 
          : 'Budget';
      return `${typeLabel} - ${drillDown.value} ${new Date().getFullYear()}`;
    }
    return '';
  };

  const getDrillDownSubtitle = () => {
    if (drillDown.type === 'category') {
      return t('dashboard.transactionsByCategory');
    }
    if (drillDown.type === 'month') {
      return t('dashboard.transactionsByMonth');
    }
    return '';
  };

  if (isLoadingKpis) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{t('dashboard.title')}</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary capitalize">
              {role?.replace('_', ' ') || 'User'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {isSuperAdmin || isFinance ? t('dashboard.overviewAllDivisions') : `${t('dashboard.overview')} ${profile?.full_name || ''}`}
          </p>
        </div>
        <Button className="gap-2 shadow-primary" onClick={() => navigate('/requests')}>
          <Plus className="h-4 w-4" />
          {t('dashboard.createRequest')}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard
          title={t('dashboard.totalBudget')}
          value={formatCurrency(kpis.totalBudget)}
          subtitle={`${t('dashboard.year')} ${new Date().getFullYear()}`}
          icon={Wallet}
          variant="primary"
        />
        <KpiCard
          title={t('dashboard.usedBudget')}
          value={formatCurrency(kpis.usedBudget)}
          subtitle={t('dashboard.approved')}
          icon={TrendingUp}
          variant="default"
        />
        <KpiCard
          title={t('dashboard.remainingBudget')}
          value={formatCurrency(kpis.remainingBudget)}
          subtitle={t('dashboard.available')}
          icon={PiggyBank}
          variant="success"
        />
        <KpiCard
          title={t('dashboard.utilization')}
          value={`${utilization}%`}
          subtitle={t('dashboard.budgetUsage')}
          icon={CheckCircle}
          variant="default"
        />
        <KpiCard
          title={t('dashboard.pendingApprovals')}
          value={kpis.pendingApprovals}
          subtitle={t('dashboard.waitingApproval')}
          icon={Clock}
          variant={kpis.overdueApprovals > 0 ? "warning" : "default"}
        />
        <KpiCard
          title={t('dashboard.pendingPayments')}
          value={kpis.pendingPayments}
          subtitle={t('dashboard.readyToPay')}
          icon={CreditCard}
          variant={kpis.overduePayments > 0 ? "warning" : "default"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BudgetChart 
          data={monthlyData} 
          className="lg:col-span-2" 
          onBarClick={handleBarClick}
        />
        <ExpenseByCategory 
          data={categorySpend} 
          onCategoryClick={handleCategoryClick}
        />
      </div>

      {/* Activity Lists - Only for Super Admin and Finance */}
      {(isSuperAdmin || isFinance) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {isSuperAdmin && (
            <RecentActivity
              title={t('dashboard.waitingYourApproval')}
              items={pendingApprovalItems}
              emptyMessage={t('dashboard.allProcessed')}
            />
          )}
          <RecentActivity
            title={t('dashboard.readyToPay')}
            items={pendingPaymentItems}
            emptyMessage={t('dashboard.noPaymentsPending')}
          />
          <PendingMedicalClaimsCard />
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.overdueApprovals')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpis.overdueApprovals}
              </p>
            </div>
            {kpis.overdueApprovals > 0 ? (
              <div className="p-3 rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
            )}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.overduePayments')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpis.overduePayments}
              </p>
            </div>
            {kpis.overduePayments > 0 ? (
              <div className="p-3 rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
            )}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.toPayToday')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpis.pendingPayments}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-warning/10">
              <CreditCard className="h-5 w-5 text-warning" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.thisMonthRequests')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpis.thisMonthRequests}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Dialog */}
      <TransactionDetailDialog
        open={drillDown.open}
        onOpenChange={(open) => setDrillDown(prev => ({ ...prev, open }))}
        title={getDrillDownTitle()}
        subtitle={getDrillDownSubtitle()}
        transactions={drillDownTransactions}
        isLoading={isDrillDownLoading}
        filterType={drillDown.type || undefined}
        filterValue={drillDown.value}
      />
    </div>
  );
};

export default Dashboard;