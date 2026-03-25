import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Eye,
  Heart,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useApprovals, ApprovalRequest } from "@/hooks/useApprovals";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { TablePagination } from "@/components/common/TablePagination";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const Approvals = () => {
  // Enable realtime updates
  useRealtimeSubscription({
    tables: ['requests', 'cash_advances', 'medical_claims'],
    queryKeys: [['approvals'], ['pending-approvals'], ['dashboard-stats']],
  });

  const {
    approvals,
    isLoading,
    approveRequest,
    rejectRequest,
    overdueCount,
    totalPending,
  } = useApprovals();

  const { t, language } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Dialog states
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");

  const filteredApprovals = approvals?.filter((item) => {
    const matchesSearch =
      item.request_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDivision =
      divisionFilter === "all" || item.divisions?.code === divisionFilter;
    const matchesType =
      typeFilter === "all" || item.type === typeFilter;
    return matchesSearch && matchesDivision && matchesType;
  }) || [];

  // Paginate
  const totalFiltered = filteredApprovals.length;
  const paginatedApprovals = filteredApprovals.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Get unique divisions from approvals
  const divisions = [...new Set(approvals?.map(a => a.divisions?.code).filter(Boolean))] as string[];

  // Reset page on filter/search change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };
  const handleDivisionFilterChange = (value: string) => {
    setDivisionFilter(value);
    setCurrentPage(1);
  };
  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setCurrentPage(1);
  };

  const handleApprove = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setApprovalNote("");
    setApprovedAmount(request.amount.toString());
    setIsApproveDialogOpen(true);
  };

  const handleReject = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setIsRejectDialogOpen(true);
  };

  const confirmApprove = async () => {
    if (!selectedRequest) return;
    
    const parsedAmount = parseFloat(approvedAmount.replace(/[^0-9]/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return; // Invalid amount
    }

    // Note required if amount is adjusted
    if (selectedRequest && parsedAmount !== selectedRequest.amount && !approvalNote.trim()) {
      return;
    }

    await approveRequest.mutateAsync({
      requestId: selectedRequest.id,
      note: approvalNote || undefined,
      approvedAmount: parsedAmount,
      type: selectedRequest.type,
    });

    setIsApproveDialogOpen(false);
    setSelectedRequest(null);
  };

  const confirmReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return;

    await rejectRequest.mutateAsync({
      requestId: selectedRequest.id,
      reason: rejectionReason,
      type: selectedRequest.type,
    });

    setIsRejectDialogOpen(false);
    setSelectedRequest(null);
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
            <h1 className="text-2xl font-bold text-foreground">{t('approvals.title')}</h1>
            <Badge className="bg-primary text-primary-foreground">
              {totalPending}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t('approvals.description')}
          </p>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              {overdueCount} {t('approvals.overdueWarning')}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={language === 'id' ? 'Tipe' : 'Type'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'id' ? 'Semua Tipe' : 'All Types'}</SelectItem>
              <SelectItem value="request">{language === 'id' ? 'Request' : 'Request'}</SelectItem>
              <SelectItem value="medical_claim">{language === 'id' ? 'Medical' : 'Medical'}</SelectItem>
              <SelectItem value="cash_advance">{language === 'id' ? 'Cash Advance' : 'Cash Advance'}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={divisionFilter} onValueChange={handleDivisionFilterChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('users.division')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allDivisions')}</SelectItem>
              {divisions.map((div) => (
                <SelectItem key={div} value={div}>
                  {div}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {paginatedApprovals.map((item) => (
          <div
            key={item.id}
            className={`bg-card rounded-xl border p-5 transition-all hover:shadow-card-hover cursor-pointer group ${
              item.isOverdue ? "border-destructive/40" : "border-border"
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Main Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                    {item.request_number}
                  </code>
                  {item.type === 'medical_claim' ? (
                    <Badge variant="outline" className="text-xs gap-1 bg-pink-500/10 text-pink-600 border-pink-500/30">
                      <Heart className="h-3 w-3" />
                      Medical
                    </Badge>
                  ) : item.type === 'cash_advance' ? (
                    <Badge variant="outline" className="text-xs gap-1 bg-blue-500/10 text-blue-600 border-blue-500/30">
                      <Wallet className="h-3 w-3" />
                      Cash Advance
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {item.divisions?.code || 'N/A'}
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
                  <span>{t('requests.category')}: {item.cost_categories?.name || 'N/A'}</span>
                  <span>•</span>
                  <span>{t('common.by')}: {item.profiles?.full_name || 'N/A'}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {item.daysPending} {t('approvals.daysPending')}
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right lg:min-w-[150px]">
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(item.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.vendor || t('requests.noVendor')}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-4">
                <Button
                  variant="outline"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReject(item);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                  {t('action.reject')}
                </Button>
                <Button
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(item);
                  }}
                >
                  <CheckCircle className="h-4 w-4" />
                  {t('action.approve')}
                </Button>
                <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalFiltered > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalItems={totalFiltered}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {filteredApprovals.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle className="h-16 w-16 text-success/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t('approvals.allProcessed')}
          </h3>
          <p className="text-muted-foreground">
            {t('approvals.noWaiting')}
          </p>
        </div>
      )}

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approvals.confirmApprove')}</DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <>
                  {language === 'id' 
                    ? `Anda akan menyetujui pengajuan ${selectedRequest.request_number} sebesar ${formatCurrency(selectedRequest.amount)}.`
                    : `You will approve request ${selectedRequest.request_number} for ${formatCurrency(selectedRequest.amount)}.`
                  }
                  <br />
                  <span className="text-warning">
                    {t('approvals.budgetWillBeDeducted')}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Approved Amount Field */}
            <div className="space-y-2">
              <Label htmlFor="approvedAmount">
                {language === 'id' ? 'Nilai yang Disetujui' : 'Approved Amount'}
                <span className="text-destructive ml-1">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  Rp
                </span>
                <Input
                  id="approvedAmount"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={new Intl.NumberFormat('id-ID').format(parseFloat(approvedAmount.replace(/[^0-9]/g, '')) || 0)}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setApprovedAmount(value);
                  }}
                  className="pl-10 text-lg font-semibold"
                />
              </div>
              {selectedRequest && approvedAmount && parseFloat(approvedAmount) !== selectedRequest.amount && (
                <p className="text-xs text-warning">
                  {language === 'id' 
                    ? `Nilai awal: ${formatCurrency(selectedRequest.amount)} → Koreksi: ${formatCurrency(parseFloat(approvedAmount) || 0)}`
                    : `Original: ${formatCurrency(selectedRequest.amount)} → Adjusted: ${formatCurrency(parseFloat(approvedAmount) || 0)}`
                  }
                </p>
              )}
            </div>

            {/* Approval Note Field */}
            <div className="space-y-2">
              <Label htmlFor="approvalNote">
                {t('approvals.approvalNote')}
                {selectedRequest && parseFloat(approvedAmount) !== selectedRequest?.amount && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Textarea
                id="approvalNote"
                placeholder={t('common.addNote')}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                rows={3}
              />
              {selectedRequest && parseFloat(approvedAmount) !== selectedRequest.amount && !approvalNote.trim() && (
                <p className="text-xs text-destructive">
                  {language === 'id' 
                    ? 'Catatan wajib diisi jika nilai dikoreksi'
                    : 'Note is required when amount is adjusted'
                  }
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={confirmApprove}
              disabled={
                approveRequest.isPending ||
                !approvedAmount ||
                parseFloat(approvedAmount) <= 0 ||
                (selectedRequest && parseFloat(approvedAmount) !== selectedRequest.amount && !approvalNote.trim())
              }
              className="gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {t('action.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('approvals.confirmReject')}</DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                language === 'id'
                  ? `Anda akan menolak pengajuan ${selectedRequest.request_number}.`
                  : `You will reject request ${selectedRequest.request_number}.`
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">
                {t('approvals.rejectionReason')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejectionReason"
                placeholder={language === 'id' ? 'Jelaskan alasan penolakan...' : 'Explain the rejection reason...'}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
              {!rejectionReason.trim() && (
                <p className="text-xs text-destructive">
                  {t('approvals.rejectionRequired')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectRequest.isPending || !rejectionReason.trim()}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              {t('action.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;