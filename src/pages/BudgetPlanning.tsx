import { useState } from "react";
import {
  Search,
  Plus,
  Edit2,
  TrendingUp,
  TrendingDown,
  Calculator,
  Building2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBudgetPlanning, DivisionBudget } from "@/hooks/useBudgetPlanning";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const BudgetPlanning = () => {
  const {
    budgets,
    divisions,
    categories,
    periods,
    activePeriod,
    isLoading,
    createBudget,
    updateBudget,
    totalAllocated,
    totalUsed,
    totalRemaining,
  } = useBudgetPlanning();

  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("active");

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<DivisionBudget | null>(null);

  // Form states
  const [formDivisionId, setFormDivisionId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");

  const filteredBudgets = budgets?.filter((budget) => {
    const matchesSearch =
      budget.divisions?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      budget.cost_categories?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDivision =
      divisionFilter === "all" || budget.division_id === divisionFilter;
    const matchesPeriod =
      periodFilter === "active"
        ? budget.period_id === activePeriod?.id
        : budget.period_id === periodFilter;
    return matchesSearch && matchesDivision && matchesPeriod;
  }) || [];

  // Group by division
  const groupedBudgets = filteredBudgets.reduce((acc, budget) => {
    const divisionName = budget.divisions?.name || 'Unknown';
    if (!acc[divisionName]) {
      acc[divisionName] = [];
    }
    acc[divisionName].push(budget);
    return acc;
  }, {} as Record<string, DivisionBudget[]>);

  const handleCreate = async () => {
    if (!formDivisionId || !formCategoryId || !formAmount || !activePeriod) return;

    await createBudget.mutateAsync({
      divisionId: formDivisionId,
      categoryId: formCategoryId,
      periodId: activePeriod.id,
      allocatedAmount: parseFloat(formAmount),
    });

    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleEdit = (budget: DivisionBudget) => {
    setEditBudget(budget);
    setFormAmount(budget.allocated_amount.toString());
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editBudget || !formAmount) return;

    await updateBudget.mutateAsync({
      budgetId: editBudget.id,
      allocatedAmount: parseFloat(formAmount),
    });

    setIsEditDialogOpen(false);
    setEditBudget(null);
    resetForm();
  };

  const resetForm = () => {
    setFormDivisionId("");
    setFormCategoryId("");
    setFormAmount("");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Rencana Anggaran</h1>
            {activePeriod && (
              <Badge className="bg-primary text-primary-foreground gap-1">
                <Calendar className="h-3 w-3" />
                {activePeriod.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Kelola alokasi anggaran per divisi dan kategori
          </p>
        </div>
        <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Alokasi
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">Total Alokasi</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAllocated)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground">Terpakai</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalUsed)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-success/10">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <span className="text-sm text-muted-foreground">Sisa Anggaran</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRemaining)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari divisi atau kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Divisi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Divisi</SelectItem>
              {divisions?.map((div) => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Periode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Periode Aktif</SelectItem>
              {periods?.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Budget Cards by Division */}
      <div className="space-y-6">
        {Object.entries(groupedBudgets).map(([divisionName, divBudgets]) => {
          const divTotal = divBudgets.reduce((sum, b) => sum + b.allocated_amount, 0);
          const divUsed = divBudgets.reduce((sum, b) => sum + b.used_amount, 0);
          const divPercent = divTotal > 0 ? (divUsed / divTotal) * 100 : 0;

          return (
            <div key={divisionName} className="bg-card rounded-xl border border-border overflow-hidden">
              {/* Division Header */}
              <div className="p-4 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">{divisionName}</h3>
                    <Badge variant="outline">{divBudgets.length} kategori</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{formatCurrency(divTotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      Terpakai {formatCurrency(divUsed)} ({divPercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
                <Progress value={divPercent} className="mt-3 h-2" />
              </div>

              {/* Category Budgets */}
              <div className="divide-y divide-border">
                {divBudgets.map((budget) => {
                  const usedPercent = budget.allocated_amount > 0
                    ? (budget.used_amount / budget.allocated_amount) * 100
                    : 0;
                  const remaining = budget.allocated_amount - budget.used_amount;

                  return (
                    <div key={budget.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                      <div className="flex-1">
                        <p className="font-medium">{budget.cost_categories?.name}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>Alokasi: {formatCurrency(budget.allocated_amount)}</span>
                          <span>Terpakai: {formatCurrency(budget.used_amount)}</span>
                          <span className={remaining < 0 ? 'text-destructive' : 'text-success'}>
                            Sisa: {formatCurrency(remaining)}
                          </span>
                        </div>
                        <Progress value={usedPercent} className="mt-2 h-1.5 w-48" />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(budget)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filteredBudgets.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Calculator className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Belum Ada Alokasi Anggaran
          </h3>
          <p className="text-muted-foreground mb-4">
            Mulai dengan menambahkan alokasi anggaran untuk divisi dan kategori.
          </p>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Tambah Alokasi
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Alokasi Anggaran</DialogTitle>
            <DialogDescription>
              Buat alokasi anggaran baru untuk periode {activePeriod?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Divisi</Label>
              <Select value={formDivisionId} onValueChange={setFormDivisionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih divisi" />
                </SelectTrigger>
                <SelectContent>
                  {divisions?.map((div) => (
                    <SelectItem key={div.id} value={div.id}>
                      {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jumlah Alokasi (IDR)</Label>
              <Input
                type="number"
                placeholder="100000000"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createBudget.isPending || !formDivisionId || !formCategoryId || !formAmount}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Alokasi Anggaran</DialogTitle>
            <DialogDescription>
              {editBudget && (
                <>
                  {editBudget.divisions?.name} - {editBudget.cost_categories?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Jumlah Alokasi (IDR)</Label>
              <Input
                type="number"
                placeholder="100000000"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            {editBudget && editBudget.used_amount > 0 && (
              <p className="text-sm text-warning">
                Perhatian: Sudah terpakai {formatCurrency(editBudget.used_amount)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleUpdate} disabled={updateBudget.isPending || !formAmount}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetPlanning;
