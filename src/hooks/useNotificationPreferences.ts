import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface NotificationPreferences {
  id: string;
  user_id: string;
  notify_on_submit: boolean;
  notify_on_approve: boolean;
  notify_on_reject: boolean;
  notify_on_pay: boolean;
  notify_on_settle: boolean;
  created_at: string;
  updated_at: string;
}

const defaultPreferences = {
  notify_on_submit: true,
  notify_on_approve: true,
  notify_on_reject: true,
  notify_on_pay: true,
  notify_on_settle: true,
};

export function useNotificationPreferences() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['notification-preferences', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as NotificationPreferences | null;
    },
    enabled: !!profile?.id,
  });

  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      if (!profile?.id) throw new Error('User not authenticated');

      // Check if preferences exist
      const { data: existing } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('notification_preferences')
          .update(updates)
          .eq('user_id', profile.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: profile.id,
            ...defaultPreferences,
            ...updates,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Tersimpan',
        description: 'Preferensi notifikasi berhasil disimpan',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getPreference = (key: keyof typeof defaultPreferences): boolean => {
    if (preferences) {
      return preferences[key];
    }
    return defaultPreferences[key];
  };

  return {
    preferences: preferences || {
      ...defaultPreferences,
      id: '',
      user_id: profile?.id || '',
      created_at: '',
      updated_at: '',
    } as NotificationPreferences,
    isLoading,
    updatePreferences,
    getPreference,
  };
}