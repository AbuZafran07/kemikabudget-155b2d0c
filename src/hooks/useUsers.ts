import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/contexts/AuthContext';

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  division_id: string | null;
  is_active: boolean;
  requires_otp: boolean;
  created_at: string;
  division?: { code: string; name: string } | null;
  role?: AppRole;
}

export function useUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all users with their roles
  // SECURITY: Explicitly select only required columns to minimize data exposure
  // This hook is used by Users management (super_admin only) but we still follow
  // least-privilege by selecting only what the UI actually needs
  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // Get profiles with explicit column selection (no wildcard)
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          phone,
          division_id,
          is_active,
          requires_otp,
          created_at,
          divisions (code, name)
        `)
        .order('full_name');

      if (profileError) throw profileError;

      // Get roles for each user
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (roleError) throw roleError;

      // Merge profiles with roles
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        division: profile.divisions,
        role: roles?.find(r => r.user_id === profile.id)?.role as AppRole | undefined,
      })) || [];

      return usersWithRoles as UserWithRole[];
    },
  });

  // Fetch divisions
  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Update user profile
  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      fullName,
      divisionId,
      phone,
      isActive,
    }: {
      userId: string;
      fullName: string;
      divisionId: string | null;
      phone: string | null;
      isActive: boolean;
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          division_id: divisionId,
          phone: phone,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Berhasil',
        description: 'Data pengguna berhasil diperbarui',
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

  // Update user role
  const updateUserRole = useMutation({
    mutationFn: async ({
      userId,
      newRole,
    }: {
      userId: string;
      newRole: AppRole;
    }) => {
      // First delete existing role
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Then insert new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: newRole,
        });

      if (insertError) throw insertError;

      // Update requires_otp based on role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          requires_otp: newRole === 'super_admin',
        })
        .eq('id', userId);

      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Berhasil',
        description: 'Role pengguna berhasil diperbarui',
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

  // Toggle user active status
  const toggleUserActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Berhasil',
        description: isActive ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan',
      });
    },
  });

  // Delete user (remove from profiles and user_roles)
  const deleteUser = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      // First delete user roles
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleError) throw roleError;

      // Then delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Berhasil',
        description: 'Pengguna berhasil dihapus',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Create new user
  const createUser = useMutation({
    mutationFn: async ({
      email,
      fullName,
      divisionId,
      phone,
      role,
    }: {
      email: string;
      fullName: string;
      divisionId: string;
      phone?: string;
      role: AppRole;
    }) => {
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: email,
        p_full_name: fullName,
        p_division_id: divisionId,
        p_phone: phone || null,
        p_role: role,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; user_id?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: 'Berhasil',
        description: 'Pengguna baru berhasil ditambahkan',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    users,
    divisions,
    isLoading,
    refetch,
    updateUser,
    updateUserRole,
    toggleUserActive,
    deleteUser,
    createUser,
  };
}
