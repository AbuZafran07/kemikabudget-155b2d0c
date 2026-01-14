import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  TrendingUp,
  Wallet,
  FileText,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ReportType = 'budget-utilization' | 'expense' | 'audit';

const Reports = () => {
  const { role, profile } = useAuth();
  const { t, language } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>('budget-utilization');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');

  const isSuperAdminOrFinance = role === 'super_admin' || role === 'finance';
  const dateLocale = language === 'id' ? localeId : enUS;

  // Fetch divisions
  const { data: divisions = [] } = useQuery({
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

  // Fetch budget utilization report
  const { data: budgetReport, isLoading: isLoadingBudget } = useQuery({
    queryKey: ['report-budget-utilization', selectedDivision, selectedPeriod],
    queryFn: async () => {
      let query = supabase
        .from('division_budgets')
        .select(`
          id,
          allocated_amount,
          used_amount,
          division:divisions(id, name, code),
          category:cost_categories(id, name, code),
          period:budget_periods(id, name, year)
        `);

      if (selectedDivision !== 'all' && isSuperAdminOrFinance) {
        query = query.eq('division_id', selectedDivision);
      } else if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data, error } = await query.order('division_id');
      if (error) throw error;
      return data;
    },
    enabled: reportType === 'budget-utilization',
  });

  // Fetch expense report
  const { data: expenseReport, isLoading: isLoadingExpense } = useQuery({
    queryKey: ['report-expense', selectedDivision, selectedPeriod],
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
          paid_at,
          division:divisions(name, code),
          category:cost_categories(name, code),
          requester:profiles!requests_requester_id_fkey(full_name)
        `)
        .in('status', ['approved', 'paid', 'settled'])
        .order('created_at', { ascending: false });

      if (selectedDivision !== 'all' && isSuperAdminOrFinance) {
        query = query.eq('division_id', selectedDivision);
      } else if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: reportType === 'expense',
  });

  // Fetch audit log report
  const { data: auditReport, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['report-audit', selectedDivision],
    queryFn: async () => {
      let query = supabase
        .from('request_events')
        .select(`
          id,
          event_type,
          description,
          created_at,
          request:requests(request_number, division_id, division:divisions(name))
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      const { data, error } = await query;
      if (error) throw error;

      // Get performer names
      const { data: allEvents } = await supabase
        .from('request_events')
        .select('performed_by')
        .limit(200);

      const performerIds = [...new Set(allEvents?.map(e => e.performed_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', performerIds);

      return data?.map(event => ({
        ...event,
        performer: profiles?.find(p => p.id === (event as any).performed_by),
      }));
    },
    enabled: reportType === 'audit',
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();
  };

  const handleExportBudget = () => {
    if (!budgetReport) return;
    const exportData = budgetReport.map(row => ({
      division: (row.division as any)?.name || '',
      category: (row.category as any)?.name || '',
      allocated: row.allocated_amount,
      used: row.used_amount,
      remaining: Number(row.allocated_amount) - Number(row.used_amount),
      utilization: row.allocated_amount > 0
        ? ((Number(row.used_amount) / Number(row.allocated_amount)) * 100).toFixed(1) + '%'
        : '0%',
    }));
    exportToCSV(exportData, 'budget_utilization', ['division', 'category', 'allocated', 'used', 'remaining', 'utilization']);
  };

  const handleExportExpense = () => {
    if (!expenseReport) return;
    const exportData = expenseReport.map(row => ({
      request_number: row.request_number,
      division: (row.division as any)?.name || '',
      category: (row.category as any)?.name || '',
      description: row.description,
      amount: row.amount,
      status: row.status,
      requester: (row.requester as any)?.full_name || '',
      created_at: format(new Date(row.created_at), 'yyyy-MM-dd'),
      paid_at: row.paid_at ? format(new Date(row.paid_at), 'yyyy-MM-dd') : '',
    }));
    exportToCSV(exportData, 'expense_report', ['request_number', 'division', 'category', 'description', 'amount', 'status', 'requester', 'created_at', 'paid_at']);
  };

  const handleExportAudit = () => {
    if (!auditReport) return;
    const exportData = auditReport.map(row => ({
      timestamp: format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss'),
      request_number: (row.request as any)?.request_number || '',
      event_type: row.event_type,
      description: row.description,
      performer: (row as any).performer?.full_name || 'System',
    }));
    exportToCSV(exportData, 'audit_log', ['timestamp', 'request_number', 'event_type', 'description', 'performer']);
  };

  // Calculate totals for budget report
  const budgetTotals = budgetReport?.reduce((acc, row) => ({
    allocated: acc.allocated + Number(row.allocated_amount),
    used: acc.used + Number(row.used_amount),
  }), { allocated: 0, used: 0 }) || { allocated: 0, used: 0 };

  const expenseTotals = expenseReport?.reduce((sum, row) => sum + Number(row.amount), 0) || 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('reports.description')}
          </p>
        </div>
      </div>

      {/* Report Type Tabs */}
      <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="budget-utilization" className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{t('reports.budgetUtilization')}</span>
          </TabsTrigger>
          <TabsTrigger value="expense" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">{t('reports.expenseReport')}</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{t('reports.auditLog')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mt-4">
          {isSuperAdminOrFinance && (
            <div className="space-y-1">
              <Label className="text-xs">{t('reports.division')}</Label>
              <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('reports.selectDivision')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reports.allDivisions')}</SelectItem>
                  {divisions.map((div) => (
                    <SelectItem key={div.id} value={div.id}>
                      {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Budget Utilization Report */}
        <TabsContent value="budget-utilization" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('reports.budgetUtilizationReport')}</CardTitle>
                <CardDescription>
                  {t('reports.budgetUtilizationDesc')}
                </CardDescription>
              </div>
              <Button onClick={handleExportBudget} disabled={!budgetReport?.length} className="gap-2">
                <Download className="h-4 w-4" />
                {t('reports.exportCsv')}
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingBudget ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-primary/5 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">{t('reports.totalAllocation')}</p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(budgetTotals.allocated)}
                      </p>
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">{t('reports.totalUsed')}</p>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(budgetTotals.used)}
                      </p>
                    </div>
                    <div className="bg-success/5 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">{t('reports.totalRemaining')}</p>
                      <p className="text-2xl font-bold text-success">
                        {formatCurrency(budgetTotals.allocated - budgetTotals.used)}
                      </p>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('reports.division')}</TableHead>
                        <TableHead>{t('reports.category')}</TableHead>
                        <TableHead className="text-right">{t('reports.allocation')}</TableHead>
                        <TableHead className="text-right">{t('reports.used')}</TableHead>
                        <TableHead className="text-right">{t('reports.remaining')}</TableHead>
                        <TableHead className="text-right">{t('reports.utilization')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetReport?.map((row) => {
                        const remaining = Number(row.allocated_amount) - Number(row.used_amount);
                        const utilization = row.allocated_amount > 0
                          ? (Number(row.used_amount) / Number(row.allocated_amount)) * 100
                          : 0;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {(row.division as any)?.name}
                            </TableCell>
                            <TableCell>{(row.category as any)?.name}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(row.allocated_amount))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(row.used_amount))}
                            </TableCell>
                            <TableCell className="text-right text-success">
                              {formatCurrency(remaining)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={utilization > 80 ? 'text-destructive' : utilization > 50 ? 'text-warning' : 'text-success'}>
                                {utilization.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expense Report */}
        <TabsContent value="expense" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('reports.expenseReportTitle')}</CardTitle>
                <CardDescription>
                  {t('reports.expenseReportDesc')}
                </CardDescription>
              </div>
              <Button onClick={handleExportExpense} disabled={!expenseReport?.length} className="gap-2">
                <Download className="h-4 w-4" />
                {t('reports.exportCsv')}
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingExpense ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="bg-primary/5 rounded-lg p-4 mb-6">
                    <p className="text-sm text-muted-foreground">{t('reports.totalExpense')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(expenseTotals)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {expenseReport?.length || 0} {t('reports.transactions')}
                    </p>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('reports.requestNumber')}</TableHead>
                        <TableHead>{t('reports.division')}</TableHead>
                        <TableHead>{t('reports.category')}</TableHead>
                        <TableHead>{t('common.description')}</TableHead>
                        <TableHead className="text-right">{t('reports.amount')}</TableHead>
                        <TableHead>{t('reports.status')}</TableHead>
                        <TableHead>{t('reports.date')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseReport?.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">
                            {row.request_number}
                          </TableCell>
                          <TableCell>{(row.division as any)?.name}</TableCell>
                          <TableCell>{(row.category as any)?.name}</TableCell>
                          <TableCell className="max-w-48 truncate">{row.description}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(Number(row.amount))}
                          </TableCell>
                          <TableCell className="capitalize">{row.status}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(row.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('reports.auditLogTitle')}</CardTitle>
                <CardDescription>
                  {t('reports.auditLogDesc')}
                </CardDescription>
              </div>
              <Button onClick={handleExportAudit} disabled={!auditReport?.length} className="gap-2">
                <Download className="h-4 w-4" />
                {t('reports.exportCsv')}
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingAudit ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reports.time')}</TableHead>
                      <TableHead>{t('reports.requestNumber')}</TableHead>
                      <TableHead>{t('reports.event')}</TableHead>
                      <TableHead>{t('common.description')}</TableHead>
                      <TableHead>{t('reports.user')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditReport?.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(row.created_at), 'dd MMM yyyy HH:mm', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {(row.request as any)?.request_number || '-'}
                        </TableCell>
                        <TableCell className="capitalize">
                          {row.event_type.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="max-w-64 truncate">{row.description}</TableCell>
                        <TableCell>{(row as any).performer?.full_name || 'System'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;