import { useState, useEffect, useRef } from 'react';
import { User, Loader2, Camera, X } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
  });

  useEffect(() => {
    if (profile && open) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile, open]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: t('common.error'),
        description: t('profile.invalidImageType'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
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

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile
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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;

    setIsUploadingAvatar(true);
    try {
      // Remove from storage
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.gif`, `${user.id}/avatar.webp`]);

      // Update profile to remove avatar_url
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
      // Reload to refresh profile data
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {t('profile.editProfile')}
          </DialogTitle>
          <DialogDescription>
            {t('profile.editProfileDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
