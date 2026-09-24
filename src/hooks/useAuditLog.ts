import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AuditEventType =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'settled'
  | 'cancelled'
  | 'notification_sent'
  | 'login'
  | 'logout'
  | 'topup'
  | 'reconciliation'
  | 'budget_transfer';

export type AuditEntityType =
  | 'request'
  | 'budget_transfer'
  | 'petty_cash'
  | 'reconciliation'
  | 'user'
  | 'division'
  | 'category'
  | 'funding_source'
  | 'notification';

interface AuditLogData {
  event_type: AuditEventType;
  entity_type: AuditEntityType;
  entity_id?: string;
  description: string;
  metadata?: Record<string, any>;
}

export function useAuditLog() {
  const { profile } = useAuth();

  const logEvent = async (data: AuditLogData): Promise<void> => {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        event_type: data.event_type,
        entity_type: data.entity_type,
        entity_id: data.entity_id || null,
        user_id: profile?.id || null,
        description: data.description,
        metadata: data.metadata || {},
      });

      if (error && import.meta.env.DEV) {
        console.error('Failed to create audit log:', error);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error creating audit log:', err);
      }
    }
  };

  const logRequestEvent = async (
    eventType: AuditEventType,
    requestId: string,
    requestNumber: string,
    additionalInfo?: string
  ) => {
    const descriptions: Record<string, string> = {
      created: `Pengajuan ${requestNumber} dibuat`,
      submitted: `Pengajuan ${requestNumber} diajukan untuk persetujuan`,
      approved: `Pengajuan ${requestNumber} disetujui`,
      rejected: `Pengajuan ${requestNumber} ditolak${additionalInfo ? `: ${additionalInfo}` : ''}`,
      paid: `Pengajuan ${requestNumber} dibayar`,
      settled: `Pengajuan ${requestNumber} diselesaikan`,
      cancelled: `Pengajuan ${requestNumber} dibatalkan`,
    };

    await logEvent({
      event_type: eventType,
      entity_type: 'request',
      entity_id: requestId,
      description: descriptions[eventType] || `Pengajuan ${requestNumber} - ${eventType}`,
      metadata: { request_number: requestNumber, additional_info: additionalInfo },
    });
  };

  const logNotificationSent = async (
    recipientEmail: string,
    eventType: string,
    requestNumber: string
  ) => {
    await logEvent({
      event_type: 'notification_sent',
      entity_type: 'notification',
      description: `Email notifikasi (${eventType}) dikirim ke ${recipientEmail} untuk ${requestNumber}`,
      metadata: { recipient: recipientEmail, event_type: eventType, request_number: requestNumber },
    });
  };

  const logBudgetTransfer = async (
    eventType: 'created' | 'submitted' | 'approved' | 'rejected' | 'updated' | 'deleted',
    transferId: string,
    transferNumber: string,
    additionalInfo?: string
  ) => {
    const descriptions: Record<string, string> = {
      created: `Transfer anggaran ${transferNumber} dibuat`,
      updated: `Draft transfer anggaran ${transferNumber} diperbarui`,
      deleted: `Draft transfer anggaran ${transferNumber} dihapus`,
      submitted: `Transfer anggaran ${transferNumber} diajukan`,
      approved: `Transfer anggaran ${transferNumber} disetujui`,
      rejected: `Transfer anggaran ${transferNumber} ditolak${additionalInfo ? `: ${additionalInfo}` : ''}`,
    };

    await logEvent({
      event_type: eventType,
      entity_type: 'budget_transfer',
      entity_id: transferId,
      description: descriptions[eventType],
      metadata: { transfer_number: transferNumber, additional_info: additionalInfo },
    });
  };

  const logPettyCash = async (
    eventType: 'topup' | 'reconciliation',
    fundingSourceId: string,
    amount: number,
    description: string
  ) => {
    await logEvent({
      event_type: eventType,
      entity_type: eventType === 'topup' ? 'petty_cash' : 'reconciliation',
      entity_id: fundingSourceId,
      description,
      metadata: { amount, funding_source_id: fundingSourceId },
    });
  };

  return {
    logEvent,
    logRequestEvent,
    logNotificationSent,
    logBudgetTransfer,
    logPettyCash,
  };
}