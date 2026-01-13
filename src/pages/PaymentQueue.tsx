import { useState } from "react";
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

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const fundingSourceConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  petty_cash: { label: "Kas Kecil", icon: Wallet, color: "text-success" },
  bank: { label: "Bank", icon: Building2, color: "text-info" },
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // Dialog state
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");

  const filteredPayments = payments?.filter((item) => {
    const matchesSearch =
      item.request_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSource = sourceFilter === "all" || 
      (sourceFilter === "petty_cash" && item.funding_sources?.type === "petty_cash") ||
      (sourceFilter === "bank" && item.funding_sources?.type === "bank");
    
    return matchesSearch && matchesSource;
  }) || [];

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
    setIsPayDialogOpen(true);
  };

  const confirmPay = async () => {
    if (!selectedPayment) return;

    await payRequest.mutateAsync({
      requestId: selectedPayment.id,
      note: paymentNote || undefined,
    });

    setIsPayDialogOpen(false);
    setSelectedPayment(null);
    setSelectedItems(prev => prev.filter(id => id !== selectedPayment.id));
  };

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
              Antrian Pembayaran
            </h1>
            <Badge className="bg-primary text-primary-foreground">
              {totalPending}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Pengajuan yang disetujui siap untuk dibayar • Total: {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">{overdueCount} overdue</span>
            </div>
          )}
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedItems.length} dipilih • {formatCurrency(selectedTotal)}
              </span>
              <Button className="gap-2">
                <CreditCard className="h-4 w-4" />
                Batch Payment
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
              placeholder="Cari nomor atau deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sumber Dana" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Sumber</SelectItem>
              <SelectItem value="petty_cash">Kas Kecil</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Payment Cards */}
      <div className="space-y-4">
        {filteredPayments.length > 0 && (
          <div className="flex items-center gap-3 px-2">
            <Checkbox
              checked={
                selectedItems.length === filteredPayments.length &&
                filteredPayments.length > 0
              }
              onCheckedChange={selectAll}
            />
            <span className="text-sm text-muted-foreground">Pilih Semua</span>
          </div>
        )}

        {filteredPayments.map((item) => {
          const sourceType = item.funding_sources?.type || 'bank';
          const sourceConfig = fundingSourceConfig[sourceType] || fundingSourceConfig.bank;
          const SourceIcon = sourceConfig.icon;

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
                {/* Checkbox */}
                <Checkbox
                  checked={selectedItems.includes(item.id)}
                  onCheckedChange={() => toggleSelection(item.id)}
                  className="self-start lg:self-center"
                />

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {item.request_number}
                    </code>
                    <Badge variant="outline" className="text-xs">
                      {item.divisions?.code || 'N/A'}
                    </Badge>
                    <div className={`flex items-center gap-1 ${sourceConfig.color}`}>
                      <SourceIcon className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">
                        {item.funding_sources?.name || sourceConfig.label}
                      </span>
                    </div>
                    {item.isOverdue && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {item.description}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Oleh: {item.profiles?.full_name || 'N/A'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      Approved {item.daysSinceApproval} hari lalu
                    </span>
                  </div>

                  {/* Document Checklist */}
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
                      Invoice
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

                {/* Amount */}
                <div className="text-right lg:min-w-[150px]">
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(item.amount)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.vendor || 'Tanpa vendor'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-4">
                  <Button 
                    className="gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePay(item);
                    }}
                  >
                    <CreditCard className="h-4 w-4" />
                    Bayar
                  </Button>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPayments.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Tidak Ada Pembayaran Menunggu
          </h3>
          <p className="text-muted-foreground">
            Semua pembayaran sudah diproses.
          </p>
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proses Pembayaran</DialogTitle>
            <DialogDescription>
              {selectedPayment && (
                <>
                  Anda akan memproses pembayaran untuk{" "}
                  <strong>{selectedPayment.request_number}</strong> sebesar{" "}
                  <strong>{formatCurrency(selectedPayment.amount)}</strong>.
                  <br />
                  <span className="text-warning">
                    Dana akan dikurangi dari {selectedPayment.funding_sources?.name || 'sumber dana'}.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Payment Details */}
            {selectedPayment?.beneficiary_name && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Detail Penerima
                </h4>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Nama:</span> {selectedPayment.beneficiary_name}</p>
                  <p><span className="text-muted-foreground">Bank:</span> {selectedPayment.beneficiary_bank}</p>
                  <p><span className="text-muted-foreground">Rekening:</span> {selectedPayment.beneficiary_account}</p>
                </div>
              </div>
            )}

            {/* Document Checklist */}
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Kelengkapan Dokumen
              </h4>
              <div className="flex gap-4">
                <div className={`flex items-center gap-1.5 text-sm ${selectedPayment?.hasInvoice ? "text-success" : "text-warning"}`}>
                  {selectedPayment?.hasInvoice ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  Invoice
                </div>
                <div className={`flex items-center gap-1.5 text-sm ${selectedPayment?.hasQuotation ? "text-success" : "text-warning"}`}>
                  {selectedPayment?.hasQuotation ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  Quotation
                </div>
              </div>
              {(!selectedPayment?.hasInvoice && !selectedPayment?.hasQuotation) && (
                <p className="text-xs text-warning">
                  Perhatian: Tidak ada invoice atau quotation. Pembayaran tetap dapat diproses dengan catatan.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentNote">Catatan Pembayaran</Label>
              <Textarea
                id="paymentNote"
                placeholder="Tambahkan catatan pembayaran..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={confirmPay}
              disabled={payRequest.isPending}
              className="gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Proses Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentQueue;
