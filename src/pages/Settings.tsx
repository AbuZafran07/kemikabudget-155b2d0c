import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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
import { OtpSetupCard } from '@/components/settings/OtpSetupCard';
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

// Zod schema for localStorage validation
const AppSettingsSchema = z.object({
  approval_sla_days: z.number().int().min(1).max(30),
  payment_sla_days: z.number().int().min(1).max(30),
  high_value_threshold: z.number().min(0),
  require_invoice_before_pay: z.boolean(),
  require_receipt_before_settle: z.boolean(),
});

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
  const { role } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  
  const isSuperAdmin = role === 'super_admin';

  // Fetch settings with zod validation
  const { isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const stored = localStorage.getItem('app_settings');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const result = AppSettingsSchema.safeParse(parsed);
          if (result.success) {
            // Spread with defaults to ensure all required fields are present
            const validatedSettings: AppSettings = {
              ...defaultSettings,
              ...result.data,
            };
            setSettings(validatedSettings);
            return validatedSettings;
          } else {
            // Invalid data - clear corrupted storage and use defaults
            localStorage.removeItem('app_settings');
            console.warn('Invalid app_settings in localStorage, cleared corrupted data');
          }
        } catch {
          // JSON parse error - clear corrupted storage
          localStorage.removeItem('app_settings');
          console.warn('Corrupted app_settings in localStorage, cleared');
        }
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
      toast({ title: t('settings.settingsSaved') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
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
          <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.description')}</p>
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
          {t('settings.saveSettings')}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* SLA Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {t('settings.slaConfig')}
            </CardTitle>
            <CardDescription>
              {t('settings.slaConfigDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>{t('settings.approvalSla')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.approval_sla_days}
                  onChange={(e) => updateSetting('approval_sla_days', parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.approvalSlaDesc')} {settings.approval_sla_days} {t('settings.days')}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.paymentSla')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.payment_sla_days}
                  onChange={(e) => updateSetting('payment_sla_days', parseInt(e.target.value) || 3)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.paymentSlaDesc')} {settings.payment_sla_days} {t('settings.days')}
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
              {t('settings.approvalRules')}
            </CardTitle>
            <CardDescription>
              {t('settings.approvalRulesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('settings.highValueThreshold')}</Label>
              <Input
                type="number"
                min={0}
                value={settings.high_value_threshold}
                onChange={(e) => updateSetting('high_value_threshold', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.highValueThresholdDesc')}: {formatCurrency(settings.high_value_threshold)}
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.requireInvoice')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.requireInvoiceDesc')}
                  </p>
                </div>
                <Switch
                  checked={settings.require_invoice_before_pay}
                  onCheckedChange={(checked) => updateSetting('require_invoice_before_pay', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.requireReceipt')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.requireReceiptDesc')}
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

        {/* Change Password */}
        <ChangePasswordCard />

        {/* OTP Setup for Super Admin */}
        {isSuperAdmin && <OtpSetupCard />}

        {/* User Notification Preferences */}
        <NotificationPreferencesCard />

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              {t('settings.systemInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">{t('settings.version')}</p>
                <p className="font-semibold">1.0.0</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">{t('settings.environment')}</p>
                <p className="font-semibold">Production</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">{t('settings.database')}</p>
                <p className="font-semibold">PostgreSQL</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-xs text-muted-foreground">{t('settings.backend')}</p>
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