import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Wallet,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Building,
  Banknote,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TablePagination } from '@/components/common/TablePagination';
import { usePermissions } from '@/hooks/usePermissions';


interface FundingSource {
  id: string;
  code: string;
  name: string;
  type: 'petty_cash' | 'bank';
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  balance: number;
  is_active: boolean;
  created_at: string;
}

const FundingSources = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { canManageMasterData } = usePermissions();
  
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<FundingSource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<FundingSource | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'bank' as 'petty_cash' | 'bank',
    bank_name: '',
    account_number: '',
    account_holder: '',
    balance: 0,
    is_active: true,
  });

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['funding-sources-management'],
    queryFn: async () => {
      // Explicit column selection for super_admin - includes all fields
      const { data, error } = await supabase
        .from('funding_sources')
        .select('id, code, name, type, is_active, account_number, account_holder, bank_name, balance, created_at')
        .order('name');
      if (error) throw error;
      return data as FundingSource[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('funding_sources').insert([{
        ...data,
        bank_name: data.type === 'bank' ? data.bank_name : null,
        account_number: data.type === 'bank' ? data.account_number : null,
        account_holder: data.type === 'bank' ? data.account_holder : null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funding-sources-management'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t('common.success'), description: t('fundingSources.addSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: typeof formData & { id: string }) => {
      const { error } = await supabase.from('funding_sources').update({
        ...data,
        bank_name: data.type === 'bank' ? data.bank_name : null,
        account_number: data.type === 'bank' ? data.account_number : null,
        account_holder: data.type === 'bank' ? data.account_holder : null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funding-sources-management'] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t('common.success'), description: t('fundingSources.updateSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check if there are any requests using this funding source
      const { data: requests } = await supabase
        .from('requests')
        .select('id')
        .eq('funding_source_id', id)
        .limit(1);
      
      if (requests && requests.length > 0) {
        throw new Error(t('fundingSources.deleteError'));
      }
      
      const { error } = await supabase.from('funding_sources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funding-sources-management'] });
      toast({ title: t('common.success'), description: t('fundingSources.deleteSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      type: 'bank',
      bank_name: '',
      account_number: '',
      account_holder: '',
      balance: 0,
      is_active: true,
    });
    setEditingSource(null);
  };

  const handleEdit = (source: FundingSource) => {
    setEditingSource(source);
    setFormData({
      code: source.code,
      name: source.name,
      type: source.type as 'petty_cash' | 'bank',
      bank_name: source.bank_name || '',
      account_number: source.account_number || '',
      account_holder: source.account_holder || '',
      balance: source.balance,
      is_active: source.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (source: FundingSource) => {
    setSourceToDelete(source);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (sourceToDelete) {
      deleteMutation.mutate(sourceToDelete.id);
    }
    setDeleteDialogOpen(false);
    setSourceToDelete(null);
  };

  const handleSubmit = () => {
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const filteredSources = useMemo(() => {
    const filtered = sources.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase())
    );
    return filtered;
  }, [sources, search]);

  // Reset to page 1 when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [search]);

  // Paginated data
  const paginatedSources = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSources.slice(start, start + pageSize);
  }, [filteredSources, currentPage, pageSize]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('fundingSources.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('fundingSources.description')}</p>
        </div>
        {canManageMasterData() && (
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('fundingSources.addSource')}
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('fundingSources.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.code')}</TableHead>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('fundingSources.type')}</TableHead>
              <TableHead>{t('fundingSources.bankAccount')}</TableHead>
              <TableHead className="text-right">{t('fundingSources.balance')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedSources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Wallet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('fundingSources.noData')}</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedSources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-mono font-medium">{source.code}</TableCell>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {source.type === 'petty_cash' ? (
                        <><Banknote className="h-3 w-3" /> {t('paymentQueue.pettyCash')}</>
                      ) : (
                        <><Building className="h-3 w-3" /> {t('paymentQueue.bank')}</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {source.type === 'bank' ? (
                      <div>
                        <p>{source.bank_name}</p>
                        <p className="text-xs font-mono">{source.account_number}</p>
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(Number(source.balance))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.is_active ? 'default' : 'secondary'}>
                      {source.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(source)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(source)}
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
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredSources.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSource ? t('fundingSources.editSource') : t('fundingSources.addSource')}</DialogTitle>
            <DialogDescription>
              {editingSource ? t('fundingSources.editSourceDesc') : t('fundingSources.addSourceDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('common.code')}</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="BANK_BCA"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Bank BCA"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('fundingSources.type')}</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: 'petty_cash' | 'bank') => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="petty_cash">{t('paymentQueue.pettyCash')}</SelectItem>
                    <SelectItem value="bank">{t('paymentQueue.bank')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('fundingSources.initialBalance')}</Label>
                <Input
                  type="number"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            {formData.type === 'bank' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('fundingSources.bankName')}</Label>
                    <Input
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      placeholder="Bank Central Asia"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('fundingSources.accountNumber')}</Label>
                    <Input
                      value={formData.account_number}
                      onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                      placeholder="1234567890"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('fundingSources.accountHolder')}</Label>
                  <Input
                    value={formData.account_holder}
                    onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                    placeholder="PT. Kemika Karya Pratama"
                  />
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <Label>{t('common.activeStatus')}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('action.delete')} {sourceToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.deleteWarning')}
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
    </div>
  );
};

export default FundingSources;
