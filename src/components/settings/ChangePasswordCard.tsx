import { useState } from 'react';
import { Key, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { PasswordStrength, validatePassword } from '@/components/auth/PasswordStrength';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { useSensitiveAction } from '@/hooks/useSensitiveAction';

export function ChangePasswordCard() {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    requiresReauth,
    isDialogOpen,
    actionName,
    actionDescription,
    executeSensitiveAction,
    handleReauthSuccess,
    handleDialogClose,
  } = useSensitiveAction();

  const isSuperAdmin = role === 'super_admin';

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const performPasswordChange = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      toast({
        title: t('settings.passwordChanged'),
        description: t('settings.passwordChangedDesc'),
      });
      resetForm();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.passwordChangeError'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = () => {
    // Validate current password is provided
    if (!currentPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.currentPasswordRequired'),
        variant: 'destructive',
      });
      return;
    }

    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      toast({
        title: t('common.error'),
        description: t('settings.newPasswordWeak'),
        variant: 'destructive',
      });
      return;
    }

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordMismatch'),
        variant: 'destructive',
      });
      return;
    }

    // Validate new password is different from current
    if (currentPassword === newPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordSameAsCurrent'),
        variant: 'destructive',
      });
      return;
    }

    // For super_admin with OTP, require re-authentication
    if (requiresReauth) {
      executeSensitiveAction(
        t('settings.changePassword'),
        t('settings.changePasswordReauthDesc'),
        performPasswordChange
      );
    } else {
      performPasswordChange();
    }
  };

  const passwordValidation = validatePassword(newPassword);
  const canSubmit = 
    currentPassword.length > 0 && 
    passwordValidation.isValid && 
    newPassword === confirmPassword &&
    currentPassword !== newPassword;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            {t('settings.changePassword')}
          </CardTitle>
          <CardDescription>
            {t('settings.changePasswordDesc')}
            {isSuperAdmin && profile?.requires_otp && (
              <span className="block mt-1 text-warning">
                {t('settings.otpRequiredForChange')}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="current-password">{t('settings.currentPassword')}</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('settings.enterCurrentPassword')}
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="new-password">{t('settings.newPassword')}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.enterNewPassword')}
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && <PasswordStrength password={newPassword} />}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t('settings.confirmPassword')}</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('settings.enterConfirmPassword')}
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && newPassword && (
              <div className="flex items-center gap-2 text-sm">
                {newPassword === confirmPassword ? (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-success">{t('settings.passwordsMatch')}</span>
                  </>
                ) : (
                  <span className="text-destructive">{t('settings.passwordsDontMatch')}</span>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleChangePassword}
            disabled={!canSubmit || isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.changingPassword')}
              </>
            ) : (
              t('settings.changePasswordBtn')
            )}
          </Button>
        </CardContent>
      </Card>

      {/* OTP Re-authentication Dialog */}
      <ReauthDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        onSuccess={handleReauthSuccess}
        actionName={actionName}
        actionDescription={actionDescription}
      />
    </>
  );
}
