import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
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
  approved_amount: number | null;
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
  division_id?: string; // Optional: if provided, uses this division instead of user's division
}

// Zod schema for draft validation - matches RequestFormData structure
const DraftDataSchema = z.object({
  category_id: z.string().optional(),
  description: z.string().optional(),
  vendor: z.string().optional(),
  amount: z.number().min(0).optional(),
  needed_date: z.string().optional(),
  funding_source_id: z.string().optional(),
  payment_method: z.string().optional(),
  beneficiary_name: z.string().optional(),
  beneficiary_bank: z.string().optional(),
  beneficiary_account: z.string().optional(),
  beneficiary_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  division_id: z.string().uuid().optional(),
});

const DraftStorageSchema = z.object({
  data: DraftDataSchema,
  timestamp: z.number().int().positive(),
});

const AUTOSAVE_INTERVAL = 15000; // 15 seconds
const DRAFT_STORAGE_KEY = 'request_draft';

export function useRequests() {
  const { profile, role, user } = useAuth();
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
          funding_source_options (code, name, type)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Map funding_source_options back to funding_sources key for compatibility
      return (data || []).map(req => ({
        ...req,
        funding_sources: req.funding_source_options,
      })) as unknown as Request[];
    },
    enabled: !!profile,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['cost_categories', role],
    queryFn: async () => {
      let query = supabase
        .from('cost_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      // Non-super_admin can only see public categories
      if (role !== 'super_admin') {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    enabled: role !== undefined, // Wait for role to load before fetching
  });

  // Fetch funding sources - uses secure function for non-privileged users
  // Only returns non-sensitive metadata (id, code, name, type) for dropdown population
  const { data: fundingSources } = useQuery({
    queryKey: ['funding_source_options'],
    queryFn: async () => {
      // Use the secure RPC function that bypasses RLS to provide limited data
      const { data, error } = await supabase.rpc('get_funding_source_options');

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
      const requesterId = user?.id;
      if (!requesterId) {
        throw new Error('Sesi belum siap. Silakan tunggu sebentar lalu coba lagi.');
      }

      // Use division_id from form if provided, otherwise use user's division
      const divisionId = formData.division_id || profile?.division_id;

      if (!divisionId) {
        throw new Error('User must be assigned to a division or select a budget division');
      }

      const { data, error } = await supabase
        .from('requests')
        .insert([
          {
            division_id: divisionId,
            category_id: formData.category_id,
            requester_id: requesterId,
            period_id: activePeriod?.id || null,
            description: formData.description,
            vendor: formData.vendor || null,
            amount: formData.amount,
            needed_date: formData.needed_date || new Date().toISOString().split('T')[0],
            funding_source_id: formData.funding_source_id || null,
            payment_method: formData.payment_method || null,
            beneficiary_name: formData.beneficiary_name || null,
            beneficiary_bank: formData.beneficiary_bank || null,
            beneficiary_account: formData.beneficiary_account || null,
            beneficiary_email: formData.beneficiary_email || null,
            notes: formData.notes || null,
            request_number: '',
          },
        ])
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
          needed_date: formData.needed_date || new Date().toISOString().split('T')[0],
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
      
      // Parse and validate with zod schema
      const parsed = JSON.parse(stored);
      const result = DraftStorageSchema.safeParse(parsed);
      
      if (!result.success) {
        // Invalid data structure - clear corrupted storage
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        console.warn('Invalid request draft in localStorage, cleared corrupted data');
        return null;
      }
      
      const { data, timestamp } = result.data;
      
      // Check if draft is less than 24 hours old
      if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        clearDraft();
        return null;
      }
      return data;
    } catch {
      // JSON parse error - clear corrupted storage
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      console.warn('Corrupted request draft in localStorage, cleared');
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
