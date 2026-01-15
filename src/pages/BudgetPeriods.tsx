import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarDays,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface BudgetPeriod {
  id: string;
  name: string;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

const BudgetPeriods = () => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<BudgetPeriod | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [periodToDelete, setPeriodToDelete] = useState<BudgetPeriod | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<BudgetPeriod | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
    is_active: true,
    is_closed: false,
  });

  const dateLocale = language === 'id' ? localeId : enUS;

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['budget-periods-management'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_periods')
        .select('*')
        .order('year', { ascending: false });
      if (error) throw error;
      return data as BudgetPeriod[];
    },
  });

  // Check if period has linked budgets
  const checkLinkedBudgets = async (periodId: string): Promise<number> => {
    const { count } = await supabase
      .from('division_budgets')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', periodId);
    return count || 0;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('budget_periods').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods-management'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t('common.success'), description: t('budgetPeriods.addSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: typeof formData & { id: string }) => {
      const { error } = await supabase.from('budget_periods').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods-management'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t('common.success'), description: t('budgetPeriods.updateSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const linkedCount = await checkLinkedBudgets(id);
      if (linkedCount > 0) {
        throw new Error(t('budgetPeriods.deleteErrorLinked'));
      }
      const { error } = await supabase.from('budget_periods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods-management'] });
      toast({ title: t('common.success'), description: t('budgetPeriods.deleteSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      year: new Date().getFullYear(),
      start_date: '',
      end_date: '',
      is_active: true,
      is_closed: false,
    });
    setEditingPeriod(null);
  };

  const handleEdit = (period: BudgetPeriod) => {
    setEditingPeriod(period);
    setFormData({
      name: period.name,
      year: period.year,
      start_date: period.start_date,
      end_date: period.end_date,
      is_active: period.is_active,
      is_closed: period.is_closed,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (period: BudgetPeriod) => {
    setPeriodToDelete(period);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (periodToDelete) {
      deleteMutation.mutate(periodToDelete.id);
    }
    setDeleteDialogOpen(false);
    setPeriodToDelete(null);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast({
        title: t('common.error'),
        description: t('budgetPeriods.requiredFields'),
        variant: 'destructive',
      });
      return;
    }
    if (editingPeriod) {
      updateMutation.mutate({ id: editingPeriod.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleViewDetail = (period: BudgetPeriod) => {
    setSelectedPeriod(period);
    setIsDetailSheetOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: dateLocale });
  };

  const filteredPeriods = periods.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.year.toString().includes(search)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('budgetPeriods.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('budgetPeriods.description')}</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('budgetPeriods.addPeriod')}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('budgetPeriods.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('budgetPeriods.year')}</TableHead>
              <TableHead>{t('budgetPeriods.startDate')}</TableHead>
              <TableHead>{t('budgetPeriods.endDate')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredPeriods.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <CalendarDays className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('budgetPeriods.noData')}</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredPeriods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell className="font-medium">{period.name}</TableCell>
                  <TableCell className="font-mono">{period.year}</TableCell>
                  <TableCell>{formatDate(period.start_date)}</TableCell>
                  <TableCell>{formatDate(period.end_date)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {period.is_active && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {t('common.active')}
                        </Badge>
                      )}
                      {period.is_closed && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {t('budgetPeriods.closed')}
                        </Badge>
                      )}
                      {!period.is_active && !period.is_closed && (
                        <Badge variant="outline">
                          {t('common.inactive')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleViewDetail(period)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(period)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(period)}
                        disabled={period.is_closed}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPeriod ? t('budgetPeriods.editPeriod') : t('budgetPeriods.addPeriod')}</DialogTitle>
            <DialogDescription>
              {editingPeriod ? t('budgetPeriods.editPeriodDesc') : t('budgetPeriods.addPeriodDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="FY 2025"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('budgetPeriods.year')}</Label>
                <Input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                  placeholder="2025"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('budgetPeriods.startDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formData.start_date ? formatDate(formData.start_date) : t('budgetPeriods.selectDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.start_date ? new Date(formData.start_date) : undefined}
                      onSelect={(date) => setFormData({ ...formData, start_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                      locale={dateLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>{t('budgetPeriods.endDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formData.end_date ? formatDate(formData.end_date) : t('budgetPeriods.selectDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.end_date ? new Date(formData.end_date) : undefined}
                      onSelect={(date) => setFormData({ ...formData, end_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                      locale={dateLocale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('common.activeStatus')}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('budgetPeriods.closePeriod')}</Label>
                <p className="text-xs text-muted-foreground">{t('budgetPeriods.closePeriodHint')}</p>
              </div>
              <Switch
                checked={formData.is_closed}
                onCheckedChange={(checked) => setFormData({ ...formData, is_closed: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('action.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? t('action.saving') : t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('action.delete')} {periodToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t('budgetPeriods.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Sheet */}
      <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('budgetPeriods.periodDetail')}</SheetTitle>
            <SheetDescription>
              {t('budgetPeriods.periodDetailDesc')}
            </SheetDescription>
          </SheetHeader>
          {selectedPeriod && (
            <div className="mt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('common.name')}</p>
                    <p className="text-lg font-semibold">{selectedPeriod.name}</p>
                  </div>
                  <div className="flex gap-1">
                    {selectedPeriod.is_active && (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t('common.active')}
                      </Badge>
                    )}
                    {selectedPeriod.is_closed && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        {t('budgetPeriods.closed')}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">{t('budgetPeriods.year')}</p>
                    <p className="text-2xl font-bold text-primary">{selectedPeriod.year}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">{t('budgetPeriods.duration')}</p>
                    <p className="text-lg font-semibold">
                      {Math.ceil((new Date(selectedPeriod.end_date).getTime() - new Date(selectedPeriod.start_date).getTime()) / (1000 * 60 * 60 * 24))} {t('budgetPeriods.days')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t('budgetPeriods.period')}</p>
                  <div className="flex items-center gap-2 text-foreground">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(selectedPeriod.start_date)}</span>
                    <span>—</span>
                    <span>{formatDate(selectedPeriod.end_date)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common.createdAt')}</span>
                    <span>{formatDate(selectedPeriod.created_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common.updatedAt')}</span>
                    <span>{formatDate(selectedPeriod.updated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsDetailSheetOpen(false);
                    handleEdit(selectedPeriod);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {t('action.edit')}
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setIsDetailSheetOpen(false);
                    handleDelete(selectedPeriod);
                  }}
                  disabled={selectedPeriod.is_closed}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BudgetPeriods;
