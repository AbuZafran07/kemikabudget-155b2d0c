import { Bell, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';

export function NotificationPreferencesCard() {
  const { preferences, isLoading, updatePreferences } = useNotificationPreferences();

  const handleToggle = (key: string, value: boolean) => {
    updatePreferences.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Preferensi Notifikasi Email
        </CardTitle>
        <CardDescription>
          Pilih jenis notifikasi email yang ingin Anda terima
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pengajuan Disubmit</p>
              <p className="text-sm text-muted-foreground">
                Terima email saat ada pengajuan baru yang perlu disetujui
              </p>
            </div>
            <Switch
              checked={preferences.notify_on_submit}
              onCheckedChange={(checked) => handleToggle('notify_on_submit', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pengajuan Disetujui</p>
              <p className="text-sm text-muted-foreground">
                Terima email saat pengajuan Anda disetujui
              </p>
            </div>
            <Switch
              checked={preferences.notify_on_approve}
              onCheckedChange={(checked) => handleToggle('notify_on_approve', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pengajuan Ditolak</p>
              <p className="text-sm text-muted-foreground">
                Terima email saat pengajuan Anda ditolak
              </p>
            </div>
            <Switch
              checked={preferences.notify_on_reject}
              onCheckedChange={(checked) => handleToggle('notify_on_reject', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pembayaran Diproses</p>
              <p className="text-sm text-muted-foreground">
                Terima email saat pembayaran pengajuan Anda diproses
              </p>
            </div>
            <Switch
              checked={preferences.notify_on_pay}
              onCheckedChange={(checked) => handleToggle('notify_on_pay', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pengajuan Selesai</p>
              <p className="text-sm text-muted-foreground">
                Terima email saat pengajuan Anda telah diselesaikan
              </p>
            </div>
            <Switch
              checked={preferences.notify_on_settle}
              onCheckedChange={(checked) => handleToggle('notify_on_settle', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}