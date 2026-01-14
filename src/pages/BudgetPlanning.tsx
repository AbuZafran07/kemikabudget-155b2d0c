import { useState } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  TrendingUp,
  TrendingDown,
  Calculator,
  Building2,
  Calendar,
  X,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useBudgetPlanning, DivisionBudget } from "@/hooks/useBudgetPlanning";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";

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
    deleteBudget,
    totalAllocated,
    totalUsed,
    totalRemaining,
  } = useBudgetPlanning();

  const { t, language } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("active");

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<DivisionBudget | null>(null);

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
    setSelectedBudget(budget);
    setFormAmount(budget.allocated_amount.toString());
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedBudget || !formAmount) return;

    await updateBudget.mutateAsync({
      budgetId: selectedBudget.id,
      allocatedAmount: parseFloat(formAmount),
    });

    setIsEditDialogOpen(false);
    setSelectedBudget(null);
    resetForm();
  };

  const handleDeleteClick = (budget: DivisionBudget) => {
    setSelectedBudget(budget);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedBudget) return;

    await deleteBudget.mutateAsync(selectedBudget.id);

    setIsDeleteDialogOpen(false);
    setSelectedBudget(null);
  };

  const handleViewDetail = (budget: DivisionBudget) => {
    setSelectedBudget(budget);
    setIsDetailSheetOpen(true);
  };

  const resetForm = () => {
    setFormDivisionId("");
    setFormCategoryId("");
    setFormAmount("");
  };

  const dateLocale = language === 'id' ? idLocale : enUS;

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
            <h1 className="text-2xl font-bold text-foreground">{t('budgetPlanning.title')}</h1>
            {activePeriod && (
              <Badge className="bg-primary text-primary-foreground gap-1">
                <Calendar className="h-3 w-3" />
                {activePeriod.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {t('budgetPlanning.description')}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('budgetPlanning.addAllocation')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">{t('budgetPlanning.totalAllocation')}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAllocated)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground">{t('budgetPlanning.used')}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalUsed)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-success/10">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <span className="text-sm text-muted-foreground">{t('budgetPlanning.remaining')}</span>
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
              placeholder={t('budgetPlanning.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('users.division')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('budgetPlanning.allDivisions')}</SelectItem>
              {divisions?.map((div) => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={language === 'id' ? 'Periode' : 'Period'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('budgetPlanning.activePeriod')}</SelectItem>
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
                    <Badge variant="outline">{divBudgets.length} {t('budgetPlanning.categories')}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{formatCurrency(divTotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('budgetPlanning.used')} {formatCurrency(divUsed)} ({divPercent.toFixed(1)}%)
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
                          <span>{language === 'id' ? 'Alokasi' : 'Allocated'}: {formatCurrency(budget.allocated_amount)}</span>
                          <span>{t('budgetPlanning.used')}: {formatCurrency(budget.used_amount)}</span>
                          <span className={remaining < 0 ? 'text-destructive' : 'text-success'}>
                            {t('budgetPlanning.remaining')}: {formatCurrency(remaining)}
                          </span>
                        </div>
                        <Progress value={usedPercent} className="mt-2 h-1.5 w-48" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetail(budget)}
                          title={language === 'id' ? 'Lihat Detail' : 'View Detail'}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(budget)}
                          title={language === 'id' ? 'Edit' : 'Edit'}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(budget)}
                          title={language === 'id' ? 'Hapus' : 'Delete'}
                          disabled={budget.used_amount > 0}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
            {language === 'id' ? 'Belum Ada Alokasi Anggaran' : 'No Budget Allocations Yet'}
          </h3>
          <p className="text-muted-foreground mb-4">
            {language === 'id' 
              ? 'Mulai dengan menambahkan alokasi anggaran untuk divisi dan kategori.'
              : 'Start by adding budget allocations for divisions and categories.'
            }
          </p>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('budgetPlanning.addAllocation')}
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('budgetPlanning.addAllocation')}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? `Buat alokasi anggaran baru untuk periode ${activePeriod?.name}`
                : `Create new budget allocation for period ${activePeriod?.name}`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('users.division')}</Label>
              <Select value={formDivisionId} onValueChange={setFormDivisionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.selectDivision')} />
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
              <Label>{t('requests.category')}</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih kategori' : 'Select category'} />
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
              <Label>{language === 'id' ? 'Jumlah Alokasi (IDR)' : 'Allocation Amount (IDR)'}</Label>
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
              {t('action.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createBudget.isPending || !formDivisionId || !formCategoryId || !formAmount}
            >
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Edit Alokasi Anggaran' : 'Edit Budget Allocation'}</DialogTitle>
            <DialogDescription>
              {selectedBudget && (
                <>
                  {selectedBudget.divisions?.name} - {selectedBudget.cost_categories?.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'id' ? 'Jumlah Alokasi (IDR)' : 'Allocation Amount (IDR)'}</Label>
              <Input
                type="number"
                placeholder="100000000"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            {selectedBudget && selectedBudget.used_amount > 0 && (
              <p className="text-sm text-warning">
                {language === 'id' 
                  ? `Perhatian: Sudah terpakai ${formatCurrency(selectedBudget.used_amount)}`
                  : `Warning: Already used ${formatCurrency(selectedBudget.used_amount)}`
                }
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={updateBudget.isPending || !formAmount}>
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'id' ? 'Hapus Alokasi Anggaran?' : 'Delete Budget Allocation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedBudget && (
                <>
                  {language === 'id' 
                    ? `Anda akan menghapus alokasi anggaran untuk ${selectedBudget.divisions?.name} - ${selectedBudget.cost_categories?.name}. Tindakan ini tidak dapat dibatalkan.`
                    : `You are about to delete budget allocation for ${selectedBudget.divisions?.name} - ${selectedBudget.cost_categories?.name}. This action cannot be undone.`
                  }
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {language === 'id' ? 'Hapus' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Sheet */}
      <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {language === 'id' ? 'Detail Alokasi Anggaran' : 'Budget Allocation Detail'}
            </SheetTitle>
            <SheetDescription>
              {selectedBudget && (
                <>
                  {selectedBudget.divisions?.name} - {selectedBudget.cost_categories?.name}
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          {selectedBudget && (
            <div className="mt-6 space-y-6">
              {/* Division & Category Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('users.division')}</p>
                    <p className="font-medium">{selectedBudget.divisions?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedBudget.divisions?.code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Calculator className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('requests.category')}</p>
                    <p className="font-medium">{selectedBudget.cost_categories?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedBudget.cost_categories?.code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'id' ? 'Periode' : 'Period'}</p>
                    <p className="font-medium">{selectedBudget.budget_periods?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedBudget.budget_periods?.year}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Budget Summary */}
              <div className="space-y-4">
                <h4 className="font-semibold">{language === 'id' ? 'Ringkasan Anggaran' : 'Budget Summary'}</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">{language === 'id' ? 'Alokasi' : 'Allocated'}</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(selectedBudget.allocated_amount)}</p>
                  </div>
                  <div className="p-4 bg-destructive/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">{t('budgetPlanning.used')}</p>
                    <p className="text-xl font-bold text-destructive">{formatCurrency(selectedBudget.used_amount)}</p>
                  </div>
                </div>

                <div className="p-4 bg-success/10 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('budgetPlanning.remaining')}</p>
                  <p className="text-2xl font-bold text-success">
                    {formatCurrency(selectedBudget.allocated_amount - selectedBudget.used_amount)}
                  </p>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{language === 'id' ? 'Penggunaan' : 'Usage'}</span>
                    <span className="font-medium">
                      {selectedBudget.allocated_amount > 0 
                        ? ((selectedBudget.used_amount / selectedBudget.allocated_amount) * 100).toFixed(1) 
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={selectedBudget.allocated_amount > 0 
                      ? (selectedBudget.used_amount / selectedBudget.allocated_amount) * 100 
                      : 0
                    } 
                    className="h-3" 
                  />
                </div>
              </div>

              <Separator />

              {/* Metadata */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{language === 'id' ? 'Dibuat' : 'Created'}</span>
                  <span>{format(new Date(selectedBudget.created_at), 'dd MMM yyyy HH:mm', { locale: dateLocale })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{language === 'id' ? 'Terakhir Diubah' : 'Last Updated'}</span>
                  <span>{format(new Date(selectedBudget.updated_at), 'dd MMM yyyy HH:mm', { locale: dateLocale })}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsDetailSheetOpen(false);
                    handleEdit(selectedBudget);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  {language === 'id' ? 'Edit' : 'Edit'}
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={() => {
                    setIsDetailSheetOpen(false);
                    handleDeleteClick(selectedBudget);
                  }}
                  disabled={selectedBudget.used_amount > 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {language === 'id' ? 'Hapus' : 'Delete'}
                </Button>
              </div>
              {selectedBudget.used_amount > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {language === 'id' 
                    ? 'Tidak dapat dihapus karena sudah ada penggunaan anggaran.'
                    : 'Cannot be deleted because budget has been used.'
                  }
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BudgetPlanning;