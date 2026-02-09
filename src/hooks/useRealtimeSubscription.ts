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
 * and automatically invalidate related React Query caches
 */
export function useRealtimeSubscription({
  tables,
  queryKeys,
  enabled = true,
}: UseRealtimeOptions) {
  const queryClient = useQueryClient();

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      console.log('[Realtime] Change detected:', payload.table, payload.eventType);
      
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
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Subscribed to:', tables.join(', '));
      }
    });

    return () => {
      console.log('[Realtime] Unsubscribing from:', tables.join(', '));
      supabase.removeChannel(channel);
    };
  }, [enabled, tables.join(','), handleChange]);
}

/**
 * Pre-configured realtime subscription for Requests module
 */
export function useRequestsRealtime() {
  useRealtimeSubscription({
    tables: ['requests', 'request_attachments', 'request_events'],
    queryKeys: [
      ['requests'],
      ['request'],
      ['request-attachments'],
      ['request-events'],
      ['pending-approvals'],
      ['dashboard-stats'],
    ],
  });
}

/**
 * Pre-configured realtime subscription for Cash Advances module
 */
export function useCashAdvanceRealtime() {
  useRealtimeSubscription({
    tables: ['cash_advances', 'cash_advance_items', 'cash_advance_settlements', 'cash_advance_events'],
    queryKeys: [
      ['cash-advances'],
      ['cash-advance'],
      ['cash-advance-items'],
      ['cash-advance-settlements'],
      ['cash-advance-events'],
      ['pending-approvals'],
      ['dashboard-stats'],
    ],
  });
}

/**
 * Pre-configured realtime subscription for Medical Claims module
 */
export function useMedicalClaimsRealtime() {
  useRealtimeSubscription({
    tables: ['medical_claims', 'medical_claim_events', 'medical_claim_attachments'],
    queryKeys: [
      ['medical-claims'],
      ['medical-claim'],
      ['medical-claim-events'],
      ['medical-claim-attachments'],
      ['medical-budget'],
      ['pending-approvals'],
      ['dashboard-stats'],
    ],
  });
}

/**
 * Pre-configured realtime subscription for Budget module
 */
export function useBudgetRealtime() {
  useRealtimeSubscription({
    tables: ['division_budgets', 'budget_transfers'],
    queryKeys: [
      ['division-budgets'],
      ['budget-transfers'],
      ['budget-planning'],
      ['dashboard-stats'],
    ],
  });
}

/**
 * Pre-configured realtime subscription for Finance module
 */
export function useFinanceRealtime() {
  useRealtimeSubscription({
    tables: ['funding_sources', 'petty_cash_transactions'],
    queryKeys: [
      ['funding-sources'],
      ['petty-cash-transactions'],
      ['petty-cash-wallets'],
      ['payment-queue'],
      ['dashboard-stats'],
    ],
  });
}

/**
 * Pre-configured realtime subscription for Dashboard
 */
export function useDashboardRealtime() {
  useRealtimeSubscription({
    tables: [
      'requests',
      'cash_advances',
      'medical_claims',
      'division_budgets',
      'funding_sources',
    ],
    queryKeys: [
      ['dashboard-stats'],
      ['dashboard-kpis'],
      ['pending-approvals'],
      ['recent-activity'],
      ['budget-summary'],
    ],
  });
}
