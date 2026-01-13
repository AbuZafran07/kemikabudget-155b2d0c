import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface OtpVerificationProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function OtpVerification({ onSuccess, onCancel }: OtpVerificationProps) {
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { verifyOtp } = useAuth();
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

    setIsLoading(true);
    const { error } = await verifyOtp(otp);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Verifikasi Gagal',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    onSuccess();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">Verifikasi OTP</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Masukkan kode 6 digit dari aplikasi authenticator Anda
          </p>
        </div>
      </div>

      <div className="flex justify-center">
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

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
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
            'Verifikasi'
          )}
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Demo: gunakan kode <span className="font-mono font-bold">123456</span>
      </p>
    </div>
  );
}
