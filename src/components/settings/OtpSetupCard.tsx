import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Shield, 
  RefreshCw, 
  Loader2, 
  Copy, 
  Check, 
  AlertTriangle,
  Smartphone 
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface OtpSecretResponse {
  success: boolean;
  secret?: string;
  otpAuthUrl?: string;
  message?: string;
  error?: string;
}

export function OtpSetupCard() {
  const { user, role, session } = useAuth();
  const { toast } = useToast();
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [otpSecret, setOtpSecret] = useState<string | null>(null);
  const [otpAuthUrl, setOtpAuthUrl] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const isSuperAdmin = role === 'super_admin';

  const generateSecretMutation = useMutation({
    mutationFn: async (): Promise<OtpSecretResponse> => {
      if (!user || !session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          action: 'generate-secret',
          userId: user.id,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to generate secret');
      
      return data;
    },
    onSuccess: (data) => {
      setOtpSecret(data.secret || null);
      setOtpAuthUrl(data.otpAuthUrl || null);
      setIsVerified(false);
      setVerificationCode('');
      setShowSetupDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (otp: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          action: 'verify',
          userId: user.id,
          otp,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Invalid OTP');
      
      return data;
    },
    onSuccess: () => {
      setIsVerified(true);
      toast({
        title: 'OTP Terverifikasi',
        description: 'Authenticator app Anda telah berhasil dikonfigurasi.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Verifikasi Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCopySecret = async () => {
    if (!otpSecret) return;
    
    try {
      await navigator.clipboard.writeText(otpSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Secret disalin ke clipboard' });
    } catch {
      toast({ 
        title: 'Gagal menyalin', 
        description: 'Silakan salin manual',
        variant: 'destructive' 
      });
    }
  };

  const handleVerify = () => {
    if (verificationCode.length === 6) {
      verifyMutation.mutate(verificationCode);
    }
  };

  const handleCloseDialog = () => {
    if (!isVerified && otpSecret) {
      // Warn user that they haven't verified yet
      const confirmed = window.confirm(
        'Anda belum memverifikasi OTP. Jika ditutup, Anda harus generate secret baru. Lanjutkan?'
      );
      if (!confirmed) return;
    }
    setShowSetupDialog(false);
    setOtpSecret(null);
    setOtpAuthUrl(null);
    setVerificationCode('');
    setIsVerified(false);
  };

  if (!isSuperAdmin) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Keamanan OTP (Two-Factor Authentication)
          </CardTitle>
          <CardDescription>
            Kelola konfigurasi authenticator app untuk verifikasi dua faktor. 
            OTP diperlukan saat login dan aksi sensitif (approve, pay, transfer).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Smartphone className="h-4 w-4" />
            <AlertTitle>Authenticator Apps yang Didukung</AlertTitle>
            <AlertDescription>
              Google Authenticator, Microsoft Authenticator, Authy, 1Password, 
              atau app lain yang mendukung TOTP (RFC 6238).
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={() => generateSecretMutation.mutate()}
              disabled={generateSecretMutation.isPending}
              className="gap-2"
            >
              {generateSecretMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Generate OTP Secret Baru
            </Button>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Perhatian</AlertTitle>
            <AlertDescription>
              Menggenerate secret baru akan mengganti secret yang lama. 
              Pastikan Anda sudah menyiapkan authenticator app sebelum melanjutkan.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* OTP Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Setup Authenticator App
            </DialogTitle>
            <DialogDescription>
              Scan QR code dengan authenticator app Anda, lalu masukkan kode verifikasi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* QR Code */}
            {otpAuthUrl && (
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-background border rounded-lg">
                  <QRCodeSVG 
                    value={otpAuthUrl} 
                    size={200}
                    level="M"
                    includeMargin
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Scan QR code di atas dengan Google Authenticator, Authy, atau app sejenis
                </p>
              </div>
            )}

            {/* Manual Secret Entry */}
            {otpSecret && (
              <div className="space-y-2">
                <Label>Secret Key (untuk input manual)</Label>
                <div className="flex gap-2">
                  <Input 
                    value={otpSecret} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Verification Input */}
            <div className="space-y-2">
              <Label>Kode Verifikasi (6 digit)</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                disabled={isVerified}
                className="text-center text-2xl tracking-widest font-mono"
              />
              {isVerified && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  OTP berhasil diverifikasi!
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog}>
              {isVerified ? 'Selesai' : 'Batal'}
            </Button>
            {!isVerified && (
              <Button
                onClick={handleVerify}
                disabled={verificationCode.length !== 6 || verifyMutation.isPending}
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Verifikasi
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
