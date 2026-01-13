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
import { id } from "date-fns/locale";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const transactionTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  top_up: { label: "Top-up", icon: ArrowUpCircle, color: "text-success" },
  withdrawal: { label: "Penarikan", icon: ArrowDownCircle, color: "text-warning" },
  payment: { label: "Pembayaran", icon: ArrowDownCircle, color: "text-destructive" },
  adjustment: { label: "Penyesuaian", icon: RefreshCw, color: "text-info" },
};

const PettyCash = () => {
  const {
    pettyCashAccounts,
    transactions,
    reconciliations,
    isLoading,
    topUp,
    createReconciliation,
    totalBalance,
    todayIn,
    todayOut,
  } = usePettyCash();

  const [activeTab, setActiveTab] = useState("overview");
  
  // Top-up dialog
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [topUpAccountId, setTopUpAccountId] = useState("");
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
          <h1 className="text-2xl font-bold text-foreground">Kas Kecil</h1>
          <p className="text-muted-foreground mt-1">
            Kelola saldo kas kecil, transaksi, dan rekonsiliasi
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIsReconcileDialogOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            Rekonsiliasi
          </Button>
          <Button className="gap-2" onClick={() => setIsTopUpDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Top-up
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
              <span className="text-sm text-muted-foreground">Total Saldo Kas Kecil</span>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-success/10">
              <ArrowUpCircle className="h-5 w-5 text-success" />
            </div>
            <span className="text-sm text-muted-foreground">Masuk Hari Ini</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(todayIn)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground">Keluar Hari Ini</span>
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
                Top-up
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
                Reconcile
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
            Transaksi
          </TabsTrigger>
          <TabsTrigger value="reconciliations" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Rekonsiliasi
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
                      {txn.description || 'Tanpa keterangan'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(txn.created_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                      {txn.profiles && ` • ${txn.profiles.full_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${txn.transaction_type === 'top_up' ? 'text-success' : 'text-foreground'}`}>
                      {txn.transaction_type === 'top_up' ? '+' : '-'}{formatCurrency(txn.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Saldo: {formatCurrency(txn.balance_after)}
                    </p>
                  </div>
                </div>
              );
            })}

            {(!transactions || transactions.length === 0) && (
              <div className="p-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground">Belum ada transaksi</p>
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
                        Rekonsiliasi {format(new Date(recon.reconciliation_date), 'dd MMM yyyy', { locale: id })}
                      </span>
                      <Badge variant={recon.status === 'approved' ? 'default' : 'secondary'}>
                        {recon.status === 'approved' ? 'Disetujui' : recon.status === 'pending' ? 'Pending' : 'Ditolak'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sistem: {formatCurrency(recon.system_balance)} • Fisik: {formatCurrency(recon.physical_balance)}
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
                <p className="text-muted-foreground">Belum ada rekonsiliasi</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Top-up Dialog */}
      <Dialog open={isTopUpDialogOpen} onOpenChange={setIsTopUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top-up Kas Kecil</DialogTitle>
            <DialogDescription>
              Tambah saldo kas kecil
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Akun Kas Kecil</Label>
              <Select value={topUpAccountId} onValueChange={setTopUpAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun" />
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
              <Label>Jumlah (IDR)</Label>
              <Input
                type="number"
                placeholder="1000000"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Nomor Referensi</Label>
              <Input
                placeholder="BKK-001"
                value={topUpReference}
                onChange={(e) => setTopUpReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Keterangan</Label>
              <Textarea
                placeholder="Keterangan top-up..."
                value={topUpDescription}
                onChange={(e) => setTopUpDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTopUpDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={topUp.isPending || !topUpAccountId || !topUpAmount}
            >
              Top-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Dialog */}
      <Dialog open={isReconcileDialogOpen} onOpenChange={setIsReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rekonsiliasi Kas</DialogTitle>
            <DialogDescription>
              Bandingkan saldo sistem dengan saldo fisik
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Akun Kas Kecil</Label>
              <Select value={reconcileAccountId} onValueChange={(v) => {
                setReconcileAccountId(v);
                const acc = pettyCashAccounts?.find(a => a.id === v);
                if (acc) setReconcilePhysicalBalance(acc.balance.toString());
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun" />
                </SelectTrigger>
                <SelectContent>
                  {pettyCashAccounts?.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} (Sistem: {formatCurrency(acc.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Saldo Fisik (IDR)</Label>
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
                    if (variance === 0) return <span className="text-success">✓ Saldo cocok</span>;
                    return (
                      <span className={variance > 0 ? 'text-warning' : 'text-destructive'}>
                        Selisih: {formatCurrency(variance)}
                      </span>
                    );
                  })()}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Catatan</Label>
              <Textarea
                placeholder="Catatan rekonsiliasi..."
                value={reconcileNotes}
                onChange={(e) => setReconcileNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReconcileDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={createReconciliation.isPending || !reconcileAccountId || !reconcilePhysicalBalance}
            >
              Simpan Rekonsiliasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PettyCash;
