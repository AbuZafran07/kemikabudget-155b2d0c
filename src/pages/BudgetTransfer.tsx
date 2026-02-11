import { useState } from "react";
import { Plus, ArrowLeftRight, Search, Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBudgetTransfer } from "@/hooks/useBudgetTransfer";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";


type TransferStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

const BudgetTransfer = () => {
  const { profile, role } = useAuth();
  const { t, language } = useLanguage();
  
  
  const {
    transfers,
    divisionBudgets,
    isLoadingTransfers,
    createTransfer,
    submitTransfer,
    approveTransfer,
    rejectTransfer,
    isCreating,
    isApproving,
    isRejecting,
  } = useBudgetTransfer();

  const statusConfig: Record<TransferStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: t('status.draft'), variant: 'secondary' },
    submitted: { label: language === 'id' ? 'Menunggu Persetujuan' : 'Awaiting Approval', variant: 'outline' },
    approved: { label: t('status.approved'), variant: 'default' },
    rejected: { label: t('status.rejected'), variant: 'destructive' },
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    from_budget_id: "",
    to_budget_id: "",
    amount: "",
    reason: "",
  });

  const isSuperAdmin = role === 'super_admin';

  const filteredTransfers = transfers.filter((t) => {
    const matchesSearch =
      t.transfer_number?.toLowerCase().includes(search.toLowerCase()) ||
      t.reason?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleCreate = () => {
    if (!formData.from_budget_id || !formData.to_budget_id || !formData.amount || !formData.reason) {
      return;
    }

    const fromBudget = divisionBudgets.find(b => b.id === formData.from_budget_id);
    
    createTransfer({
      division_id: (fromBudget?.division as any)?.id || profile?.division_id || '',
      from_budget_id: formData.from_budget_id,
      to_budget_id: formData.to_budget_id,
      amount: parseFloat(formData.amount),
      reason: formData.reason,
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setFormData({ from_budget_id: "", to_budget_id: "", amount: "", reason: "" });
      },
    });
  };

  const handleSubmit = (transferId: string) => {
    submitTransfer(transferId);
  };

  const handleApprove = (transferId: string) => {
    approveTransfer(transferId);
  };

  const openRejectDialog = (transferId: string) => {
    setSelectedTransferId(transferId);
    setRejectionReason("");
    setIsRejectOpen(true);
  };

  const handleReject = () => {
    if (selectedTransferId && rejectionReason) {
      rejectTransfer({ transferId: selectedTransferId, reason: rejectionReason }, {
        onSuccess: () => {
          setIsRejectOpen(false);
          setSelectedTransferId(null);
          setRejectionReason("");
        },
      });
    }
  };

  const selectedFromBudget = divisionBudgets.find(b => b.id === formData.from_budget_id);
  const availableToBudgets = divisionBudgets.filter(b => 
    b.id !== formData.from_budget_id &&
    (selectedFromBudget ? (selectedFromBudget.division as any)?.id === (b.division as any)?.id : true)
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('budgetTransfer.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('budgetTransfer.description')}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {language === 'id' ? 'Buat Transfer' : 'Create Transfer'}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'id' ? 'Cari nomor transfer atau alasan...' : 'Search transfer number or reason...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={language === 'id' ? 'Filter Status' : 'Filter Status'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('status.all')}</SelectItem>
            <SelectItem value="draft">{t('status.draft')}</SelectItem>
            <SelectItem value="submitted">{language === 'id' ? 'Menunggu' : 'Pending'}</SelectItem>
            <SelectItem value="approved">{t('status.approved')}</SelectItem>
            <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{language === 'id' ? 'No. Transfer' : 'Transfer No.'}</TableHead>
              <TableHead>{t('budgetTransfer.from')} {t('requests.category')}</TableHead>
              <TableHead>{t('budgetTransfer.to')} {t('requests.category')}</TableHead>
              <TableHead className="text-right">{t('budgetTransfer.amount')}</TableHead>
              <TableHead>{t('budgetTransfer.reason')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingTransfers ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="animate-pulse text-muted-foreground">{t('common.loading')}</div>
                </TableCell>
              </TableRow>
            ) : filteredTransfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {language === 'id' ? 'Belum ada transfer budget' : 'No budget transfers yet'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredTransfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell className="font-mono text-sm">
                    {transfer.transfer_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {(transfer.from_budget?.category as any)?.name || '-'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(transfer.from_budget?.division as any)?.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {(transfer.to_budget?.category as any)?.name || '-'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {(transfer.to_budget?.division as any)?.name}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(transfer.amount))}
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={transfer.reason}>
                    {transfer.reason}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[transfer.status as TransferStatus]?.variant || 'default'}>
                      {statusConfig[transfer.status as TransferStatus]?.label || transfer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {transfer.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => handleSubmit(transfer.id)}
                        >
                          {t('action.submit')}
                        </Button>
                      )}
                      {transfer.status === 'submitted' && isSuperAdmin && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApprove(transfer.id)}
                            disabled={isApproving}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openRejectDialog(transfer.id)}
                            disabled={isRejecting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Buat Transfer Budget' : 'Create Budget Transfer'}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? 'Transfer anggaran dari satu kategori ke kategori lain dalam divisi yang sama'
                : 'Transfer budget from one category to another within the same division'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('budgetTransfer.from')} {t('requests.category')}</Label>
              <Select
                value={formData.from_budget_id}
                onValueChange={(value) => setFormData({ ...formData, from_budget_id: value, to_budget_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih kategori sumber' : 'Select source category'} />
                </SelectTrigger>
                <SelectContent>
                  {divisionBudgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id}>
                      <div className="flex flex-col">
                        <span>{(budget.category as any)?.name} - {(budget.division as any)?.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {language === 'id' ? 'Tersedia' : 'Available'}: {formatCurrency(Number(budget.allocated_amount) - Number(budget.used_amount))}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('budgetTransfer.to')} {t('requests.category')}</Label>
              <Select
                value={formData.to_budget_id}
                onValueChange={(value) => setFormData({ ...formData, to_budget_id: value })}
                disabled={!formData.from_budget_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih kategori tujuan' : 'Select target category'} />
                </SelectTrigger>
                <SelectContent>
                  {availableToBudgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id}>
                      {(budget.category as any)?.name} - {(budget.division as any)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'id' ? 'Jumlah Transfer' : 'Transfer Amount'}</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
              {selectedFromBudget && (
                <p className="text-xs text-muted-foreground">
                  {language === 'id' ? 'Maksimal' : 'Maximum'}: {formatCurrency(Number(selectedFromBudget.allocated_amount) - Number(selectedFromBudget.used_amount))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('budgetTransfer.reason')}</Label>
              <Textarea
                placeholder={language === 'id' ? 'Jelaskan alasan transfer...' : 'Explain the transfer reason...'}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? t('common.loading') : (language === 'id' ? 'Buat Transfer' : 'Create Transfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Tolak Transfer' : 'Reject Transfer'}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? 'Berikan alasan penolakan transfer budget'
                : 'Provide a reason for rejecting this budget transfer'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('approvals.rejectionReason')}</Label>
              <Textarea
                placeholder={language === 'id' ? 'Jelaskan alasan penolakan...' : 'Explain the rejection reason...'}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isRejecting || !rejectionReason}
            >
              {isRejecting ? t('common.loading') : (language === 'id' ? 'Tolak Transfer' : 'Reject Transfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BudgetTransfer;