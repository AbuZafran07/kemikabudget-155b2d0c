import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import KpiCard from "@/components/dashboard/KpiCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BudgetChart from "@/components/dashboard/BudgetChart";
import ExpenseByCategory from "@/components/dashboard/ExpenseByCategory";
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  FileText,
  PiggyBank,
} from "lucide-react";

// Mock data - will be replaced with real data from API
const kpiData = {
  totalBudget: 1500000000,
  remaining: 1250000000,
  actualPaid: 180000000,
  pendingApprovals: 5,
  pendingPayments: 3,
  overdueApprovals: 1,
  overduePayments: 0,
  utilization: 17,
};

const monthlyData = [
  { month: "Jan", budget: 125000000, actual: 98000000, commitment: 15000000 },
  { month: "Feb", budget: 125000000, actual: 82000000, commitment: 22000000 },
  { month: "Mar", budget: 125000000, actual: 0, commitment: 35000000 },
  { month: "Apr", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Mei", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Jun", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Jul", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Agu", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Sep", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Okt", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Nov", budget: 125000000, actual: 0, commitment: 0 },
  { month: "Des", budget: 125000000, actual: 0, commitment: 0 },
];

const categoryData = [
  { name: "Transport & Perdin", value: 45000000, color: "hsl(152, 60%, 28%)" },
  { name: "Sales & Marketing", value: 38000000, color: "hsl(43, 75%, 50%)" },
  { name: "Operasional", value: 32000000, color: "hsl(150, 30%, 60%)" },
  { name: "Technical", value: 28000000, color: "hsl(38, 92%, 50%)" },
  { name: "HR & GA", value: 37000000, color: "hsl(0, 72%, 51%)" },
];

const pendingApprovals = [
  {
    id: "1",
    title: "Transport Meeting Client",
    description: "HRGA - Perjalanan ke Surabaya",
    status: "submitted" as const,
    requestNumber: "REQ-2026-0045",
    time: "2 jam lalu",
  },
  {
    id: "2",
    title: "Pembelian ATK Kantor",
    description: "PURCHASING - Kertas dan alat tulis",
    status: "submitted" as const,
    requestNumber: "REQ-2026-0044",
    time: "3 jam lalu",
  },
  {
    id: "3",
    title: "Training Karyawan",
    description: "TECH SALES - Sertifikasi produk",
    status: "under_review" as const,
    requestNumber: "REQ-2026-0043",
    time: "5 jam lalu",
  },
];

const toPayRequests = [
  {
    id: "4",
    title: "Invoice Vendor ABC",
    description: "MARKETING - Material promosi",
    status: "approved" as const,
    requestNumber: "REQ-2026-0040",
    time: "1 hari lalu",
  },
  {
    id: "5",
    title: "Maintenance AC Kantor",
    description: "HRGA - Service AC ruangan",
    status: "approved" as const,
    requestNumber: "REQ-2026-0038",
    time: "2 hari lalu",
  },
];

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
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Super Admin
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Overview seluruh divisi
          </p>
        </div>
        <Button className="gap-2 shadow-primary">
          <Plus className="h-4 w-4" />
          Buat Pengajuan
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Budget"
          value={formatCurrency(kpiData.totalBudget)}
          subtitle="Tahun 2026"
          icon={Wallet}
          variant="primary"
        />
        <KpiCard
          title="Commitment"
          value={formatCurrency(kpiData.actualPaid * 0.4)}
          subtitle="Dalam proses"
          icon={Clock}
          variant="default"
        />
        <KpiCard
          title="Actual Expense"
          value={formatCurrency(kpiData.actualPaid)}
          subtitle="Sudah dibayar"
          icon={TrendingUp}
          variant="default"
        />
        <KpiCard
          title="Remaining"
          value={formatCurrency(kpiData.remaining)}
          subtitle="Sisa anggaran"
          icon={PiggyBank}
          variant="success"
        />
        <KpiCard
          title="Utilization"
          value={`${kpiData.utilization}%`}
          subtitle="Penggunaan budget"
          icon={CheckCircle}
          variant="default"
        />
        <KpiCard
          title="Pending Approval"
          value={kpiData.pendingApprovals}
          subtitle="Menunggu persetujuan"
          icon={FileText}
          variant={kpiData.overdueApprovals > 0 ? "warning" : "default"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BudgetChart data={monthlyData} className="lg:col-span-2" />
        <ExpenseByCategory data={categoryData} />
      </div>

      {/* Activity Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity
          title="Menunggu Persetujuan"
          items={pendingApprovals}
          emptyMessage="Semua pengajuan sudah diproses!"
        />
        <RecentActivity
          title="Siap Dibayar"
          items={toPayRequests}
          emptyMessage="Tidak ada pembayaran menunggu"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overdue Approvals</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpiData.overdueApprovals}
              </p>
            </div>
            {kpiData.overdueApprovals > 0 ? (
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
                {kpiData.overduePayments}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-success/10">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">To Pay Today</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpiData.pendingPayments}
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
              <p className="text-2xl font-bold text-foreground mt-1">12</p>
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
