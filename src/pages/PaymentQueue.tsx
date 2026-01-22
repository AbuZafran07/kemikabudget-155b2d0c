import { useState, useMemo } from "react";
import {
  Search,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  Download,
  ChevronRight,
  Building2,
  Wallet,
  FileCheck,
  FileText,
  Loader2,
  Package,
  Eye,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { usePaymentQueue, PaymentRequest } from "@/hooks/usePaymentQueue";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  generatePaymentCSV,
  downloadCSV,
  generateBatchPaymentFilename,
  PaymentExportRow,
} from "@/lib/exportUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { PaymentFundingSourceSelector } from "@/components/payments/PaymentFundingSourceSelector";
import { PDFPreviewDialog } from "@/components/payments/PDFPreviewDialog";
import { PengajuanDanaData } from "@/lib/generatePengajuanDanaPDF";
import { TablePagination } from "@/components/common/TablePagination";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const PaymentQueue = () => {
  const {
    payments,
    fundingSources,
    isLoading,
    payRequest,
    overdueCount,
    totalPending,
    totalAmount,
  } = usePaymentQueue();

  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fundingSourceConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    petty_cash: { label: t('paymentQueue.pettyCash'), icon: Wallet, color: "text-success" },
    bank: { label: t('paymentQueue.bank'), icon: Building2, color: "text-info" },
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Dialog state
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<{ id: string; success: boolean; error?: string }[]>([]);
  const [lastPaidPayment, setLastPaidPayment] = useState<PaymentRequest | null>(null);
  
  // Funding source selection for payments without funding_source_id
  const [selectedFundingSourceId, setSelectedFundingSourceId] = useState<string | null>(null);
  const [isUpdatingFundingSource, setIsUpdatingFundingSource] = useState(false);

  // PDF Preview state
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<PengajuanDanaData | null>(null);

  const filteredPayments = useMemo(() => {
    return payments?.filter((item) => {
      const matchesSearch =
        item.request_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "petty_cash" && item.funding_sources?.type === "petty_cash") ||
        (sourceFilter === "bank" && item.funding_sources?.type === "bank");
      
      return matchesSearch && matchesSource;
    }) || [];
  }, [payments, searchQuery, sourceFilter]);

  // Reset to page 1 when filter changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery, sourceFilter]);

  // Paginated payments
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, currentPage, pageSize]);

  const toggleSelection = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedItems.length === filteredPayments.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredPayments.map((p) => p.id));
    }
  };

  const selectedTotal = filteredPayments
    .filter((p) => selectedItems.includes(p.id))
    .reduce((sum, p) => sum + p.amount, 0);

  const handlePay = (payment: PaymentRequest) => {
    setSelectedPayment(payment);
    setPaymentNote("");
    // Pre-fill with existing funding source if available
    setSelectedFundingSourceId(payment.funding_source_id);
    setIsPayDialogOpen(true);
  };

  const confirmPay = async () => {
    if (!selectedPayment) return;

    // Check if funding source is selected
    const fundingSourceToUse = selectedFundingSourceId || selectedPayment.funding_source_id;
    if (!fundingSourceToUse) {
      toast({
        title: language === 'id' ? 'Sumber Dana Diperlukan' : 'Funding Source Required',
        description: language === 'id' 
          ? 'Pilih sumber dana sebelum memproses pembayaran' 
          : 'Select a funding source before processing payment',
        variant: 'destructive',
      });
      return;
    }

    // If funding source was newly selected, update the request first
    if (!selectedPayment.funding_source_id && selectedFundingSourceId) {
      setIsUpdatingFundingSource(true);
      const { error: updateError } = await supabase
        .from('requests')
        .update({ funding_source_id: selectedFundingSourceId })
        .eq('id', selectedPayment.id);
      
      if (updateError) {
        setIsUpdatingFundingSource(false);
        toast({
          title: language === 'id' ? 'Gagal Update Sumber Dana' : 'Failed to Update Funding Source',
          description: updateError.message,
          variant: 'destructive',
        });
        return;
      }
      setIsUpdatingFundingSource(false);
    }

    await payRequest.mutateAsync({
      requestId: selectedPayment.id,
      note: paymentNote || undefined,
    });

    setLastPaidPayment(selectedPayment);
    setIsPayDialogOpen(false);
    setSelectedPayment(null);
    setSelectedFundingSourceId(null);
    setSelectedItems(prev => prev.filter(id => id !== selectedPayment.id));
  };

  // Batch payment processing
  const processBatchPayment = async () => {
    if (selectedItems.length === 0) return;

    setIsBatchProcessing(true);
    setBatchResults([]);
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const paymentId of selectedItems) {
      const { data, error } = await supabase.rpc('pay_request', {
        p_request_id: paymentId,
        p_payment_note: 'Batch payment processed',
      });

      if (error) {
        results.push({ id: paymentId, success: false, error: error.message });
      } else {
        const result = data as { success: boolean; error?: string };
        results.push({ id: paymentId, success: result.success, error: result.error });
      }
    }

    setBatchResults(results);
    setIsBatchProcessing(false);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    queryClient.invalidateQueries({ queryKey: ['payment-queue'] });
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['funding_sources'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });

    if (successCount > 0) {
      setSelectedItems([]);
      toast({
        title: t('paymentQueue.batchComplete'),
        description: `${successCount} ${language === 'id' ? 'berhasil' : 'succeeded'}${failCount > 0 ? `, ${failCount} ${language === 'id' ? 'gagal' : 'failed'}` : ''}`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });
    }

    if (failCount === 0) {
      setIsBatchDialogOpen(false);
    }
  };

  // Generate PDF preview for a payment
  const handlePreviewPDF = async (payment: PaymentRequest) => {
    const { data, error } = await supabase
      .from('requests')
      .select(`
        *,
        division:divisions(name, code),
        category:cost_categories(name, code),
        funding_source:funding_source_options(name, type)
      `)
      .eq('id', payment.id)
      .single();

    if (error || !data) {
      toast({
        title: t('common.error'),
        description: language === 'id' ? 'Gagal mengambil data untuk dokumen' : 'Failed to fetch document data',
        variant: 'destructive',
      });
      return;
    }

    // Get requester profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', data.requester_id)
      .single();

    // Get approver profile if approved
    let approverProfile = null;
    if (data.approved_by) {
      const { data: approver } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.approved_by)
        .single();
      approverProfile = approver;
    }

    // Get attachments
    const { data: attachments } = await supabase
      .from('request_attachments')
      .select('attachment_type, file_name')
      .eq('request_id', payment.id);

    const pdfData: PengajuanDanaData = {
      request_number: data.request_number,
      description: data.description,
      amount: data.amount,
      approved_amount: data.approved_amount,
      vendor: data.vendor,
      payment_method: data.payment_method,
      beneficiary_name: data.beneficiary_name,
      beneficiary_bank: data.beneficiary_bank,
      beneficiary_account: data.beneficiary_account,
      needed_date: data.needed_date,
      created_at: data.created_at,
      approved_at: data.approved_at,
      division: data.division as any,
      category: data.category as any,
      requester: profile || undefined,
      approver: approverProfile,
      funding_source: data.funding_source as any,
      attachments: attachments || [],
    };

    setPdfPreviewData(pdfData);
    setIsPDFPreviewOpen(true);
  };

  // Generate receipt PDF for a paid payment
  const handleGenerateReceipt = async (payment: PaymentRequest) => {
    // Use the same preview flow
    await handlePreviewPDF(payment);
  };

  const handleExportSelected = () => {
    if (selectedItems.length === 0) {
      toast({
        title: language === 'id' ? 'Tidak ada item dipilih' : 'No items selected',
        description: language === 'id' ? 'Pilih satu atau lebih pembayaran untuk diekspor' : 'Select one or more payments to export',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const selectedPayments = filteredPayments.filter((p) => selectedItems.includes(p.id));
      
      const exportData: PaymentExportRow[] = selectedPayments.map((p) => ({
        request_number: p.request_number,
        description: p.description,
        division_name: p.divisions?.name || 'N/A',
        category_name: p.cost_categories?.name || 'N/A',
        amount: p.amount,
        vendor: p.vendor,
        funding_source: p.funding_sources?.name || 'N/A',
        beneficiary_name: p.beneficiary_name,
        beneficiary_bank: p.beneficiary_bank,
        beneficiary_account: p.beneficiary_account,
        requester_name: p.profiles?.full_name || 'N/A',
        approved_at: p.approved_at,
      }));

      const csv = generatePaymentCSV(exportData);
      const filename = generateBatchPaymentFilename(selectedItems.length);
      downloadCSV(csv, filename);

      toast({
        title: t('paymentQueue.exportSuccess'),
        description: `${selectedItems.length} ${t('paymentQueue.paymentsExported')}`,
      });
    } catch (error) {
      toast({
        title: language === 'id' ? 'Export gagal' : 'Export failed',
        description: language === 'id' ? 'Terjadi kesalahan saat mengekspor data' : 'An error occurred while exporting data',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = () => {
    if (!filteredPayments.length) {
      toast({
        title: t('common.noData'),
        description: language === 'id' ? 'Tidak ada pembayaran untuk diekspor' : 'No payments to export',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const exportData: PaymentExportRow[] = filteredPayments.map((p) => ({
        request_number: p.request_number,
        description: p.description,
        division_name: p.divisions?.name || 'N/A',
        category_name: p.cost_categories?.name || 'N/A',
        amount: p.amount,
        vendor: p.vendor,
        funding_source: p.funding_sources?.name || 'N/A',
        beneficiary_name: p.beneficiary_name,
        beneficiary_bank: p.beneficiary_bank,
        beneficiary_account: p.beneficiary_account,
        requester_name: p.profiles?.full_name || 'N/A',
        approved_at: p.approved_at,
      }));

      const csv = generatePaymentCSV(exportData);
      const filename = generateBatchPaymentFilename(filteredPayments.length);
      downloadCSV(csv, filename);

      toast({
        title: t('paymentQueue.exportSuccess'),
        description: `${filteredPayments.length} ${t('paymentQueue.paymentsExported')}`,
      });
    } catch (error) {
      toast({
        title: language === 'id' ? 'Export gagal' : 'Export failed',
        description: language === 'id' ? 'Terjadi kesalahan saat mengekspor data' : 'An error occurred while exporting data',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Check if selected payment needs funding source
  const needsFundingSource = selectedPayment && !selectedPayment.funding_source_id;
  const canProcessPayment = selectedPayment && (selectedPayment.funding_source_id || selectedFundingSourceId);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              {t('paymentQueue.title')}
            </h1>
            <Badge className="bg-primary text-primary-foreground">
              {totalPending}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t('paymentQueue.description')} • {t('paymentQueue.total')}: {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">{overdueCount} {t('paymentQueue.overdue')}</span>
            </div>
          )}
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedItems.length} {t('paymentQueue.selected')} • {formatCurrency(selectedTotal)}
              </span>
              <Button 
                variant="outline"
                className="gap-2"
                onClick={handleExportSelected}
                disabled={isExporting}
              >
                <Download className="h-4 w-4" />
                {t('action.export')}
              </Button>
              <Button 
                className="gap-2"
                onClick={() => setIsBatchDialogOpen(true)}
              >
                <Package className="h-4 w-4" />
                {t('paymentQueue.batchPay')} ({selectedItems.length})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('requests.fundingSource')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('paymentQueue.allSources')}</SelectItem>
              <SelectItem value="petty_cash">{t('paymentQueue.pettyCash')}</SelectItem>
              <SelectItem value="bank">{t('paymentQueue.bank')}</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleExportAll}
            disabled={isExporting || !filteredPayments.length}
          >
            <Download className="h-4 w-4" />
            {t('paymentQueue.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Payment Cards */}
      <div className="space-y-4">
        {paginatedPayments.length > 0 && (
          <div className="flex items-center gap-3 px-2">
            <Checkbox
              checked={
                selectedItems.length === paginatedPayments.length &&
                paginatedPayments.length > 0
              }
              onCheckedChange={() => {
                if (selectedItems.length === paginatedPayments.length) {
                  setSelectedItems([]);
                } else {
                  setSelectedItems(paginatedPayments.map(p => p.id));
                }
              }}
            />
            <span className="text-sm text-muted-foreground">{t('paymentQueue.selectAll')}</span>
          </div>
        )}
        {paginatedPayments.map((item) => {
          const sourceType = item.funding_sources?.type || 'bank';
          const sourceConfig = fundingSourceConfig[sourceType] || fundingSourceConfig.bank;
          const SourceIcon = sourceConfig.icon;
          const hasFundingSource = !!item.funding_source_id;

          return (
            <div
              key={item.id}
              className={`bg-card rounded-xl border p-5 transition-all hover:shadow-card-hover cursor-pointer group ${
                item.isOverdue
                  ? "border-destructive/40"
                  : selectedItems.includes(item.id)
                  ? "border-primary"
                  : "border-border"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <Checkbox
                  checked={selectedItems.includes(item.id)}
                  onCheckedChange={() => toggleSelection(item.id)}
                  className="self-start lg:self-center"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {item.request_number}
                    </code>
                    <Badge variant="outline" className="text-xs">
                      {item.divisions?.code || 'N/A'}
                    </Badge>
                    {hasFundingSource ? (
                      <div className={`flex items-center gap-1 ${sourceConfig.color}`}>
                        <SourceIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">
                          {item.funding_sources?.name || sourceConfig.label}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-warning border-warning">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {language === 'id' ? 'Belum ada sumber dana' : 'No funding source'}
                      </Badge>
                    )}
                    {item.isOverdue && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('paymentQueue.overdue')}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {item.description}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{t('common.by')}: {item.profiles?.full_name || 'N/A'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      Approved {item.daysSinceApproval} {t('paymentQueue.daysAgo')}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <div
                      className={`flex items-center gap-1.5 text-xs ${
                        item.hasInvoice ? "text-success" : "text-warning"
                      }`}
                    >
                      {item.hasInvoice ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {t('paymentQueue.invoice')}
                    </div>
                    <div
                      className={`flex items-center gap-1.5 text-xs ${
                        item.hasQuotation ? "text-success" : "text-warning"
                      }`}
                    >
                      {item.hasQuotation ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      Quotation
                    </div>
                    {item.beneficiary_name && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {item.beneficiary_bank} • {item.beneficiary_account?.slice(-4).padStart(item.beneficiary_account.length, '•')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right lg:min-w-[180px]">
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(item.amount)}
                  </p>
                  {item.approved_amount !== null && item.approved_amount !== item.amount && (
                    <div className="mt-0.5">
                      <span className="text-xs text-muted-foreground">{t('approvals.approvedAmount') || 'Disetujui'}: </span>
                      <span className="text-sm font-semibold text-warning">
                        {formatCurrency(item.approved_amount)}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {item.vendor || t('requests.noVendor')}
                  </p>
                </div>

                <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-4">
                  <Button 
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewPDF(item);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    className="gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePay(item);
                    }}
                  >
                    <CreditCard className="h-4 w-4" />
                    {t('action.pay')}
                  </Button>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {filteredPayments.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <TablePagination
            currentPage={currentPage}
            totalItems={filteredPayments.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {filteredPayments.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t('paymentQueue.noPayments')}
          </h3>
          <p className="text-muted-foreground">
            {t('paymentQueue.allPaid')}
          </p>
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('paymentQueue.confirmPay')}</DialogTitle>
            <DialogDescription>
              {selectedPayment && (
                <>
                  {language === 'id' 
                    ? `Anda akan memproses pembayaran untuk ${selectedPayment.request_number} sebesar ${formatCurrency(selectedPayment.approved_amount || selectedPayment.amount)}.`
                    : `You will process payment for ${selectedPayment.request_number} of ${formatCurrency(selectedPayment.approved_amount || selectedPayment.amount)}.`
                  }
                  <br />
                  <span className="text-warning">
                    {t('paymentQueue.fundsWillBeDeducted')}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Funding Source Selector - show if no funding source */}
            {needsFundingSource && (
              <PaymentFundingSourceSelector
                fundingSources={fundingSources}
                selectedFundingSourceId={selectedFundingSourceId}
                onSelect={setSelectedFundingSourceId}
                paymentAmount={selectedPayment?.approved_amount || selectedPayment?.amount || 0}
              />
            )}

            {/* Show existing funding source info */}
            {selectedPayment?.funding_source_id && selectedPayment.funding_sources && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  {selectedPayment.funding_sources.type === 'petty_cash' ? (
                    <Wallet className="h-4 w-4" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  {language === 'id' ? 'Sumber Dana' : 'Funding Source'}
                </h4>
                <p className="text-sm">{selectedPayment.funding_sources.name}</p>
              </div>
            )}

            {selectedPayment?.beneficiary_name && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t('requests.beneficiaryInfo')}
                </h4>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">{t('common.name')}:</span> {selectedPayment.beneficiary_name}</p>
                  <p><span className="text-muted-foreground">{t('requests.beneficiaryBank')}:</span> {selectedPayment.beneficiary_bank}</p>
                  <p><span className="text-muted-foreground">{t('requests.beneficiaryAccount')}:</span> {selectedPayment.beneficiary_account}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                {language === 'id' ? 'Kelengkapan Dokumen' : 'Document Checklist'}
              </h4>
              <div className="flex gap-4">
                <div className={`flex items-center gap-1.5 text-sm ${selectedPayment?.hasInvoice ? "text-success" : "text-warning"}`}>
                  {selectedPayment?.hasInvoice ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  {t('paymentQueue.invoice')}
                </div>
                <div className={`flex items-center gap-1.5 text-sm ${selectedPayment?.hasQuotation ? "text-success" : "text-warning"}`}>
                  {selectedPayment?.hasQuotation ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  Quotation
                </div>
              </div>
              {(!selectedPayment?.hasInvoice && !selectedPayment?.hasQuotation) && (
                <p className="text-xs text-warning">
                  {language === 'id' 
                    ? 'Perhatian: Tidak ada invoice atau quotation. Pembayaran tetap dapat diproses dengan catatan.'
                    : 'Warning: No invoice or quotation attached. Payment can still be processed with a note.'
                  }
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentNote">{t('paymentQueue.paymentNote')}</Label>
              <Textarea
                id="paymentNote"
                placeholder={t('common.addNote')}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={confirmPay}
              disabled={payRequest.isPending || isUpdatingFundingSource || !canProcessPayment}
              className="gap-2"
            >
              {(payRequest.isPending || isUpdatingFundingSource) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {language === 'id' ? 'Proses Pembayaran' : 'Process Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Payment Dialog */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('paymentQueue.batchPayment')}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? `Proses pembayaran untuk ${selectedItems.length} transaksi sekaligus`
                : `Process payment for ${selectedItems.length} transactions at once`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'id' ? 'Jumlah Transaksi' : 'Transaction Count'}</span>
                <span className="font-medium">{selectedItems.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'id' ? 'Total Pembayaran' : 'Total Payment'}</span>
                <span className="font-bold text-primary text-lg">
                  {formatCurrency(selectedTotal)}
                </span>
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <p className="text-sm text-foreground">
                <strong>{language === 'id' ? 'Perhatian:' : 'Warning:'}</strong> {language === 'id' 
                  ? 'Tindakan ini akan memproses pembayaran dan mengurangi saldo kas secara otomatis. Pastikan semua data sudah benar sebelum melanjutkan.'
                  : 'This action will process payments and automatically deduct cash balance. Make sure all data is correct before proceeding.'
                }
              </p>
            </div>

            {batchResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {batchResults.map((r) => {
                  const payment = payments?.find(p => p.id === r.id);
                  return (
                    <div key={r.id} className={`text-sm flex items-center gap-2 ${r.success ? 'text-success' : 'text-destructive'}`}>
                      {r.success ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {payment?.request_number}: {r.success ? (language === 'id' ? 'Berhasil' : 'Success') : r.error}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBatchDialogOpen(false);
                setBatchResults([]);
              }}
              disabled={isBatchProcessing}
            >
              {batchResults.length > 0 ? t('action.close') : t('action.cancel')}
            </Button>
            {batchResults.filter(r => !r.success).length === 0 && batchResults.length === 0 && (
              <Button
                onClick={processBatchPayment}
                disabled={isBatchProcessing}
                className="gap-2"
              >
                {isBatchProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {isBatchProcessing ? t('paymentQueue.processing') : (language === 'id' ? 'Proses Pembayaran' : 'Process Payment')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Generated Dialog */}
      {lastPaidPayment && (
        <Dialog open={!!lastPaidPayment} onOpenChange={() => setLastPaidPayment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-success">
                <CheckCircle className="h-5 w-5" />
                {language === 'id' ? 'Pembayaran Berhasil' : 'Payment Successful'}
              </DialogTitle>
              <DialogDescription>
                {language === 'id' 
                  ? `Pembayaran untuk ${lastPaidPayment.request_number} telah diproses.`
                  : `Payment for ${lastPaidPayment.request_number} has been processed.`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-muted-foreground">
                {language === 'id' 
                  ? 'Apakah Anda ingin melihat dokumen pengajuan dana?'
                  : 'Would you like to view the fund request document?'
                }
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLastPaidPayment(null)}>
                {t('action.close')}
              </Button>
              <Button 
                onClick={() => {
                  handleGenerateReceipt(lastPaidPayment);
                  setLastPaidPayment(null);
                }}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {language === 'id' ? 'Lihat Dokumen' : 'View Document'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* PDF Preview Dialog */}
      <PDFPreviewDialog
        open={isPDFPreviewOpen}
        onOpenChange={setIsPDFPreviewOpen}
        data={pdfPreviewData}
      />
    </div>
  );
};

export default PaymentQueue;
