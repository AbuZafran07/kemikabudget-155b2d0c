import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName = 
  | 'requests'
  | 'cash_advances'
  | 'cash_advance_items'
  | 'cash_advance_settlements'
  | 'cash_advance_events'
  | 'medical_claims'
  | 'medical_claim_events'
  | 'medical_claim_attachments'
  | 'budget_transfers'
  | 'division_budgets'
  | 'funding_sources'
  | 'petty_cash_transactions'
  | 'request_attachments'
  | 'request_events'
  | 'notification_logs';

interface UseRealtimeOptions {
  tables: TableName[];
  queryKeys: string[][];
  enabled?: boolean;
}

/**
 * Hook to subscribe to realtime changes on multiple tables
 * and automatically invalidate related React Query caches.
 * 
 * HYBRID STRATEGY:
 * - Realtime is ONLY used for critical pages: Approvals, Payment Queue, Header/Sidebar badges
 * - All other pages use polling via refetchInterval on their React Query hooks
 * - This reduces WebSocket connections and cloud resource usage
 */
export function useRealtimeSubscription({
  tables,
  queryKeys,
  enabled = true,
}: UseRealtimeOptions) {
  const queryClient = useQueryClient();

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (import.meta.env.DEV) {
        console.log('[Realtime] Change detected:', payload.table, payload.eventType);
      }
      
      // Invalidate all related query keys
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    [queryClient, queryKeys]
  );

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const channelName = `realtime-${tables.join('-')}-${Date.now()}`;
    let channel: RealtimeChannel = supabase.channel(channelName);

    // Subscribe to each table
    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        handleChange
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && import.meta.env.DEV) {
        console.log('[Realtime] Subscribed to:', tables.join(', '));
      }
    });

    return () => {
      if (import.meta.env.DEV) {
        console.log('[Realtime] Unsubscribing from:', tables.join(', '));
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, tables.join(','), handleChange]);
}

/**
 * ============================================================
 * POLLING INTERVAL CONSTANT
 * Used by non-critical pages instead of realtime subscriptions
 * ============================================================
 */
export const POLLING_INTERVAL_MS = 30_000; // 30 seconds
