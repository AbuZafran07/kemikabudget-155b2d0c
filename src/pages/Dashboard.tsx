import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import KpiCard from "@/components/dashboard/KpiCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BudgetChart from "@/components/dashboard/BudgetChart";
import ExpenseByCategory from "@/components/dashboard/ExpenseByCategory";
import { useDashboard } from "@/hooks/useDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const {
    kpis,
    categorySpend,
    pendingApprovalItems,
    pendingPaymentItems,
    monthlyData,
    isLoadingKpis,
  } = useDashboard();

  const isSuperAdmin = role === 'super_admin';
  const isFinance = role === 'finance';
  const utilization = kpis.totalBudget > 0 
    ? Math.round((kpis.usedBudget / kpis.totalBudget) * 100) 
    : 0;

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
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary capitalize">
              {role?.replace('_', ' ') || 'User'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {isSuperAdmin || isFinance ? 'Overview seluruh divisi' : `Overview ${profile?.full_name || 'divisi Anda'}`}
          </p>
        </div>
        <Button className="gap-2 shadow-primary" onClick={() => navigate('/requests')}>
          <Plus className="h-4 w-4" />
          Buat Pengajuan
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Budget"
          value={formatCurrency(kpis.totalBudget)}
          subtitle={`Tahun ${new Date().getFullYear()}`}
          icon={Wallet}
          variant="primary"
        />
        <KpiCard
          title="Budget Terpakai"
          value={formatCurrency(kpis.usedBudget)}
          subtitle="Sudah disetujui"
          icon={TrendingUp}
          variant="default"
        />
        <KpiCard
          title="Sisa Budget"
          value={formatCurrency(kpis.remainingBudget)}
          subtitle="Tersedia"
          icon={PiggyBank}
          variant="success"
        />
        <KpiCard
          title="Utilisasi"
          value={`${utilization}%`}
          subtitle="Penggunaan budget"
          icon={CheckCircle}
          variant="default"
        />
        <KpiCard
          title="Pending Approval"
          value={kpis.pendingApprovals}
          subtitle="Menunggu persetujuan"
          icon={Clock}
          variant={kpis.overdueApprovals > 0 ? "warning" : "default"}
        />
        <KpiCard
          title="Pending Payment"
          value={kpis.pendingPayments}
          subtitle="Siap dibayar"
          icon={CreditCard}
          variant={kpis.overduePayments > 0 ? "warning" : "default"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BudgetChart data={monthlyData} className="lg:col-span-2" />
        <ExpenseByCategory data={categorySpend} />
      </div>

      {/* Activity Lists - Only for Super Admin and Finance */}
      {(isSuperAdmin || isFinance) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isSuperAdmin && (
            <RecentActivity
              title="Menunggu Persetujuan"
              items={pendingApprovalItems}
              emptyMessage="Semua pengajuan sudah diproses!"
            />
          )}
          <RecentActivity
            title="Siap Dibayar"
            items={pendingPaymentItems}
            emptyMessage="Tidak ada pembayaran menunggu"
          />
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overdue Approvals</p>
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
              <p className="text-sm text-muted-foreground">Overdue Payments</p>
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
              <p className="text-sm text-muted-foreground">To Pay Today</p>
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
              <p className="text-sm text-muted-foreground">This Month Requests</p>
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
    </div>
  );
};

export default Dashboard;