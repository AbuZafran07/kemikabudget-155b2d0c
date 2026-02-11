import { useState } from "react";
import {
  Wallet,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { usePettyCash, PettyCashTransaction, CashReconciliation } from "@/hooks/usePettyCash";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { useLanguage } from "@/contexts/LanguageContext";


const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const PettyCash = () => {

  const {
    pettyCashAccounts,
    bankAccounts,
    transactions,
    reconciliations,
    isLoading,
    topUp,
    createReconciliation,
    totalBalance,
    todayIn,
    todayOut,
  } = usePettyCash();

  const { t, language } = useLanguage();

  const transactionTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    top_up: { label: t('action.topUp'), icon: ArrowUpCircle, color: "text-success" },
    withdrawal: { label: language === 'id' ? 'Penarikan' : 'Withdrawal', icon: ArrowDownCircle, color: "text-warning" },
    payment: { label: language === 'id' ? 'Pembayaran' : 'Payment', icon: ArrowDownCircle, color: "text-destructive" },
    adjustment: { label: language === 'id' ? 'Penyesuaian' : 'Adjustment', icon: RefreshCw, color: "text-info" },
  };

  const [activeTab, setActiveTab] = useState("overview");
  
  // Top-up dialog
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [topUpAccountId, setTopUpAccountId] = useState("");
  const [topUpSourceBankId, setTopUpSourceBankId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [topUpReference, setTopUpReference] = useState("");

  // Reconciliation dialog
  const [isReconcileDialogOpen, setIsReconcileDialogOpen] = useState(false);
  const [reconcileAccountId, setReconcileAccountId] = useState("");
  const [reconcilePhysicalBalance, setReconcilePhysicalBalance] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  const handleTopUp = async () => {
    if (!topUpAccountId || !topUpAmount) return;

    await topUp.mutateAsync({
      fundingSourceId: topUpAccountId,
      amount: parseFloat(topUpAmount),
      description: topUpDescription || undefined,
      referenceNumber: topUpReference || undefined,
      sourceBankId: topUpSourceBankId || undefined,
    });

    setIsTopUpDialogOpen(false);
    resetTopUpForm();
  };

  const handleReconcile = async () => {
    if (!reconcileAccountId || !reconcilePhysicalBalance) return;

    await createReconciliation.mutateAsync({
      fundingSourceId: reconcileAccountId,
      physicalBalance: parseFloat(reconcilePhysicalBalance),
      notes: reconcileNotes || undefined,
    });

    setIsReconcileDialogOpen(false);
    resetReconcileForm();
  };

  const resetTopUpForm = () => {
    setTopUpAccountId("");
    setTopUpSourceBankId("");
    setTopUpAmount("");
    setTopUpDescription("");
    setTopUpReference("");
  };

  const resetReconcileForm = () => {
    setReconcileAccountId("");
    setReconcilePhysicalBalance("");
    setReconcileNotes("");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
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
          <h1 className="text-2xl font-bold text-foreground">{t('pettyCash.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('pettyCash.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIsReconcileDialogOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            {t('action.reconcile')}
          </Button>
          <Button className="gap-2" onClick={() => setIsTopUpDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('action.topUp')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5 md:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-xl bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <span className="text-sm text-muted-foreground">{t('pettyCash.totalBalance')}</span>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-success/10">
              <ArrowUpCircle className="h-5 w-5 text-success" />
            </div>
            <span className="text-sm text-muted-foreground">{t('pettyCash.todayIn')}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(todayIn)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground">{t('pettyCash.todayOut')}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(todayOut)}</p>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pettyCashAccounts?.map((account) => (
          <div key={account.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">{account.name}</h3>
              <Badge variant="outline">{account.code}</Badge>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(account.balance)}</p>
            <div className="flex gap-2 mt-4">
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setTopUpAccountId(account.id);
                  setIsTopUpDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('action.topUp')}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setReconcileAccountId(account.id);
                  setReconcilePhysicalBalance(account.balance.toString());
                  setIsReconcileDialogOpen(true);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('action.reconcile')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <FileText className="h-4 w-4" />
            {t('pettyCash.transactions')}
          </TabsTrigger>
          <TabsTrigger value="reconciliations" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('pettyCash.reconciliation')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {transactions?.slice(0, 20).map((txn) => {
              const config = transactionTypeConfig[txn.transaction_type];
              const Icon = config.icon;

              return (
                <div key={txn.id} className="p-4 flex items-center gap-4">
                  <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.label}</span>
                      {txn.reference_number && (
                        <Badge variant="outline" className="text-xs">
                          {txn.reference_number}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {txn.description || (language === 'id' ? 'Tanpa keterangan' : 'No description')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(txn.created_at), 'dd MMM yyyy, HH:mm', { locale: language === 'id' ? idLocale : enUS })}
                      {txn.profiles && ` • ${txn.profiles.full_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${txn.transaction_type === 'top_up' ? 'text-success' : 'text-foreground'}`}>
                      {txn.transaction_type === 'top_up' ? '+' : '-'}{formatCurrency(txn.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'id' ? 'Saldo' : 'Balance'}: {formatCurrency(txn.balance_after)}
                    </p>
                  </div>
                </div>
              );
            })}

            {(!transactions || transactions.length === 0) && (
              <div className="p-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground">{t('pettyCash.noTransactions')}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reconciliations" className="mt-4">
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {reconciliations?.map((recon) => {
              const isMatch = recon.variance === 0;
              const isPositive = recon.variance > 0;

              return (
                <div key={recon.id} className="p-4 flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${isMatch ? 'bg-success/10' : 'bg-warning/10'}`}>
                    {isMatch ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-warning" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {t('pettyCash.reconciliation')} {format(new Date(recon.reconciliation_date), 'dd MMM yyyy', { locale: language === 'id' ? idLocale : enUS })}
                      </span>
                      <Badge variant={recon.status === 'approved' ? 'default' : 'secondary'}>
                        {recon.status === 'approved' 
                          ? t('status.approved') 
                          : recon.status === 'pending' 
                            ? (language === 'id' ? 'Pending' : 'Pending') 
                            : t('status.rejected')
                        }
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'id' ? 'Sistem' : 'System'}: {formatCurrency(recon.system_balance)} • {language === 'id' ? 'Fisik' : 'Physical'}: {formatCurrency(recon.physical_balance)}
                    </p>
                    {recon.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{recon.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${isMatch ? 'text-success' : isPositive ? 'text-warning' : 'text-destructive'}`}>
                      {isMatch ? 'Match' : `${isPositive ? '+' : ''}${formatCurrency(recon.variance)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recon.reconciled_by_profile?.full_name}
                    </p>
                  </div>
                </div>
              );
            })}

            {(!reconciliations || reconciliations.length === 0) && (
              <div className="p-12 text-center">
                <RefreshCw className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {language === 'id' ? 'Belum ada rekonsiliasi' : 'No reconciliations yet'}
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Top-up Dialog */}
      <Dialog open={isTopUpDialogOpen} onOpenChange={setIsTopUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Top-up Kas Kecil' : 'Top-up Petty Cash'}</DialogTitle>
            <DialogDescription>
              {language === 'id' ? 'Tambah saldo kas kecil' : 'Add petty cash balance'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'id' ? 'Akun Kas Kecil' : 'Petty Cash Account'}</Label>
              <Select value={topUpAccountId} onValueChange={setTopUpAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih akun' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {pettyCashAccounts?.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Sumber Dana (Bank)' : 'Source Bank'}</Label>
              <Select value={topUpSourceBankId} onValueChange={(val) => setTopUpSourceBankId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih bank sumber' : 'Select source bank'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {language === 'id' ? '-- Tanpa sumber bank --' : '-- No source bank --'}
                  </SelectItem>
                  {bankAccounts?.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name} ({formatCurrency(bank.balance || 0)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {language === 'id' 
                  ? 'Jika dipilih, saldo bank akan dikurangi sebesar jumlah top-up' 
                  : 'If selected, bank balance will be reduced by the top-up amount'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Jumlah (IDR)' : 'Amount (IDR)'}</Label>
              <Input
                type="number"
                placeholder="1000000"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Nomor Referensi' : 'Reference Number'}</Label>
              <Input
                placeholder="BKK-001"
                value={topUpReference}
                onChange={(e) => setTopUpReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Keterangan' : 'Description'}</Label>
              <Textarea
                placeholder={language === 'id' ? 'Keterangan top-up...' : 'Top-up description...'}
                value={topUpDescription}
                onChange={(e) => setTopUpDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTopUpDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={topUp.isPending || !topUpAccountId || !topUpAmount}
            >
              {t('action.topUp')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Dialog */}
      <Dialog open={isReconcileDialogOpen} onOpenChange={setIsReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'id' ? 'Rekonsiliasi Kas' : 'Cash Reconciliation'}</DialogTitle>
            <DialogDescription>
              {language === 'id' 
                ? 'Bandingkan saldo sistem dengan saldo fisik'
                : 'Compare system balance with physical balance'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'id' ? 'Akun Kas Kecil' : 'Petty Cash Account'}</Label>
              <Select value={reconcileAccountId} onValueChange={(v) => {
                setReconcileAccountId(v);
                const acc = pettyCashAccounts?.find(a => a.id === v);
                if (acc) setReconcilePhysicalBalance(acc.balance.toString());
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'id' ? 'Pilih akun' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  {pettyCashAccounts?.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} ({language === 'id' ? 'Sistem' : 'System'}: {formatCurrency(acc.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === 'id' ? 'Saldo Fisik (IDR)' : 'Physical Balance (IDR)'}</Label>
              <Input
                type="number"
                placeholder="50000000"
                value={reconcilePhysicalBalance}
                onChange={(e) => setReconcilePhysicalBalance(e.target.value)}
              />
              {reconcileAccountId && reconcilePhysicalBalance && (
                <p className="text-sm">
                  {(() => {
                    const acc = pettyCashAccounts?.find(a => a.id === reconcileAccountId);
                    const variance = parseFloat(reconcilePhysicalBalance) - (acc?.balance || 0);
                    if (variance === 0) return <span className="text-success">✓ {language === 'id' ? 'Saldo cocok' : 'Balance matches'}</span>;
                    return (
                      <span className={variance > 0 ? 'text-warning' : 'text-destructive'}>
                        {language === 'id' ? 'Selisih' : 'Variance'}: {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                      </span>
                    );
                  })()}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('requests.notes')}</Label>
              <Textarea
                placeholder={language === 'id' ? 'Catatan rekonsiliasi...' : 'Reconciliation notes...'}
                value={reconcileNotes}
                onChange={(e) => setReconcileNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReconcileDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={createReconciliation.isPending || !reconcileAccountId || !reconcilePhysicalBalance}
            >
              {t('action.reconcile')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PettyCash;