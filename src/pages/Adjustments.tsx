import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Plus,
  Check,
  X,
  Loader2,
  Search,
  FileText,
  Wallet,
  Heart,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdjustments, AdjustmentFormData } from '@/hooks/useAdjustments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

const typeLabels: Record<string, string> = {
  expense_request: 'Expense Request',
  cash_advance: 'Cash Advance',
  medical_claim: 'Medical Claim',
};

const typeIcons: Record<string, React.ElementType> = {
  expense_request: FileText,
  cash_advance: Wallet,
  medical_claim: Heart,
};

const Adjustments = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const { adjustments, isLoading, createAdjustment, approveAdjustment, rejectAdjustment } = useAdjustments();

  const [showCreate, setShowCreate] = useState(false);
  const [showApprove, setShowApprove] = useState<string | null>(null);
  const [showReject, setShowReject] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create form state
  const [refType, setRefType] = useState<'expense_request' | 'cash_advance' | 'medical_claim'>('expense_request');
  const [refId, setRefId] = useState('');
  const [adjustedAmount, setAdjustedAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [adjustBudget, setAdjustBudget] = useState(true);
  const [adjustCash, setAdjustCash] = useState(false);

  // Fetch eligible records for the selected type
  const { data: eligibleRecords, isLoading: isLoadingRecords } = useQuery({
    queryKey: ['adjustment-eligible', refType],
    queryFn: async () => {
      if (refType === 'expense_request') {
        const { data } = await supabase
          .from('requests')
          .select('id, request_number, amount, approved_amount, status, description, division_id, category_id, period_id, funding_source_id')
          .in('status', ['approved' as const, 'paid' as const, 'settled' as const])
          .order('created_at', { ascending: false })
          .limit(200);
        return (data || []).map(d => ({
          id: d.id,
          number: d.request_number,
          amount: d.approved_amount || d.amount,
          status: d.status,
          desc: d.description,
          division_id: d.division_id,
          category_id: d.category_id,
          period_id: d.period_id,
          funding_source_id: d.funding_source_id,
        }));
      } else if (refType === 'cash_advance') {
        const { data } = await supabase
          .from('cash_advances')
          .select('id, ca_number, total_amount, status, purpose, division_id, category_id, period_id, funding_source_id')
          .in('status', ['approved' as const, 'paid' as const, 'settled' as const, 'partially_settled' as const])
          .order('created_at', { ascending: false })
          .limit(200);
        return (data || []).map(d => ({
          id: d.id,
          number: d.ca_number,
          amount: d.total_amount,
          status: d.status,
          desc: d.purpose,
          division_id: d.division_id,
          category_id: d.category_id,
          period_id: d.period_id,
          funding_source_id: d.funding_source_id,
        }));
      } else {
        const { data } = await supabase
          .from('medical_claims')
          .select('id, claim_number, claim_amount, approved_amount, status, patient_name, employee_id')
          .in('status', ['approved' as const, 'paid' as const, 'closed' as const])
          .order('created_at', { ascending: false })
          .limit(200);
        return (data || []).map(d => ({
          id: d.id,
          number: d.claim_number,
          amount: d.approved_amount || d.claim_amount,
          status: d.status,
          desc: d.patient_name,
          division_id: '',
          category_id: null,
          period_id: null,
          funding_source_id: null,
        }));
      }
    },
  });

  const selectedRecord = eligibleRecords?.find(r => r.id === refId) || null;

  const handleCreate = async () => {
    if (!selectedRecord || !reason.trim()) {
      toast({ title: 'Lengkapi semua field', variant: 'destructive' });
      return;
    }
    await createAdjustment.mutateAsync({
      reference_type: refType,
      reference_id: refId,
      original_amount: selectedRecord.amount,
      adjusted_amount: adjustedAmount,
      reason,
      division_id: selectedRecord.division_id || '',
      category_id: selectedRecord.category_id,
      period_id: selectedRecord.period_id,
      funding_source_id: selectedRecord.funding_source_id,
      adjust_budget: adjustBudget,
      adjust_cash: adjustCash,
    });
    resetForm();
    setShowCreate(false);
  };

  const resetForm = () => {
    setRefType('expense_request');
    setRefId('');
    setAdjustedAmount(0);
    setReason('');
    setAdjustBudget(true);
    setAdjustCash(false);
  };

  const filtered = adjustments.filter(adj => {
    if (statusFilter !== 'all' && adj.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return adj.adjustment_number.toLowerCase().includes(s) || adj.reason.toLowerCase().includes(s);
    }
    return true;
  });

  const isFinanceOrSuperAdmin = role === 'super_admin' || role === 'finance';
  const isSuperAdmin = role === 'super_admin';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Adjustment / Koreksi</h1>
          <p className="text-muted-foreground mt-1">Koreksi nilai pengajuan yang sudah disetujui atau dibayarkan</p>
        </div>
        {isFinanceOrSuperAdmin && (
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Buat Adjustment
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{adjustments.filter(a => a.status === 'pending').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-green-600">{adjustments.filter(a => a.status === 'approved').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Rejected</p>
            <p className="text-2xl font-bold text-destructive">{adjustments.filter(a => a.status === 'rejected').length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari nomor adjustment atau alasan..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Adjustment</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Divisi</TableHead>
                  <TableHead className="text-right">Nilai Asli</TableHead>
                  <TableHead className="text-right">Nilai Koreksi</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  {isSuperAdmin && <TableHead className="text-center">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Tidak ada data adjustment
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((adj) => {
                    const TypeIcon = typeIcons[adj.reference_type] || FileText;
                    return (
                      <TableRow key={adj.id}>
                        <TableCell className="font-mono text-sm">{adj.adjustment_number}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{typeLabels[adj.reference_type]}</span>
                          </div>
                        </TableCell>
                        <TableCell>{(adj as any).divisions?.code || '-'}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(adj.original_amount))}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(adj.adjusted_amount))}</TableCell>
                        <TableCell className={`text-right font-mono ${Number(adj.difference_amount) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                          {Number(adj.difference_amount) > 0 ? '+' : ''}{formatCurrency(Number(adj.difference_amount))}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                        <TableCell>{getStatusBadge(adj.status)}</TableCell>
                        <TableCell className="text-sm">{format(new Date(adj.created_at), 'dd/MM/yyyy')}</TableCell>
                        {isSuperAdmin && (
                          <TableCell className="text-center">
                            {adj.status === 'pending' && (
                              <div className="flex items-center justify-center gap-1">
                                <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => setShowApprove(adj.id)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setShowReject(adj.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { resetForm(); setShowCreate(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Adjustment Baru</DialogTitle>
            <DialogDescription>Koreksi nilai pengajuan yang sudah disetujui/dibayarkan. Akan memerlukan persetujuan Super Admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipe Pengajuan</Label>
              <Select value={refType} onValueChange={(v: any) => { setRefType(v); setRefId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense_request">Expense Request</SelectItem>
                  <SelectItem value="cash_advance">Cash Advance</SelectItem>
                  <SelectItem value="medical_claim">Medical Claim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nomor Pengajuan</Label>
              <Select
                value={refId || 'none'}
                onValueChange={(v) => {
                  if (v === 'none') { setRefId(''); setAdjustedAmount(0); return; }
                  setRefId(v);
                  const rec = eligibleRecords?.find(r => r.id === v);
                  if (rec) setAdjustedAmount(rec.amount);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingRecords ? 'Memuat...' : 'Pilih nomor pengajuan'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">-- Pilih --</SelectItem>
                  {(eligibleRecords || []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono">{r.number}</span>
                      <span className="text-muted-foreground ml-2">({r.status}) — {formatCurrency(r.amount)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRecord && (
              <Card className="bg-muted">
                <CardContent className="pt-4 space-y-1 text-sm">
                  <p><strong>Nomor:</strong> {selectedRecord.number}</p>
                  <p><strong>Status:</strong> {selectedRecord.status}</p>
                  <p><strong>Deskripsi:</strong> {selectedRecord.desc}</p>
                  <p><strong>Nilai Saat Ini:</strong> {formatCurrency(selectedRecord.amount)}</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Nilai Koreksi (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={adjustedAmount}
                onChange={e => setAdjustedAmount(Number(e.target.value))}
              />
              {selectedRecord && adjustedAmount !== selectedRecord.amount && (
                <p className={`text-sm font-medium ${adjustedAmount > selectedRecord.amount ? 'text-destructive' : 'text-green-600'}`}>
                  Selisih: {adjustedAmount > selectedRecord.amount ? '+' : ''}{formatCurrency(adjustedAmount - selectedRecord.amount)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Alasan Koreksi *</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Jelaskan alasan koreksi..." rows={3} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Adjust Budget</p>
                  <p className="text-xs text-muted-foreground">Koreksi saldo anggaran divisi</p>
                </div>
                <Switch checked={adjustBudget} onCheckedChange={setAdjustBudget} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Adjust Cash/Sumber Dana</p>
                  <p className="text-xs text-muted-foreground">Koreksi saldo kas/bank</p>
                </div>
                <Switch checked={adjustCash} onCheckedChange={setAdjustCash} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowCreate(false); }}>Batal</Button>
            <Button onClick={handleCreate} disabled={!selectedRecord || !reason.trim() || createAdjustment.isPending} className="gap-2">
              {createAdjustment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={!!showApprove} onOpenChange={() => { setShowApprove(null); setApprovalNote(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setujui Adjustment</DialogTitle>
            <DialogDescription>Perubahan akan langsung diterapkan ke budget dan/atau saldo kas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Catatan (opsional)</Label>
            <Textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApprove(null); setApprovalNote(''); }}>Batal</Button>
            <Button
              onClick={async () => {
                if (showApprove) {
                  await approveAdjustment.mutateAsync({ id: showApprove, note: approvalNote });
                  setShowApprove(null);
                  setApprovalNote('');
                }
              }}
              disabled={approveAdjustment.isPending}
              className="gap-2"
            >
              {approveAdjustment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!showReject} onOpenChange={() => { setShowReject(null); setRejectionReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Alasan Penolakan *</Label>
            <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReject(null); setRejectionReason(''); }}>Batal</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (showReject && rejectionReason.trim()) {
                  await rejectAdjustment.mutateAsync({ id: showReject, reason: rejectionReason });
                  setShowReject(null);
                  setRejectionReason('');
                }
              }}
              disabled={!rejectionReason.trim() || rejectAdjustment.isPending}
              className="gap-2"
            >
              {rejectAdjustment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Adjustments;
