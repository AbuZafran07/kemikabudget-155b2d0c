import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Building2,
  Upload,
  Download,
  Filter,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useBudgetPlanning, DivisionBudget } from "@/hooks/useBudgetPlanning";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { TablePagination } from "@/components/common/TablePagination";

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
  } = useBudgetPlanning();

  const { t, language } = useLanguage();

  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(activePeriod?.id || "active");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<DivisionBudget | null>(null);

  // Form states
  const [formPeriodId, setFormPeriodId] = useState(activePeriod?.id || "");
  const [formDivisionId, setFormDivisionId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formStatus, setFormStatus] = useState("draft");
  const [formCarryOver, setFormCarryOver] = useState("hangus");

  // Get unique years from periods
  const years = [...new Set(periods?.map(p => p.year) || [])].sort((a, b) => b - a);

  // Filter budgets
  const filteredBudgets = useMemo(() => {
    return budgets?.filter((budget) => {
      const matchesDivision = divisionFilter === "all" || budget.division_id === divisionFilter;
      const matchesPeriod = yearFilter === "active" 
        ? budget.period_id === activePeriod?.id
        : budget.period_id === yearFilter;
      return matchesDivision && matchesPeriod;
    }) || [];
  }, [budgets, divisionFilter, yearFilter, activePeriod?.id]);

  // Reset to page 1 when filter changes
  useMemo(() => {
    setCurrentPage(1);
  }, [divisionFilter, yearFilter]);

  // Paginated budgets
  const paginatedBudgets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBudgets.slice(start, start + pageSize);
  }, [filteredBudgets, currentPage, pageSize]);

  // Calculate stats
  const totalBudgets = filteredBudgets.length;
  const draftCount = 0; // These would be tracked if we add status column
  const approvedCount = totalBudgets; // Currently all budgets are "approved" when created

  // Group by division for "Per Divisi" tab
  const groupedBudgets = filteredBudgets.reduce((acc, budget) => {
    const divisionName = budget.divisions?.name || 'Unknown';
    if (!acc[divisionName]) {
      acc[divisionName] = {
        budgets: [],
        total: 0,
        used: 0,
      };
    }
    acc[divisionName].budgets.push(budget);
    acc[divisionName].total += budget.allocated_amount;
    acc[divisionName].used += budget.used_amount;
    return acc;
  }, {} as Record<string, { budgets: DivisionBudget[]; total: number; used: number }>);

  const handleCreate = async () => {
    const periodToUse = formPeriodId || activePeriod?.id;
    if (!formDivisionId || !formCategoryId || !formAmount || !periodToUse) return;

    await createBudget.mutateAsync({
      divisionId: formDivisionId,
      categoryId: formCategoryId,
      periodId: periodToUse,
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

  const resetForm = () => {
    setFormPeriodId(activePeriod?.id || "");
    setFormDivisionId("");
    setFormCategoryId("");
    setFormAmount("");
    setFormStatus("draft");
    setFormCarryOver("hangus");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const selectedYear = yearFilter === "active" 
    ? activePeriod?.year 
    : periods?.find(p => p.id === yearFilter)?.year;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budget Planning</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'id' ? 'Kelola anggaran per divisi dan kategori' : 'Manage budget by division and category'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            {language === 'id' ? 'Buat Budget' : 'Create Budget'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select 
            value={yearFilter} 
            onValueChange={(val) => setYearFilter(val)}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                {activePeriod?.year || (language === 'id' ? 'Aktif' : 'Active')}
              </SelectItem>
              {periods?.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={language === 'id' ? 'Semua Divisi' : 'All Divisions'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'id' ? 'Semua Divisi' : 'All Divisions'}</SelectItem>
              {divisions?.map((div) => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-4">
            <p className="text-sm text-primary font-medium">
              Total Budget {selectedYear || activePeriod?.year || ''}
            </p>
            <p className="text-2xl font-bold text-primary mt-1">
              {formatCurrency(totalAllocated)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              {language === 'id' ? 'Jumlah Budget' : 'Budget Count'}
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalBudgets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Draft</p>
            <p className="text-2xl font-bold text-foreground mt-1">{draftCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-foreground mt-1">{approvedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">
            {language === 'id' ? 'Daftar Budget' : 'Budget List'}
          </TabsTrigger>
          <TabsTrigger value="division" className="text-primary">
            Per Divisi
          </TabsTrigger>
        </TabsList>

        {/* Table View */}
        <TabsContent value="list">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'id' ? 'Divisi' : 'Division'}</TableHead>
                  <TableHead>{language === 'id' ? 'Kategori' : 'Category'}</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Carry Over</TableHead>
                  <TableHead className="text-right">{language === 'id' ? 'Aksi' : 'Action'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBudgets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {language === 'id' ? 'Belum ada data budget' : 'No budget data yet'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBudgets.map((budget) => (
                    <TableRow key={budget.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {budget.divisions?.code}
                          </Badge>
                          <span>{budget.divisions?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{budget.cost_categories?.name}</TableCell>
                      <TableCell className="text-muted-foreground">-</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(budget.allocated_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          approved
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-primary text-sm cursor-pointer hover:underline">
                          Rollover
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              currentPage={currentPage}
              totalItems={filteredBudgets.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </TabsContent>

        {/* Per Division View */}
        <TabsContent value="division">
          <div className="space-y-4">
            {Object.entries(groupedBudgets).map(([divisionName, data]) => (
              <div key={divisionName} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-foreground">{divisionName}</h3>
                      <Badge variant="outline">{data.budgets.length} {language === 'id' ? 'kategori' : 'categories'}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatCurrency(data.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {language === 'id' ? 'Terpakai' : 'Used'} {formatCurrency(data.used)}
                      </p>
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'id' ? 'Kategori' : 'Category'}</TableHead>
                      <TableHead className="text-right">{language === 'id' ? 'Alokasi' : 'Allocated'}</TableHead>
                      <TableHead className="text-right">{language === 'id' ? 'Terpakai' : 'Used'}</TableHead>
                      <TableHead className="text-right">{language === 'id' ? 'Sisa' : 'Remaining'}</TableHead>
                      <TableHead className="text-right">{language === 'id' ? 'Aksi' : 'Action'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.budgets.map((budget) => {
                      const remaining = budget.allocated_amount - budget.used_amount;
                      return (
                        <TableRow key={budget.id}>
                          <TableCell>{budget.cost_categories?.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.allocated_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.used_amount)}</TableCell>
                          <TableCell className={`text-right ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
                            {formatCurrency(remaining)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(budget)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(budget)}
                                disabled={budget.used_amount > 0}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
            {Object.keys(groupedBudgets).length === 0 && (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <Calculator className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {language === 'id' ? 'Belum Ada Data Budget' : 'No Budget Data Yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {language === 'id' 
                    ? 'Mulai dengan menambahkan alokasi anggaran.'
                    : 'Start by adding budget allocations.'
                  }
                </p>
                <Button onClick={openCreateDialog} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {language === 'id' ? 'Buat Budget' : 'Create Budget'}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {language === 'id' ? 'Buat Budget Baru' : 'Create New Budget'}
            </DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? 'Atur anggaran untuk divisi dan kategori'
                : 'Set budget for division and category'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'id' ? 'Tahun' : 'Year'}</Label>
              <Select 
                value={formPeriodId || activePeriod?.id || ""} 
                onValueChange={setFormPeriodId}
              >
                <SelectTrigger className="border-primary">
                  <SelectValue placeholder={language === 'id' ? 'Pilih tahun' : 'Select year'} />
                </SelectTrigger>
                <SelectContent>
                  {periods?.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Divisi' : 'Division'}</Label>
              <Select value={formDivisionId} onValueChange={setFormDivisionId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih divisi' : 'Select division'} />
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
              <Label>{language === 'id' ? 'Kategori' : 'Category'}</Label>
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
              <Label>Total Budget (Rp)</Label>
              <Input
                type="number"
                placeholder="0"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Carry Over</Label>
                <Select value={formCarryOver} onValueChange={setFormCarryOver}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hangus">Hangus</SelectItem>
                    <SelectItem value="rollover">Rollover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              {language === 'id' ? 'Batal' : 'Cancel'}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createBudget.isPending || !formDivisionId || !formCategoryId || !formAmount}
            >
              {language === 'id' ? 'Simpan' : 'Save'}
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
    </div>
  );
};

export default BudgetPlanning;
