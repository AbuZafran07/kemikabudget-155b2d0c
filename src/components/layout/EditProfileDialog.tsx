import { useState, useEffect, useRef } from 'react';
import { User, Loader2, Camera, X, Key, Eye, EyeOff, Check, PenTool, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { resolveSignatureUrl } from '@/lib/signatureUrl';
import { PasswordStrength, validatePassword } from '@/components/auth/PasswordStrength';

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { toast } = useToast();
  const { profile, user, role } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
  });

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (profile && open) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
      setAvatarUrl(profile.avatar_url);
      // Signatures bucket is private — resolve to signed URL for preview
      (async () => {
        const signed = await resolveSignatureUrl(user?.id, (profile as any).signature_url);
        setSignatureUrl(signed);
      })();
      // Reset password fields when dialog opens
      resetPasswordForm();
      setActiveTab('profile');
    }
  }, [profile, open, user?.id]);

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: t('common.error'),
        description: t('profile.invalidImageType'),
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: t('profile.imageTooLarge'),
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(newAvatarUrl);
      toast({
        title: t('profile.avatarUpdated'),
        description: t('profile.avatarUpdatedDesc'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.avatarUploadError'),
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;

    setIsUploadingAvatar(true);
    try {
      await supabase.storage
        .from('avatars')
        .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.gif`, `${user.id}/avatar.webp`]);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(null);
      toast({
        title: t('profile.avatarRemoved'),
        description: t('profile.avatarRemovedDesc'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.avatarRemoveError'),
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    if (!formData.full_name.trim()) {
      toast({
        title: t('common.error'),
        description: t('profile.nameRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: t('profile.updateSuccess'),
        description: t('profile.updateSuccessDesc'),
      });
      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.updateError'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performPasswordChange = async () => {
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: t('settings.passwordChanged'),
        description: t('settings.passwordChangedDesc'),
      });
      resetPasswordForm();
      setActiveTab('profile');
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.passwordChangeError'),
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.currentPasswordRequired'),
        variant: 'destructive',
      });
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      toast({
        title: t('common.error'),
        description: t('settings.newPasswordWeak'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordMismatch'),
        variant: 'destructive',
      });
      return;
    }

    if (currentPassword === newPassword) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordSameAsCurrent'),
        variant: 'destructive',
      });
      return;
    }

    performPasswordChange();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const passwordValidation = validatePassword(newPassword);
  const canSubmitPassword = 
    currentPassword.length > 0 && 
    passwordValidation.isValid && 
    newPassword === confirmPassword &&
    currentPassword !== newPassword;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {t('profile.editProfile')}
            </DialogTitle>
            <DialogDescription>
              {t('profile.editProfileDesc')}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile" className="gap-1 text-xs">
                <User className="h-3.5 w-3.5" />
                Profil
              </TabsTrigger>
              <TabsTrigger value="signature" className="gap-1 text-xs">
                <PenTool className="h-3.5 w-3.5" />
                Tanda Tangan
              </TabsTrigger>
              <TabsTrigger value="password" className="gap-1 text-xs">
                <Key className="h-3.5 w-3.5" />
                Password
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6 py-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar" 
                      className="w-20 h-20 rounded-full object-cover border-2 border-primary/20"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ${avatarUrl ? 'hidden' : ''}`}>
                    <span className="text-2xl font-semibold text-primary">
                      {getInitials(formData.full_name || 'U')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    onClick={handleAvatarClick}
                    disabled={isUploadingAvatar}
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                {avatarUrl && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                  >
                    <X className="h-3 w-3 mr-1" />
                    {t('profile.removeAvatar')}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">{t('profile.avatarHint')}</p>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label>{t('profile.email')}</Label>
                <Input
                  value={profile?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">{t('profile.emailCannotChange')}</p>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full-name">{t('profile.fullName')}</Label>
                <Input
                  id="full-name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder={t('profile.enterFullName')}
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">{t('profile.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t('profile.enterPhone')}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  {t('action.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('action.saving')}
                    </>
                  ) : (
                    t('action.save')
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="signature" className="space-y-6 py-4">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload gambar tanda tangan Anda (PNG transparan disarankan). Tanda tangan akan muncul di dokumen PDF.
                </p>
                
                {signatureUrl ? (
                  <div className="space-y-3">
                    <div className="border rounded-lg p-4 bg-muted/30 inline-block mx-auto">
                      <img 
                        src={signatureUrl} 
                        alt="Tanda Tangan" 
                        className="max-h-24 object-contain mx-auto"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => signatureInputRef.current?.click()}
                        disabled={isUploadingSignature}
                      >
                        {isUploadingSignature ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        Ganti TTD
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (!user?.id) return;
                          setIsUploadingSignature(true);
                          try {
                            await supabase.storage.from('signatures').remove([`${user.id}/signature.png`]);
                            await supabase.from('profiles').update({ signature_url: null, updated_at: new Date().toISOString() }).eq('id', user.id);
                            setSignatureUrl(null);
                            toast({ title: 'Tanda tangan dihapus' });
                          } catch (err) {
                            toast({ title: 'Gagal menghapus', variant: 'destructive' });
                          } finally {
                            setIsUploadingSignature(false);
                          }
                        }}
                        disabled={isUploadingSignature}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Hapus
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
                    <PenTool className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Belum ada tanda tangan</p>
                    <Button 
                      variant="outline"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={isUploadingSignature}
                    >
                      {isUploadingSignature ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                      Upload Tanda Tangan
                    </Button>
                  </div>
                )}
                
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user?.id) return;
                    if (file.type !== 'image/png') {
                      toast({ title: 'Hanya file PNG yang diizinkan', variant: 'destructive' });
                      return;
                    }
                    if (file.size > 2 * 1024 * 1024) {
                      toast({ title: 'Ukuran file maksimal 2MB', variant: 'destructive' });
                      return;
                    }
                    setIsUploadingSignature(true);
                    try {
                      const fileName = `${user.id}/signature.png`;
                      const { error: uploadError } = await supabase.storage
                        .from('signatures')
                        .upload(fileName, file, { upsert: true });
                      if (uploadError) {
                        console.error('[Signature] Upload error:', uploadError);
                        throw uploadError;
                      }
                      // Store the storage path (bucket is private); consumers resolve to signed URLs.
                      const { error: updateError } = await supabase
                        .from('profiles')
                        .update({ signature_url: fileName, updated_at: new Date().toISOString() } as any)
                        .eq('id', user.id);
                      if (updateError) {
                        console.error('[Signature] Profile update error:', updateError);
                        throw updateError;
                      }
                      const signed = await resolveSignatureUrl(user.id, fileName);
                      setSignatureUrl(signed);
                      toast({ title: 'Tanda tangan berhasil diupload' });
                    } catch (err) {
                      console.error('[Signature] Full error:', err);
                      toast({ title: 'Gagal upload', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
                    } finally {
                      setIsUploadingSignature(false);
                      if (signatureInputRef.current) signatureInputRef.current.value = '';
                    }
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="password" className="space-y-4 py-4">
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

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    resetPasswordForm();
                    setActiveTab('profile');
                  }}
                  disabled={isChangingPassword}
                >
                  {t('action.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleChangePassword}
                  disabled={!canSubmitPassword || isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('settings.changingPassword')}
                    </>
                  ) : (
                    t('settings.changePasswordBtn')
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

    </>
  );
}