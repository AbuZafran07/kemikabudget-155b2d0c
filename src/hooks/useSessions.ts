import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useAuditLog } from '@/hooks/useAuditLog';

export interface UserSession {
  id: string;
  user_id: string;
  device_info: string | null;
  ip_address: string | null;
  is_revoked: boolean;
  created_at: string;
  last_active_at: string;
  user?: {
    full_name: string;
    email: string;
  };
}

export function useSessions() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { logEvent } = useAuditLog();

  // Fetch all sessions (super_admin only)
  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ['user-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('last_active_at', { ascending: false });

      if (error) throw error;

      // Fetch user profiles - use profiles_secure view for data masking
      const userIds = [...new Set(data?.map(s => s.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = { full_name: p.full_name, email: p.email };
        return acc;
      }, {} as Record<string, { full_name: string; email: string }>);

      return (data || []).map(session => ({
        ...session,
        user: profileMap[session.user_id],
      })) as UserSession[];
    },
    enabled: role === 'super_admin',
  });

  // Get active sessions count
  const activeSessions = sessions.filter(s => !s.is_revoked);
  const revokedSessions = sessions.filter(s => s.is_revoked);

  // Revoke session mutation
  const revokeSession = useMutation({
    mutationFn: async ({ sessionId, userId }: { sessionId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('user_sessions')
        .update({ is_revoked: true })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return { session: data, userId };
    },
    onSuccess: ({ session, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
      toast({
        title: 'Sesi Dicabut',
        description: 'Sesi pengguna telah dicabut',
      });

      // Log audit event
      logEvent({
        event_type: 'updated',
        entity_type: 'user',
        entity_id: userId,
        description: `Sesi pengguna dicabut (Session ID: ${session.id.slice(0, 8)}...)`,
        metadata: { session_id: session.id, action: 'revoke_session' },
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Mencabut Sesi',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Revoke all sessions for a user
  const revokeAllUserSessions = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_revoked: true })
        .eq('user_id', userId)
        .eq('is_revoked', false);

      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
      toast({
        title: 'Semua Sesi Dicabut',
        description: 'Semua sesi pengguna telah dicabut',
      });

      // Log audit event
      logEvent({
        event_type: 'updated',
        entity_type: 'user',
        entity_id: userId,
        description: `Semua sesi pengguna dicabut`,
        metadata: { action: 'revoke_all_sessions' },
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal Mencabut Sesi',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    sessions,
    activeSessions,
    revokedSessions,
    isLoading,
    refetch,
    revokeSession,
    revokeAllUserSessions,
  };
}
