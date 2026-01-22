import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfYear } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
import {
  Download,
  Loader2,
  BarChart3,
  FileText,
  TrendingUp,
  PieChart,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import TransactionDetailDialog from '@/components/dashboard/TransactionDetailDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  generateBudgetReportPDF,
  generateExpenseReportPDF,
  generateOverBudgetReportPDF,
  generateCategoryAnalysisPDF,
} from '@/lib/generateReportPDF';

type ReportType = 'budget-vs-actual' | 'detail-expense' | 'over-budget' | 'category-analysis';

const Reports = () => {
  const { role, profile } = useAuth();
  const { language } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>('budget-vs-actual');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfYear(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  // Pagination state for detail expense
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Drill-down state for chart
  const [drillDown, setDrillDown] = useState<{
    open: boolean;
    type: 'month' | null;
    value: string;
    dataType: 'budget' | 'actual' | 'commitment';
  }>({
    open: false,
    type: null,
    value: '',
    dataType: 'actual',
  });

  const isSuperAdminOrFinance = role === 'super_admin' || role === 'finance';
  const dateLocale = language === 'id' ? localeId : enUS;

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

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

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['cost_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch budget utilization report
  const { data: budgetReport = [], isLoading: isLoadingBudget } = useQuery({
    queryKey: ['report-budget-utilization', selectedDivision, selectedYear],
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
      
      // Filter by year
      return data?.filter((d: any) => d.period?.year?.toString() === selectedYear) || [];
    },
  });

  // Fetch expense report - fixed to not use FK hints
  const { data: expenseReport = [], isLoading: isLoadingExpense } = useQuery({
    queryKey: ['report-expense', selectedDivision, selectedCategory, dateFrom, dateTo],
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
          requester_id,
          division:divisions(name, code),
          category:cost_categories(name, code)
        `)
        .in('status', ['approved', 'paid', 'settled'])
        .order('created_at', { ascending: false });

      if (selectedDivision !== 'all' && isSuperAdminOrFinance) {
        query = query.eq('division_id', selectedDivision);
      } else if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      if (selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch requester names separately - use profiles_secure view for data masking
      if (data && data.length > 0) {
        const requesterIds = [...new Set(data.map(d => d.requester_id))];
        const { data: profiles } = await supabase
          .from('profiles_secure')
          .select('id, full_name')
          .in('id', requesterIds);

        return data.map(item => ({
          ...item,
          requester: profiles?.find(p => p.id === item.requester_id),
        }));
      }

      return data || [];
    },
    enabled: reportType === 'detail-expense',
  });

  // Fetch over budget items
  const overBudgetReport = budgetReport.filter((b: any) => 
    Number(b.used_amount) > Number(b.allocated_amount) && Number(b.allocated_amount) > 0
  );

  // Monthly data for chart
  const { data: monthlyData = [] } = useQuery({
    queryKey: ['monthly-budget-data', selectedDivision, selectedYear],
    queryFn: async () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      
      const totalBudget = budgetReport.reduce((sum: number, b: any) => sum + Number(b.allocated_amount), 0);
      const monthlyBudget = totalBudget / 12;

      let query = supabase
        .from('requests')
        .select('amount, paid_at')
        .in('status', ['paid', 'settled'])
        .gte('paid_at', `${selectedYear}-01-01`)
        .lte('paid_at', `${selectedYear}-12-31`);

      if (selectedDivision !== 'all') {
        query = query.eq('division_id', selectedDivision);
      }

      const { data: requests } = await query;

      const monthlyActual = months.map((_, index) => {
        const monthRequests = requests?.filter(r => {
          if (!r.paid_at) return false;
          const month = new Date(r.paid_at).getMonth();
          return month === index;
        }) || [];
        return monthRequests.reduce((sum, r) => sum + Number(r.amount), 0);
      });

      let commitmentQuery = supabase
        .from('requests')
        .select('amount, approved_at')
        .eq('status', 'approved')
        .gte('approved_at', `${selectedYear}-01-01`)
        .lte('approved_at', `${selectedYear}-12-31`);

      if (selectedDivision !== 'all') {
        commitmentQuery = commitmentQuery.eq('division_id', selectedDivision);
      }

      const { data: commitments } = await commitmentQuery;

      const monthlyCommitment = months.map((_, index) => {
        const monthCommitments = commitments?.filter(r => {
          if (!r.approved_at) return false;
          const month = new Date(r.approved_at).getMonth();
          return month === index;
        }) || [];
        return monthCommitments.reduce((sum, r) => sum + Number(r.amount), 0);
      });

      return months.map((month, index) => ({
        name: month,
        Budget: monthlyBudget,
        Actual: monthlyActual[index],
        Commitment: monthlyCommitment[index],
      }));
    },
    enabled: budgetReport.length > 0,
  });

  // Month name to index mapping
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5,
    'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11,
  };

  // Drill-down query for chart click
  const { data: drillDownTransactions = [], isLoading: isDrillDownLoading } = useQuery({
    queryKey: ['reports-drilldown', drillDown.type, drillDown.value, drillDown.dataType, selectedDivision, selectedYear],
    queryFn: async () => {
      if (!drillDown.type || !drillDown.value) return [];

      const monthIndex = monthMap[drillDown.value];
      const startOfMonth = new Date(Number(selectedYear), monthIndex, 1);
      const endOfMonth = new Date(Number(selectedYear), monthIndex + 1, 0, 23, 59, 59);

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

      if (selectedDivision !== 'all' && isSuperAdminOrFinance) {
        query = query.eq('division_id', selectedDivision);
      } else if (!isSuperAdminOrFinance && profile?.division_id) {
        query = query.eq('division_id', profile.division_id);
      }

      // Filter by data type
      if (drillDown.dataType === 'actual') {
        query = query
          .in('status', ['paid', 'settled'])
          .gte('paid_at', startOfMonth.toISOString())
          .lte('paid_at', endOfMonth.toISOString());
      } else if (drillDown.dataType === 'commitment') {
        query = query
          .eq('status', 'approved')
          .gte('approved_at', startOfMonth.toISOString())
          .lte('approved_at', endOfMonth.toISOString());
      } else {
        // 'budget' shows all requests created in this month
        query = query
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString());
      }

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
    },
    enabled: drillDown.open && drillDown.type === 'month',
  });

  // Budget utilization by division
  const divisionUtilization = divisions.map((div: any) => {
    const divBudgets = budgetReport.filter((b: any) => b.division?.id === div.id);
    const totalAllocated = divBudgets.reduce((sum: number, b: any) => sum + Number(b.allocated_amount), 0);
    const totalUsed = divBudgets.reduce((sum: number, b: any) => sum + Number(b.used_amount), 0);
    const utilization = totalAllocated > 0 ? (totalUsed / totalAllocated) * 100 : 0;
    
    return {
      id: div.id,
      name: div.name,
      code: div.code,
      allocated: totalAllocated,
      used: totalUsed,
      remaining: totalAllocated - totalUsed,
      utilization,
    };
  }).filter(d => d.allocated > 0);

  // Pagination logic for expense report
  const totalExpenseItems = expenseReport.length;
  const totalPages = Math.ceil(totalExpenseItems / pageSize);
  const paginatedExpenseReport = expenseReport.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const startItem = totalExpenseItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalExpenseItems);

  // Reset to page 1 when filters change
  const handlePageSizeChange = (newSize: string) => {
    setPageSize(Number(newSize));
    setCurrentPage(1);
  };

  // Handle bar click for drill-down
  const handleBarClick = (data: any, dataKey: string) => {
    if (data?.name) {
      setDrillDown({
        open: true,
        type: 'month',
        value: data.name,
        dataType: dataKey.toLowerCase() as 'budget' | 'actual' | 'commitment',
      });
    }
  };

  // Get drill-down title
  const getDrillDownTitle = () => {
    const typeLabel = drillDown.dataType === 'actual' 
      ? 'Actual' 
      : drillDown.dataType === 'commitment' 
        ? 'Commitment' 
        : 'Budget';
    return `${typeLabel} - ${drillDown.value} ${selectedYear}`;
  };

  // Get drill-down subtitle
  const getDrillDownSubtitle = () => {
    return language === 'id' 
      ? `Transaksi berdasarkan bulan ${drillDown.value}`
      : `Transactions for ${drillDown.value}`;
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) {
      return `Rp${(amount / 1000000000).toFixed(1)}M`;
    }
    if (amount >= 1000000) {
      return `Rp${(amount / 1000000).toFixed(0)}jt`;
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatFullCurrency = (amount: number) => {
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

  const handleExportExcel = () => {
    if (reportType === 'budget-vs-actual') {
      const exportData = budgetReport.map((row: any) => ({
        division: row.division?.name || '',
        category: row.category?.name || '',
        allocated: row.allocated_amount,
        used: row.used_amount,
        remaining: Number(row.allocated_amount) - Number(row.used_amount),
        utilization: row.allocated_amount > 0
          ? ((Number(row.used_amount) / Number(row.allocated_amount)) * 100).toFixed(1) + '%'
          : '0%',
      }));
      exportToCSV(exportData, 'budget_vs_actual', ['division', 'category', 'allocated', 'used', 'remaining', 'utilization']);
    } else if (reportType === 'detail-expense') {
      const exportData = expenseReport.map((row: any) => ({
        request_number: row.request_number,
        division: row.division?.name || '',
        category: row.category?.name || '',
        description: row.description,
        amount: row.amount,
        status: row.status,
        requester: row.requester?.full_name || '',
        created_at: format(new Date(row.created_at), 'yyyy-MM-dd'),
        paid_at: row.paid_at ? format(new Date(row.paid_at), 'yyyy-MM-dd') : '',
      }));
      exportToCSV(exportData, 'detail_expense', ['request_number', 'division', 'category', 'description', 'amount', 'status', 'requester', 'created_at', 'paid_at']);
    } else if (reportType === 'over-budget') {
      const exportData = overBudgetReport.map((row: any) => ({
        division: row.division?.name || '',
        category: row.category?.name || '',
        allocated: row.allocated_amount,
        used: row.used_amount,
        over: Number(row.used_amount) - Number(row.allocated_amount),
        percentage: ((Number(row.used_amount) / Number(row.allocated_amount)) * 100).toFixed(0) + '%',
      }));
      exportToCSV(exportData, 'over_budget', ['division', 'category', 'allocated', 'used', 'over', 'percentage']);
    } else if (reportType === 'category-analysis') {
      const categoryData = categories.map((cat: any) => {
        const catBudgets = budgetReport.filter((b: any) => b.category?.id === cat.id);
        const totalAllocated = catBudgets.reduce((sum: number, b: any) => sum + Number(b.allocated_amount), 0);
        const totalUsed = catBudgets.reduce((sum: number, b: any) => sum + Number(b.used_amount), 0);
        return {
          code: cat.code,
          name: cat.name,
          allocated: totalAllocated,
          used: totalUsed,
          remaining: totalAllocated - totalUsed,
          utilization: totalAllocated > 0 ? ((totalUsed / totalAllocated) * 100).toFixed(1) + '%' : '0%',
        };
      }).filter((c: any) => c.allocated > 0);
      exportToCSV(categoryData, 'category_analysis', ['code', 'name', 'allocated', 'used', 'remaining', 'utilization']);
    }
  };

  const handleExportPDF = () => {
    const divisionName = selectedDivision !== 'all' 
      ? divisions.find((d: any) => d.id === selectedDivision)?.name 
      : undefined;

    if (reportType === 'budget-vs-actual') {
      const pdfData = budgetReport.map((row: any) => ({
        division: row.division?.name || '',
        category: row.category?.name || '',
        allocated: Number(row.allocated_amount),
        used: Number(row.used_amount),
        remaining: Number(row.allocated_amount) - Number(row.used_amount),
        utilization: row.allocated_amount > 0
          ? ((Number(row.used_amount) / Number(row.allocated_amount)) * 100).toFixed(1) + '%'
          : '0%',
      }));
      generateBudgetReportPDF(pdfData, { year: selectedYear, division: divisionName });
    } else if (reportType === 'detail-expense') {
      const pdfData = expenseReport.map((row: any) => ({
        request_number: row.request_number,
        division: row.division?.name || '',
        category: row.category?.name || '',
        description: row.description,
        amount: Number(row.amount),
        status: row.status,
        requester: row.requester?.full_name || '',
        date: format(new Date(row.created_at), 'dd/MM/yyyy'),
      }));
      generateExpenseReportPDF(pdfData, {
        dateFrom: dateFrom ? format(dateFrom, 'dd/MM/yyyy') : undefined,
        dateTo: dateTo ? format(dateTo, 'dd/MM/yyyy') : undefined,
        division: divisionName,
      });
    } else if (reportType === 'over-budget') {
      const pdfData = overBudgetReport.map((row: any) => ({
        division: row.division?.name || '',
        category: row.category?.name || '',
        allocated: Number(row.allocated_amount),
        used: Number(row.used_amount),
        over: Number(row.used_amount) - Number(row.allocated_amount),
        percentage: ((Number(row.used_amount) / Number(row.allocated_amount)) * 100).toFixed(0) + '%',
      }));
      generateOverBudgetReportPDF(pdfData, { year: selectedYear, division: divisionName });
    } else if (reportType === 'category-analysis') {
      const categoryData = categories.map((cat: any) => {
        const catBudgets = budgetReport.filter((b: any) => b.category?.id === cat.id);
        const totalAllocated = catBudgets.reduce((sum: number, b: any) => sum + Number(b.allocated_amount), 0);
        const totalUsed = catBudgets.reduce((sum: number, b: any) => sum + Number(b.used_amount), 0);
        const utilization = totalAllocated > 0 ? (totalUsed / totalAllocated) * 100 : 0;
        return {
          name: cat.name,
          code: cat.code,
          allocated: totalAllocated,
          used: totalUsed,
          remaining: totalAllocated - totalUsed,
          utilization,
        };
      }).filter((c: any) => c.allocated > 0);
      generateCategoryAnalysisPDF(categoryData, { year: selectedYear, division: divisionName });
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(0)}jt`;
    }
    return value.toString();
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Analisis dan laporan keuangan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={handleExportPDF} className="gap-2">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Date From */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-36 justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={(date) => { setDateFrom(date); setCurrentPage(1); }}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {/* Date To */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-36 justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={(date) => { setDateTo(date); setCurrentPage(1); }}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {/* Year */}
        <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Division */}
        {isSuperAdminOrFinance && (
          <Select value={selectedDivision} onValueChange={(v) => { setSelectedDivision(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Semua Divisi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Divisi</SelectItem>
              {divisions.map((div: any) => (
                <SelectItem key={div.id} value={div.id}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Category */}
        <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Semua Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {categories.map((cat: any) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Report Type Tabs */}
      <Tabs value={reportType} onValueChange={(v) => { setReportType(v as ReportType); setCurrentPage(1); }}>
        <TabsList className="inline-flex h-10 p-1 bg-muted/50">
          <TabsTrigger value="budget-vs-actual" className="gap-2 px-4">
            <BarChart3 className="h-4 w-4" />
            Budget vs Actual
          </TabsTrigger>
          <TabsTrigger value="detail-expense" className="gap-2 px-4">
            <FileText className="h-4 w-4" />
            Detail Expense
          </TabsTrigger>
          <TabsTrigger value="over-budget" className="gap-2 px-4">
            <TrendingUp className="h-4 w-4" />
            Over Budget
          </TabsTrigger>
          <TabsTrigger value="category-analysis" className="gap-2 px-4">
            <PieChart className="h-4 w-4" />
            Analisis Kategori
          </TabsTrigger>
        </TabsList>

        {/* Budget vs Actual */}
        <TabsContent value="budget-vs-actual" className="space-y-6 mt-6">
          {isLoadingBudget ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bar Chart */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-semibold">Budget vs Actual vs Commitment</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {language === 'id' ? 'Klik untuk melihat detail' : 'Click to view details'}
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tickFormatter={formatYAxis} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar 
                          dataKey="Budget" 
                          fill="hsl(var(--primary) / 0.3)" 
                          radius={[2, 2, 0, 0]} 
                          cursor="pointer"
                          onClick={(data) => handleBarClick(data, 'Budget')}
                        />
                        <Bar 
                          dataKey="Actual" 
                          fill="hsl(var(--primary))" 
                          radius={[2, 2, 0, 0]} 
                          cursor="pointer"
                          onClick={(data) => handleBarClick(data, 'Actual')}
                        />
                        <Bar 
                          dataKey="Commitment" 
                          fill="hsl(var(--success))" 
                          radius={[2, 2, 0, 0]} 
                          cursor="pointer"
                          onClick={(data) => handleBarClick(data, 'Commitment')}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Budget Utilization per Division */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Budget Utilization per Divisi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {divisionUtilization.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Tidak ada data budget</p>
                  ) : (
                    divisionUtilization.map((div) => (
                      <div key={div.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{div.name}</span>
                          <span className="text-sm font-semibold text-primary">{div.utilization.toFixed(0)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(div.utilization, 100)} 
                          className={cn(
                            "h-2",
                            div.utilization > 100 && "[&>div]:bg-destructive"
                          )}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Terpakai: {formatFullCurrency(div.used)}</span>
                          <span>Total: {formatFullCurrency(div.allocated)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Detail Expense */}
        <TabsContent value="detail-expense" className="space-y-4 mt-6">
          <Card>
            <CardContent className="pt-6">
              {isLoadingExpense ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="bg-primary/5 rounded-lg p-4 mb-6">
                    <p className="text-sm text-muted-foreground">Total Expense</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatFullCurrency(expenseReport.reduce((sum: number, r: any) => sum + Number(r.amount), 0))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {expenseReport.length} transaksi
                    </p>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Request</TableHead>
                        <TableHead>Divisi</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tanggal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedExpenseReport.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Tidak ada data
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedExpenseReport.map((row: any) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-mono text-sm">
                              {row.request_number}
                            </TableCell>
                            <TableCell>{row.division?.name}</TableCell>
                            <TableCell>{row.category?.name}</TableCell>
                            <TableCell className="max-w-48 truncate">{row.description}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatFullCurrency(Number(row.amount))}
                            </TableCell>
                            <TableCell className="capitalize">{row.status}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(row.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Menampilkan {startItem}-{endItem} dari {totalExpenseItems} data</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Baris per halaman:</span>
                        <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                          <SelectTrigger className="w-16 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1 px-2">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "ghost"}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages || totalPages === 0}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Over Budget */}
        <TabsContent value="over-budget" className="space-y-4 mt-6">
          <Card>
            <CardContent className="pt-6">
              {isLoadingBudget ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {overBudgetReport.length === 0 ? (
                    <div className="text-center py-12">
                      <TrendingUp className="h-12 w-12 text-success mx-auto mb-3" />
                      <p className="text-lg font-medium text-foreground">Tidak ada budget yang over</p>
                      <p className="text-muted-foreground">Semua budget dalam batas alokasi</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Divisi</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="text-right">Alokasi</TableHead>
                          <TableHead className="text-right">Terpakai</TableHead>
                          <TableHead className="text-right">Selisih</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overBudgetReport.map((row: any) => {
                          const over = Number(row.used_amount) - Number(row.allocated_amount);
                          const pct = (Number(row.used_amount) / Number(row.allocated_amount)) * 100;
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.division?.name}</TableCell>
                              <TableCell>{row.category?.name}</TableCell>
                              <TableCell className="text-right">{formatFullCurrency(Number(row.allocated_amount))}</TableCell>
                              <TableCell className="text-right">{formatFullCurrency(Number(row.used_amount))}</TableCell>
                              <TableCell className="text-right text-destructive font-medium">
                                +{formatFullCurrency(over)}
                              </TableCell>
                              <TableCell className="text-right text-destructive font-medium">
                                {pct.toFixed(0)}%
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Category Analysis */}
        <TabsContent value="category-analysis" className="space-y-4 mt-6">
          <Card>
            <CardContent className="pt-6">
              {isLoadingBudget ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Group by category */}
                  {categories.map((cat: any) => {
                    const catBudgets = budgetReport.filter((b: any) => b.category?.id === cat.id);
                    const totalAllocated = catBudgets.reduce((sum: number, b: any) => sum + Number(b.allocated_amount), 0);
                    const totalUsed = catBudgets.reduce((sum: number, b: any) => sum + Number(b.used_amount), 0);
                    const utilization = totalAllocated > 0 ? (totalUsed / totalAllocated) * 100 : 0;

                    if (totalAllocated === 0) return null;

                    return (
                      <div key={cat.id} className="border-b border-border last:border-0 py-4 first:pt-0">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-medium text-foreground">{cat.name}</h4>
                            <p className="text-xs text-muted-foreground">{cat.code}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">{formatFullCurrency(totalUsed)}</p>
                            <p className="text-xs text-muted-foreground">dari {formatFullCurrency(totalAllocated)}</p>
                          </div>
                        </div>
                        <Progress 
                          value={Math.min(utilization, 100)} 
                          className={cn(
                            "h-2",
                            utilization > 100 && "[&>div]:bg-destructive",
                            utilization > 80 && utilization <= 100 && "[&>div]:bg-warning"
                          )}
                        />
                        <div className="flex items-center justify-between mt-1">
                          <span className={cn(
                            "text-xs font-medium",
                            utilization > 100 ? "text-destructive" : utilization > 80 ? "text-warning" : "text-success"
                          )}>
                            {utilization.toFixed(1)}% terpakai
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Sisa: {formatFullCurrency(totalAllocated - totalUsed)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drill-down Transaction Detail Dialog */}
      <TransactionDetailDialog
        open={drillDown.open}
        onOpenChange={(open) => setDrillDown(prev => ({ ...prev, open }))}
        title={getDrillDownTitle()}
        subtitle={getDrillDownSubtitle()}
        transactions={drillDownTransactions}
        isLoading={isDrillDownLoading}
        filterType="month"
        filterValue={drillDown.value}
      />
    </div>
  );
};

export default Reports;