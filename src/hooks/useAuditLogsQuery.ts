import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { generateAuditLogCSV, downloadCSV, generateAuditLogFilename, AuditLogExportRow } from '@/lib/exportUtils';
import { useToast } from '@/hooks/use-toast';

export interface AuditLogFilters {
  search: string;
  eventType: string;
  entityType: string;
  userId: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
}

export interface AuditLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  description: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  created_at: string;
  user?: { full_name: string; email: string };
}

interface UseAuditLogsOptions {
  pageSize?: number;
}

export function useAuditLogs(options: UseAuditLogsOptions = {}) {
  const { pageSize = 25 } = options;
  const { toast } = useToast();
  
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    eventType: 'all',
    entityType: 'all',
    userId: 'all',
    startDate: undefined,
    endDate: undefined,
  });
  
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch audit logs with server-side filtering
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs-paginated', filters, currentPage, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.eventType !== 'all') {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters.entityType !== 'all') {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters.userId !== 'all') {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }

      if (filters.endDate) {
        // Add 1 day to include the end date
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: logs, error, count } = await query;
      if (error) throw error;

      // Fetch user profiles
      const userIds = [...new Set(logs?.filter(l => l.user_id).map(l => l.user_id))];
      let profiles: Record<string, { full_name: string; email: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles_secure')
          .select('id, full_name, email')
          .in('id', userIds as string[]);
        
        profiles = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = { full_name: p.full_name, email: p.email };
          return acc;
        }, {} as Record<string, { full_name: string; email: string }>);
      }

      const enrichedLogs = (logs || []).map(log => ({
        ...log,
        user: log.user_id ? profiles[log.user_id] : undefined,
      })) as AuditLog[];

      // Apply client-side search filter
      const filteredLogs = filters.search
        ? enrichedLogs.filter(log => {
            const searchLower = filters.search.toLowerCase();
            return (
              log.description.toLowerCase().includes(searchLower) ||
              log.event_type.toLowerCase().includes(searchLower) ||
              log.entity_type.toLowerCase().includes(searchLower) ||
              log.user?.full_name?.toLowerCase().includes(searchLower) ||
              log.user?.email?.toLowerCase().includes(searchLower)
            );
          })
        : enrichedLogs;

      return {
        logs: filteredLogs,
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['audit-log-filter-options'],
    queryFn: async () => {
      // Get unique event types
      const { data: eventTypes } = await supabase
        .from('audit_logs')
        .select('event_type')
        .limit(100);
      
      // Get unique entity types
      const { data: entityTypes } = await supabase
        .from('audit_logs')
        .select('entity_type')
        .limit(100);

      // Get users who have audit logs
      const { data: userIds } = await supabase
        .from('audit_logs')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(100);

      const uniqueUserIds = [...new Set(userIds?.map(u => u.user_id).filter(Boolean))];
      
      let users: { id: string; full_name: string; email: string }[] = [];
      if (uniqueUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles_secure')
          .select('id, full_name, email')
          .in('id', uniqueUserIds as string[]);
        users = profilesData || [];
      }

      return {
        eventTypes: [...new Set(eventTypes?.map(e => e.event_type) || [])],
        entityTypes: [...new Set(entityTypes?.map(e => e.entity_type) || [])],
        users,
      };
    },
  });

  // Export to CSV
  const exportToCSV = useCallback(async () => {
    try {
      // Fetch all matching records for export (up to 5000)
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (filters.eventType !== 'all') {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters.entityType !== 'all') {
        query = query.eq('entity_type', filters.entityType);
      }
      if (filters.userId !== 'all') {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      // Fetch user profiles
      const userIds = [...new Set(logs?.filter(l => l.user_id).map(l => l.user_id))];
      let profiles: Record<string, { full_name: string; email: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles_secure')
          .select('id, full_name, email')
          .in('id', userIds as string[]);
        
        profiles = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = { full_name: p.full_name, email: p.email };
          return acc;
        }, {} as Record<string, { full_name: string; email: string }>);
      }

      const exportData: AuditLogExportRow[] = (logs || []).map(log => ({
        created_at: log.created_at,
        event_type: log.event_type,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        description: log.description,
        user_name: log.user_id ? profiles[log.user_id]?.full_name || null : null,
        user_email: log.user_id ? profiles[log.user_id]?.email || null : null,
        ip_address: log.ip_address,
      }));

      const csvContent = generateAuditLogCSV(exportData);
      const filename = generateAuditLogFilename(filters.startDate, filters.endDate);
      downloadCSV(csvContent, filename);

      toast({
        title: 'Export Berhasil',
        description: `${exportData.length} log berhasil diekspor ke CSV`,
      });
    } catch (error) {
      toast({
        title: 'Export Gagal',
        description: error instanceof Error ? error.message : 'Gagal mengekspor data',
        variant: 'destructive',
      });
    }
  }, [filters, toast]);

  const updateFilters = useCallback((newFilters: Partial<AuditLogFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      search: '',
      eventType: 'all',
      entityType: 'all',
      userId: 'all',
      startDate: undefined,
      endDate: undefined,
    });
    setCurrentPage(1);
  }, []);

  return {
    logs: data?.logs || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    currentPage,
    pageSize,
    filters,
    filterOptions: filterOptions || { eventTypes: [], entityTypes: [], users: [] },
    isLoading,
    setCurrentPage,
    updateFilters,
    resetFilters,
    refetch,
    exportToCSV,
  };
}
