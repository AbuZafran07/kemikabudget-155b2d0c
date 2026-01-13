import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<FundingSource | null>(null);
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
      const { data, error } = await supabase
        .from('funding_sources')
        .select('*')
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
      toast({ title: 'Sumber dana berhasil ditambahkan' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Sumber dana berhasil diperbarui' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('funding_sources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funding-sources-management'] });
      toast({ title: 'Sumber dana berhasil dihapus' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

  const filteredSources = sources.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sumber Dana</h1>
          <p className="text-muted-foreground mt-1">Kelola sumber pendanaan</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Sumber Dana
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari sumber dana..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Bank / Rekening</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredSources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Wallet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Tidak ada sumber dana</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredSources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-mono font-medium">{source.code}</TableCell>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {source.type === 'petty_cash' ? (
                        <><Banknote className="h-3 w-3" /> Petty Cash</>
                      ) : (
                        <><Building className="h-3 w-3" /> Bank</>
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
                      {source.is_active ? 'Aktif' : 'Nonaktif'}
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
                        onClick={() => deleteMutation.mutate(source.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSource ? 'Edit Sumber Dana' : 'Tambah Sumber Dana'}</DialogTitle>
            <DialogDescription>
              {editingSource ? 'Perbarui informasi sumber dana' : 'Tambah sumber dana baru'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="BANK_BCA"
                />
              </div>
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Bank BCA"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: 'petty_cash' | 'bank') => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="petty_cash">Petty Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Saldo Awal</Label>
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
                    <Label>Nama Bank</Label>
                    <Input
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      placeholder="Bank Central Asia"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>No. Rekening</Label>
                    <Input
                      value={formData.account_number}
                      onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                      placeholder="1234567890"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nama Pemegang Rekening</Label>
                  <Input
                    value={formData.account_holder}
                    onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                    placeholder="PT. Kemika Karya Pratama"
                  />
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <Label>Status Aktif</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FundingSources;