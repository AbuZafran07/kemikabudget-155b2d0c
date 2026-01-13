import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';

export interface Request {
  id: string;
  request_number: string;
  division_id: string;
  category_id: string;
  requester_id: string;
  period_id: string | null;
  description: string;
  vendor: string | null;
  amount: number;
  needed_date: string;
  funding_source_id: string | null;
  payment_method: string | null;
  beneficiary_name: string | null;
  beneficiary_bank: string | null;
  beneficiary_account: string | null;
  beneficiary_email: string | null;
  notes: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'settled' | 'cancelled';
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  divisions?: { code: string; name: string };
  cost_categories?: { code: string; name: string };
  funding_sources?: { code: string; name: string; type: string };
  profiles?: { full_name: string };
}

export interface RequestFormData {
  category_id: string;
  description: string;
  vendor: string;
  amount: number;
  needed_date: string;
  funding_source_id: string;
  payment_method: string;
  beneficiary_name: string;
  beneficiary_bank: string;
  beneficiary_account: string;
  beneficiary_email: string;
  notes: string;
}

const AUTOSAVE_INTERVAL = 15000; // 15 seconds
const DRAFT_STORAGE_KEY = 'request_draft';

export function useRequests() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifySubmitted } = useNotifications();

  // Fetch requests
  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['requests', profile?.division_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_sources (code, name, type)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as Request[];
    },
    enabled: !!profile,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['cost_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch funding sources - uses secure view for non-privileged users
  // Finance and super_admin get full details, others get limited info via RLS
  const { data: fundingSources } = useQuery({
    queryKey: ['funding_sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funding_sources')
        .select('id, code, name, type, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // Fetch active budget period
  const { data: activePeriod } = useQuery({
    queryKey: ['active_budget_period'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_periods')
        .select('*')
        .eq('is_active', true)
        .eq('is_closed', false)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  // Create request mutation
  const createRequest = useMutation({
    mutationFn: async (formData: RequestFormData) => {
      if (!profile?.division_id) {
        throw new Error('User must be assigned to a division');
      }

      const { data, error } = await supabase
        .from('requests')
        .insert([{
          division_id: profile.division_id,
          category_id: formData.category_id,
          requester_id: profile.id,
          period_id: activePeriod?.id || null,
          description: formData.description,
          vendor: formData.vendor || null,
          amount: formData.amount,
          needed_date: formData.needed_date,
          funding_source_id: formData.funding_source_id || null,
          payment_method: formData.payment_method || null,
          beneficiary_name: formData.beneficiary_name || null,
          beneficiary_bank: formData.beneficiary_bank || null,
          beneficiary_account: formData.beneficiary_account || null,
          beneficiary_email: formData.beneficiary_email || null,
          notes: formData.notes || null,
          request_number: '',
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      clearDraft();
      toast({
        title: 'Draft Tersimpan',
        description: 'Pengajuan berhasil disimpan sebagai draft',
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

  // Update request mutation
  const updateRequest = useMutation({
    mutationFn: async ({ id, ...formData }: RequestFormData & { id: string }) => {
      const { data, error } = await supabase
        .from('requests')
        .update({
          category_id: formData.category_id,
          description: formData.description,
          vendor: formData.vendor || null,
          amount: formData.amount,
          needed_date: formData.needed_date,
          funding_source_id: formData.funding_source_id || null,
          payment_method: formData.payment_method || null,
          beneficiary_name: formData.beneficiary_name || null,
          beneficiary_bank: formData.beneficiary_bank || null,
          beneficiary_account: formData.beneficiary_account || null,
          beneficiary_email: formData.beneficiary_email || null,
          notes: formData.notes || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast({
        title: 'Tersimpan',
        description: 'Perubahan berhasil disimpan',
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

  // Submit request mutation
  const submitRequest = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('requests')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      clearDraft();
      toast({
        title: 'Pengajuan Dikirim',
        description: 'Pengajuan Anda telah dikirim untuk persetujuan',
      });

      // Send email notification to admins
      notifySubmitted({
        id: data.id,
        request_number: data.request_number,
        requester_id: data.requester_id,
        amount: data.amount,
        description: data.description,
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

  // Cancel request mutation
  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast({
        title: 'Dibatalkan',
        description: 'Pengajuan telah dibatalkan',
      });
    },
  });

  // Draft management
  const saveDraft = useCallback((data: Partial<RequestFormData>) => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  }, []);

  const loadDraft = useCallback((): Partial<RequestFormData> | null => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) return null;
      
      const { data, timestamp } = JSON.parse(stored);
      // Check if draft is less than 24 hours old
      if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        clearDraft();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  return {
    requests,
    isLoading,
    refetch,
    categories,
    fundingSources,
    activePeriod,
    createRequest,
    updateRequest,
    submitRequest,
    cancelRequest,
    saveDraft,
    loadDraft,
    clearDraft,
    AUTOSAVE_INTERVAL,
  };
}
