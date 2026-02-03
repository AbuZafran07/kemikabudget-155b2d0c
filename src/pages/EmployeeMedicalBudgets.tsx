import { useState } from "react";
import { Plus, Search, Heart, Users, Edit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  
  // Create/Update mutation
  const saveBudget = useMutation({
    mutationFn: async ({ isEdit, budgetId }: { isEdit: boolean; budgetId?: string }) => {
      const budgetData = {
        employee_id: selectedEmployeeId,
        year: parseInt(budgetYear),
        total_entitlement: parseFloat(entitlement),
        status: "active",
      };
      
      if (isEdit && budgetId) {
        const { error } = await supabase
          .from("employee_medical_budgets")
          .update({ 
            total_entitlement: budgetData.total_entitlement,
            updated_at: new Date().toISOString()
          })
          .eq("id", budgetId);
        if (error) throw error;
      } else {
        // Check if budget already exists
        const { data: existing } = await supabase
          .from("employee_medical_budgets")
          .select("id")
          .eq("employee_id", selectedEmployeeId)
          .eq("year", parseInt(budgetYear))
          .maybeSingle();
        
        if (existing) {
          throw new Error(t("medicalBudget.alreadyExists"));
        }
        
        const { error } = await supabase
          .from("employee_medical_budgets")
          .insert(budgetData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-medical-budgets"] });
      toast({
        title: editingBudget ? t("medicalBudget.updateSuccess") : t("medicalBudget.createSuccess"),
        description: editingBudget ? t("medicalBudget.updateSuccessDesc") : t("medicalBudget.createSuccessDesc"),
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
