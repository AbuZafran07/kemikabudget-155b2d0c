import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
import {
  Building,
  Search,
  Check,
  FileSpreadsheet,
  Loader2,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TablePagination } from '@/components/common/TablePagination';

interface BankPayment {
  id: string;
  request_number: string;
  description: string;
  amount: number;
  beneficiary_name: string | null;
  beneficiary_bank: string | null;
  beneficiary_account: string | null;
  beneficiary_email: string | null;
  status: string;
  approved_at: string | null;
  division?: { name: string; code: string };
  funding_source?: { name: string; bank_name: string };
}

const BankPayments = () => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const dateLocale = language === 'id' ? localeId : enUS;

  // Fetch bank payments (approved requests with bank funding source)
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['bank-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          id,
          request_number,
          description,
          amount,
          beneficiary_name,
          beneficiary_bank,
          beneficiary_account,
          beneficiary_email,
          status,
          approved_at,
          division:divisions(name, code),
          funding_source:funding_sources(name, bank_name, type)
        `)
        .eq('status', 'approved')
        .not('funding_source_id', 'is', null)
        .order('approved_at', { ascending: true });

      if (error) throw error;

      // Filter only bank type funding sources
      return (data || []).filter(
        (p) => (p.funding_source as any)?.type === 'bank'
      ) as BankPayment[];
    },
  });

  const filteredPayments = useMemo(() => {
    const filtered = payments.filter(
      (p) =>
        p.request_number?.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase()) ||
        p.beneficiary_name?.toLowerCase().includes(search.toLowerCase())
    );
    return filtered;
  }, [payments, search]);

  // Reset to page 1 when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [search]);

  // Paginated data
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, currentPage, pageSize]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const maskAccountNumber = (account: string | null) => {
    if (!account || account.length < 8) return account || '-';
    return account.slice(0, 4) + '****' + account.slice(-4);
  };

  const handleSelectAll = () => {
    if (selectedPayments.length === filteredPayments.length) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments(filteredPayments.map((p) => p.id));
    }
  };

  const handleSelect = (id: string) => {
    setSelectedPayments((prev) =>
      prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id]
    );
  };

  const selectedTotal = payments
    .filter((p) => selectedPayments.includes(p.id))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const exportBatchCSV = () => {
    const selectedItems = payments.filter((p) => selectedPayments.includes(p.id));
    
    if (selectedItems.length === 0) {
      toast({
        title: t('common.noItemSelected'),
        description: t('common.selectAtLeastOne'),
        variant: 'destructive',
      });
      return;
    }

    // CSV format for bank transfer (common format)
    const headers = [
      'No',
      'Beneficiary Name',
      'Bank Name',
      'Account Number',
      'Amount',
      'Reference',
      'Description',
      'Email',
    ];

    const csvRows = selectedItems.map((item, index) => [
      index + 1,
      `"${item.beneficiary_name || ''}"`,
      `"${item.beneficiary_bank || ''}"`,
      `"${item.beneficiary_account || ''}"`,
      item.amount,
      `"${item.request_number}"`,
      `"${item.description.substring(0, 50)}"`,
      `"${item.beneficiary_email || ''}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `batch_payment_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();

    toast({
      title: t('bankPayments.csvExported'),
      description: `${selectedItems.length} ${t('bankPayments.paymentsExported')}`,
    });
  };

  // Process batch payment
  const processBatchPayment = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      const results = [];

      for (const paymentId of selectedPayments) {
        const { data, error } = await supabase.rpc('pay_request', {
          p_request_id: paymentId,
          p_payment_note: 'Batch payment processed',
        });

        if (error) {
          results.push({ id: paymentId, success: false, error: error.message });
        } else {
          const result = data as { success: boolean; error?: string };
          results.push({ id: paymentId, ...result });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      queryClient.invalidateQueries({ queryKey: ['bank-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-queue'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });

      setSelectedPayments([]);
      setIsBatchDialogOpen(false);
      setIsProcessing(false);

      toast({
        title: t('bankPayments.batchComplete'),
        description: `${successCount} ${t('bankPayments.successCount')}, ${failCount} ${t('bankPayments.failCount')}`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('bankPayments.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('bankPayments.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportBatchCSV}
            disabled={selectedPayments.length === 0}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('bankPayments.exportCsv')}
          </Button>
          <Button
            onClick={() => setIsBatchDialogOpen(true)}
            disabled={selectedPayments.length === 0}
            className="gap-2"
          >
            <Package className="h-4 w-4" />
            {t('bankPayments.batchPay')} ({selectedPayments.length})
          </Button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('bankPayments.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        {selectedPayments.length > 0 && (
          <div className="bg-primary/10 rounded-lg px-4 py-2">
            <p className="text-sm text-primary font-medium">
              {selectedPayments.length} {t('bankPayments.selected')} • Total: {formatCurrency(selectedTotal)}
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedPayments.length === filteredPayments.length && filteredPayments.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>{t('requests.requestNumber')}</TableHead>
              <TableHead>{t('requests.division')}</TableHead>
              <TableHead>{t('bankPayments.recipient')}</TableHead>
              <TableHead>{t('paymentQueue.bank')}</TableHead>
              <TableHead>{t('bankPayments.accountNumber')}</TableHead>
              <TableHead className="text-right">{t('requests.amount')}</TableHead>
              <TableHead>{t('bankPayments.approvedDate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Building className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('bankPayments.noData')}</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedPayments.map((payment) => (
                <TableRow
                  key={payment.id}
                  className={selectedPayments.includes(payment.id) ? 'bg-primary/5' : ''}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedPayments.includes(payment.id)}
                      onCheckedChange={() => handleSelect(payment.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {payment.request_number}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(payment.division as any)?.code}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">
                        {payment.beneficiary_name || '-'}
                      </p>
                      {payment.beneficiary_email && (
                        <p className="text-xs text-muted-foreground">
                          {payment.beneficiary_email}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{payment.beneficiary_bank || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {maskAccountNumber(payment.beneficiary_account)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(Number(payment.amount))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.approved_at
                      ? format(new Date(payment.approved_at), 'dd MMM yyyy', { locale: dateLocale })
                      : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredPayments.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Batch Payment Dialog */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('bankPayments.confirmBatch')}</DialogTitle>
            <DialogDescription>
              {t('bankPayments.confirmBatchDesc')} {selectedPayments.length}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('bankPayments.transactionCount')}</span>
                <span className="font-medium">{selectedPayments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('bankPayments.totalPayment')}</span>
                <span className="font-bold text-primary text-lg">
                  {formatCurrency(selectedTotal)}
                </span>
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <p className="text-sm text-foreground">
                <strong>{t('common.attention')}:</strong> {t('bankPayments.warningNote')}
              </p>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>{t('bankPayments.requestList')}:</p>
              <ul className="list-disc list-inside mt-2 max-h-32 overflow-y-auto">
                {payments
                  .filter((p) => selectedPayments.includes(p.id))
                  .map((p) => (
                    <li key={p.id}>
                      {p.request_number} - {formatCurrency(Number(p.amount))}
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBatchDialogOpen(false)}
              disabled={isProcessing}
            >
              {t('action.cancel')}
            </Button>
            <Button
              onClick={() => processBatchPayment.mutate()}
              disabled={isProcessing}
              className="gap-2"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isProcessing ? t('paymentQueue.processing') : t('bankPayments.processPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankPayments;
