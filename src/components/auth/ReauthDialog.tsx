import { useState } from 'react';
import { Shield, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  actionName: string;
  actionDescription?: string;
}

export function ReauthDialog({
  open,
  onOpenChange,
  onSuccess,
  actionName,
  actionDescription,
}: ReauthDialogProps) {
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleVerify = async () => {
    if (otp.length !== 6) {
      toast({
        title: 'Error',
        description: 'Masukkan kode OTP 6 digit',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'Sesi tidak valid',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          action: 'verify',
          userId: user.id,
          otp: otp,
        },
      });

      if (error) {
        throw new Error('Verifikasi OTP gagal');
      }

      if (data?.success === true) {
        setOtp('');
        onOpenChange(false);
        onSuccess();
        return;
      }

      if (data?.rateLimited) {
        throw new Error('Terlalu banyak percobaan. Tunggu 5 menit.');
      }

      throw new Error(data?.error || 'Kode OTP tidak valid');
    } catch (err) {
      toast({
        title: 'Verifikasi Gagal',
        description: err instanceof Error ? err.message : 'Verifikasi OTP gagal',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOtp('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Re-autentikasi Diperlukan
          </DialogTitle>
          <DialogDescription>
            Untuk melanjutkan aksi sensitif ini, verifikasi identitas Anda dengan OTP
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Action Info */}
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium text-foreground">{actionName}</p>
                {actionDescription && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {actionDescription}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* OTP Input */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Masukkan kode 6 digit dari aplikasi authenticator Anda
            </p>
            <InputOTP
              value={otp}
              onChange={setOtp}
              maxLength={6}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button
              className="flex-1"
              onClick={handleVerify}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memverifikasi...
                </>
              ) : (
                'Konfirmasi'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
