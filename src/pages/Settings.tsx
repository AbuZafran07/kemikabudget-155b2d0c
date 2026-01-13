import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Clock,
  Shield,
  Save,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';

interface AppSettings {
  approval_sla_days: number;
  payment_sla_days: number;
  high_value_threshold: number;
  require_invoice_before_pay: boolean;
  require_receipt_before_settle: boolean;
}

const defaultSettings: AppSettings = {
  approval_sla_days: 3,
  payment_sla_days: 3,
  high_value_threshold: 50000000,
  require_invoice_before_pay: true,
  require_receipt_before_settle: true,
};

const Settings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

  // In a real app, this would fetch from a settings table
  // For now, we'll use localStorage as a simple persistence
  const { isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const stored = localStorage.getItem('app_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        return parsed;
      }
      return defaultSettings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AppSettings) => {
      // In production, save to database
      localStorage.setItem('app_settings', JSON.stringify(data));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      setHasChanges(false);
      toast({ title: 'Pengaturan berhasil disimpan' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
          <p className="text-muted-foreground mt-1">Konfigurasi sistem dan preferensi</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Pengaturan
        </Button>
      </div>

      <div className="grid gap-6">
        {/* SLA Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Konfigurasi SLA
            </CardTitle>
            <CardDescription>
              Atur batas waktu untuk proses persetujuan dan pembayaran
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>SLA Persetujuan (hari)</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.approval_sla_days}
                  onChange={(e) => updateSetting('approval_sla_days', parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground">
                  Pengajuan akan ditandai overdue setelah {settings.approval_sla_days} hari
                </p>
              </div>
              <div className="space-y-2">
                <Label>SLA Pembayaran (hari)</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.payment_sla_days}
                  onChange={(e) => updateSetting('payment_sla_days', parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground">
                  Pembayaran akan ditandai overdue setelah {settings.payment_sla_days} hari
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Approval Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Aturan Persetujuan
            </CardTitle>
            <CardDescription>
              Konfigurasi aturan dan validasi untuk proses approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Batas Nilai Tinggi (High Value Threshold)</Label>
              <Input
                type="number"
                min={0}
                value={settings.high_value_threshold}
                onChange={(e) => updateSetting('high_value_threshold', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Pengajuan di atas {formatCurrency(settings.high_value_threshold)} memerlukan catatan persetujuan dan dokumen pendukung
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Wajib Invoice Sebelum Bayar</p>
                  <p className="text-sm text-muted-foreground">
                    Invoice atau quotation harus ada sebelum pembayaran
                  </p>
                </div>
                <Switch
                  checked={settings.require_invoice_before_pay}
                  onCheckedChange={(checked) => updateSetting('require_invoice_before_pay', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Wajib Receipt Sebelum Settle</p>
                  <p className="text-sm text-muted-foreground">
                    Receipt harus ada sebelum penyelesaian transaksi
                  </p>
                </div>
                <Switch
                  checked={settings.require_receipt_before_settle}
                  onCheckedChange={(checked) => updateSetting('require_receipt_before_settle', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Notification Preferences */}
        <NotificationPreferencesCard />

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              Informasi Sistem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Versi</p>
                <p className="font-semibold">1.0.0</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Environment</p>
                <p className="font-semibold">Production</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Database</p>
                <p className="font-semibold">PostgreSQL</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Backend</p>
                <p className="font-semibold">Lovable Cloud</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;