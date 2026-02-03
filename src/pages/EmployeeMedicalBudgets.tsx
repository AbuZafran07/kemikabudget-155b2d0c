import { useState } from "react";
import { Plus, Search, Heart, Users, Edit, Loader2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TablePagination } from "@/components/common/TablePagination";

interface EmployeeBudget {
  id: string;
  employee_id: string;
  year: number;
  total_entitlement: number;
  used_amount: number;
  remaining_amount: number;
  status: string;
  employee?: {
    id: string;
    full_name: string;
    email: string;
    division_id: string | null;
    division?: { name: string };
  };
}

interface Employee {
  id: string;
  full_name: string;
  email: string;
  division_id: string | null;
}

interface HRGAWelfareBudget {
  allocated_amount: number;
  used_amount: number;
  remaining_amount: number;
  exists: boolean;
}

const EmployeeMedicalBudgets = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(currentYear.toString());
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<EmployeeBudget | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [entitlement, setEntitlement] = useState("");
  const [budgetYear, setBudgetYear] = useState(currentYear.toString());
  
  // Fetch HRGA Welfare budget for selected year
  const { data: hrgaWelfareBudget, isLoading: isLoadingWelfare } = useQuery({
    queryKey: ["hrga-welfare-budget", budgetYear],
    queryFn: async () => {
      // Get HRGA division and Welfare category
      const { data: hrga } = await supabase
        .from("divisions")
        .select("id")
        .eq("code", "HRGA")
        .maybeSingle();
      
      const { data: welfare } = await supabase
        .from("cost_categories")
        .select("id")
        .eq("code", "WELFARE")
        .maybeSingle();
      
      if (!hrga || !welfare) {
        return { allocated_amount: 0, used_amount: 0, remaining_amount: 0, exists: false } as HRGAWelfareBudget;
      }
      
      // Get active period for the year
      const { data: period } = await supabase
        .from("budget_periods")
        .select("id")
        .eq("year", parseInt(budgetYear))
        .eq("is_active", true)
        .maybeSingle();
      
      if (!period) {
        return { allocated_amount: 0, used_amount: 0, remaining_amount: 0, exists: false } as HRGAWelfareBudget;
      }
      
      // Get division budget
      const { data: budget } = await supabase
        .from("division_budgets")
        .select("allocated_amount, used_amount")
        .eq("division_id", hrga.id)
        .eq("category_id", welfare.id)
        .eq("period_id", period.id)
        .maybeSingle();
      
      if (!budget) {
        return { allocated_amount: 0, used_amount: 0, remaining_amount: 0, exists: false } as HRGAWelfareBudget;
      }
      
      return {
        allocated_amount: budget.allocated_amount,
        used_amount: budget.used_amount,
        remaining_amount: budget.allocated_amount - budget.used_amount,
        exists: true
      } as HRGAWelfareBudget;
    },
    enabled: dialogOpen, // Only fetch when dialog is open
  });
  
  // Fetch budgets
  const { data: budgets, isLoading } = useQuery({
    queryKey: ["employee-medical-budgets", yearFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_medical_budgets")
        .select("*")
        .eq("year", parseInt(yearFilter))
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Fetch employees
      const employeeIds = [...new Set(data?.map(b => b.employee_id).filter(Boolean))];
      const employeeMap: Record<string, Employee> = {};
      
      if (employeeIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_secure")
          .select("id, full_name, email, division_id")
          .in("id", employeeIds);
        
        profiles?.forEach(p => {
          if (p.id) employeeMap[p.id] = p as Employee;
        });
      }
      
      return data?.map(b => ({
        ...b,
        employee: employeeMap[b.employee_id] || null
      })) as EmployeeBudget[];
    },
  });
  
  // Fetch all employees for dropdown
  const { data: allEmployees } = useQuery({
    queryKey: ["all-employees-for-budget"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles_secure")
        .select("id, full_name, email, division_id")
        .eq("is_active", true)
        .order("full_name");
      
      if (error) throw error;
      return data as Employee[];
    },
  });
  
  // Create/Update mutation - uses RPC to deduct from HRGA welfare budget
  const saveBudget = useMutation({
    mutationFn: async ({ isEdit, budgetId }: { isEdit: boolean; budgetId?: string }) => {
      // Use the allocate_medical_budget RPC function which:
      // 1. Validates HRGA welfare budget availability
      // 2. Deducts from HRGA welfare budget
      // 3. Creates/updates employee medical budget
      const { data, error } = await supabase.rpc("allocate_medical_budget", {
        p_employee_id: selectedEmployeeId,
        p_year: parseInt(budgetYear),
        p_entitlement: parseFloat(entitlement),
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || t("common.error"));
      }
      
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employee-medical-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["division_budgets"] }); // Refresh budget planning too
      
      const result = data as { deducted_from_hrga?: number; remaining_hrga_budget?: number };
      const deducted = result.deducted_from_hrga || 0;
      
      toast({
        title: editingBudget ? t("medicalBudget.updateSuccess") : t("medicalBudget.createSuccess"),
        description: deducted > 0 
          ? `${t("medicalBudget.deductedFromHRGA")} ${formatCurrency(deducted)}`
          : t("medicalBudget.updateSuccessDesc"),
      });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const filteredBudgets = budgets?.filter(b =>
    (b.employee?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.employee?.email || "").toLowerCase().includes(search.toLowerCase())
  ) || [];
  
  const paginatedBudgets = filteredBudgets.slice((page - 1) * pageSize, page * pageSize);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };
  
  const handleOpenCreate = () => {
    setEditingBudget(null);
    setSelectedEmployeeId("");
    setEntitlement("5000000");
    setBudgetYear(currentYear.toString());
    setDialogOpen(true);
  };
  
  const handleOpenEdit = (budget: EmployeeBudget) => {
    setEditingBudget(budget);
    setSelectedEmployeeId(budget.employee_id);
    setEntitlement(budget.total_entitlement.toString());
    setBudgetYear(budget.year.toString());
    setDialogOpen(true);
  };
  
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingBudget(null);
    setSelectedEmployeeId("");
    setEntitlement("");
  };
  
  const handleSave = () => {
    if (!selectedEmployeeId || !entitlement || parseFloat(entitlement) <= 0) {
      toast({
        title: t("common.error"),
        description: t("medicalBudget.fillAllFields"),
        variant: "destructive",
      });
      return;
    }
    
    // Validate HRGA Welfare budget exists and has sufficient funds
    if (!hrgaWelfareBudget?.exists) {
      toast({
        title: t("common.error"),
        description: t("medicalBudget.noHRGABudget"),
        variant: "destructive",
      });
      return;
    }
    
    const entitlementAmount = parseFloat(entitlement);
    const currentEntitlement = editingBudget?.total_entitlement || 0;
    const additionalNeeded = entitlementAmount - currentEntitlement;
    
    if (additionalNeeded > 0 && additionalNeeded > hrgaWelfareBudget.remaining_amount) {
      toast({
        title: t("common.error"),
        description: t("medicalBudget.insufficientHRGABudget"),
        variant: "destructive",
      });
      return;
    }
    
    saveBudget.mutate({ isEdit: !!editingBudget, budgetId: editingBudget?.id });
  };
  
  // Get employees without budget for selected year
  const employeesWithoutBudget = allEmployees?.filter(emp => 
    !budgets?.some(b => b.employee_id === emp.id)
  ) || [];
  
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            {t("medicalBudget.title")}
          </h1>
          <p className="text-muted-foreground">{t("medicalBudget.description")}</p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t("medicalBudget.addBudget")}
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medicalBudget.totalEmployees")}</CardDescription>
            <CardTitle className="text-2xl">{budgets?.length || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{t("medicalBudget.withBudgetIn")} {yearFilter}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medicalBudget.totalAllocated")}</CardDescription>
            <CardTitle className="text-2xl text-primary">
              {formatCurrency(budgets?.reduce((sum, b) => sum + b.total_entitlement, 0) || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{t("medicalBudget.forYear")} {yearFilter}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medicalBudget.totalUsed")}</CardDescription>
            <CardTitle className="text-2xl text-warning">
              {formatCurrency(budgets?.reduce((sum, b) => sum + b.used_amount, 0) || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {budgets && budgets.reduce((sum, b) => sum + b.total_entitlement, 0) > 0
                ? Math.round((budgets.reduce((sum, b) => sum + b.used_amount, 0) / budgets.reduce((sum, b) => sum + b.total_entitlement, 0)) * 100)
                : 0}% {t("medical.utilized")}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("medicalBudget.budgetList")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("medicalBudget.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder={t("medicalBudget.selectYear")} />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : paginatedBudgets.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("medicalBudget.noData")}</h3>
              <p className="text-muted-foreground mb-4">{t("medicalBudget.noDataDesc")}</p>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t("medicalBudget.addFirst")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("medicalBudget.employeeName")}</TableHead>
                      <TableHead>{t("medicalBudget.email")}</TableHead>
                      <TableHead className="text-right">{t("medicalBudget.entitlement")}</TableHead>
                      <TableHead className="text-right">{t("medicalBudget.used")}</TableHead>
                      <TableHead className="text-right">{t("medicalBudget.remaining")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBudgets.map((budget) => (
                      <TableRow key={budget.id}>
                        <TableCell className="font-medium">
                          {budget.employee?.full_name || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {budget.employee?.email || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(budget.total_entitlement)}
                        </TableCell>
                        <TableCell className="text-right text-warning">
                          {formatCurrency(budget.used_amount)}
                        </TableCell>
                        <TableCell className="text-right text-success">
                          {formatCurrency(budget.remaining_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={budget.status === "active" ? "default" : "secondary"}>
                            {budget.status === "active" ? t("status.active") : t("status.inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(budget)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <TablePagination
                currentPage={page}
                pageSize={pageSize}
                totalItems={filteredBudgets.length}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBudget ? t("medicalBudget.editBudget") : t("medicalBudget.addBudget")}
            </DialogTitle>
            <DialogDescription>
              {editingBudget ? t("medicalBudget.editBudgetDesc") : t("medicalBudget.addBudgetDesc")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* HRGA Welfare Budget Info */}
            {isLoadingWelfare ? (
              <Skeleton className="h-20 w-full" />
            ) : hrgaWelfareBudget?.exists ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{t("medicalBudget.hrgaWelfareBudget")}</AlertTitle>
                <AlertDescription>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("budget.allocated")}:</span>
                      <p className="font-medium">{formatCurrency(hrgaWelfareBudget.allocated_amount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("budget.used")}:</span>
                      <p className="font-medium text-warning">{formatCurrency(hrgaWelfareBudget.used_amount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("budget.remaining")}:</span>
                      <p className="font-medium text-success">{formatCurrency(hrgaWelfareBudget.remaining_amount)}</p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("medicalBudget.noHRGABudgetTitle")}</AlertTitle>
                <AlertDescription>
                  {t("medicalBudget.noHRGABudgetDesc")}
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label>{t("medicalBudget.employee")}</Label>
              <Select
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
                disabled={!!editingBudget}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("medicalBudget.selectEmployee")} />
                </SelectTrigger>
                <SelectContent>
                  {editingBudget ? (
                    <SelectItem value={editingBudget.employee_id}>
                      {editingBudget.employee?.full_name}
                    </SelectItem>
                  ) : (
                    employeesWithoutBudget.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t("medicalBudget.year")}</Label>
              <Select
                value={budgetYear}
                onValueChange={setBudgetYear}
                disabled={!!editingBudget}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t("medicalBudget.annualEntitlement")}</Label>
              <Input
                type="number"
                value={entitlement}
                onChange={(e) => setEntitlement(e.target.value)}
                placeholder="5000000"
              />
              <p className="text-xs text-muted-foreground">
                {entitlement && formatCurrency(parseFloat(entitlement) || 0)}
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {t("action.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saveBudget.isPending}>
              {saveBudget.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("action.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeMedicalBudgets;
