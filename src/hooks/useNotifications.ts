import { supabase } from '@/integrations/supabase/client';

export type NotificationEventType = 'submitted' | 'approved' | 'rejected' | 'paid' | 'settled';

interface NotificationData {
  event_type: NotificationEventType;
  request_id: string;
  request_number: string;
  requester_email: string;
  requester_name: string;
  amount: number;
  description: string;
  rejection_reason?: string;
  admin_emails?: string[];
}

export function useNotifications() {
  const sendNotification = async (data: NotificationData): Promise<void> => {
    try {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: data,
      });

      if (error && import.meta.env.DEV) {
        console.error('Failed to send notification:', error);
      }
      // Don't throw - notifications should not block the main workflow
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error sending notification:', err);
      }
      // Don't throw - notifications should not block the main workflow
    }
  };

  const getAdminEmails = async (): Promise<string[]> => {
    try {
      // Get emails of super_admin users
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'super_admin');

      if (!adminRoles?.length) return [];

      const adminIds = adminRoles.map(r => r.user_id);
      
      const { data: profiles } = await supabase
        .from('profiles_secure')
        .select('email')
        .in('id', adminIds)
        .eq('is_active', true);

      return profiles?.map(p => p.email) || [];
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching admin emails:', err);
      }
      return [];
    }
  };

  const notifySubmitted = async (request: {
    id: string;
    request_number: string;
    requester_id: string;
    amount: number;
    description: string;
  }) => {
    // Get requester info
    const { data: profile } = await supabase
      .from('profiles_secure')
      .select('email, full_name')
      .eq('id', request.requester_id)
      .single();

    if (!profile) return;

    // Get admin emails
    const adminEmails = await getAdminEmails();

    await sendNotification({
      event_type: 'submitted',
      request_id: request.id,
      request_number: request.request_number,
      requester_email: profile.email,
      requester_name: profile.full_name,
      amount: request.amount,
      description: request.description,
      admin_emails: adminEmails,
    });
  };

  const notifyApproved = async (request: {
    id: string;
    request_number: string;
    requester_id: string;
    amount: number;
    description: string;
  }) => {
    const { data: profile } = await supabase
      .from('profiles_secure')
      .select('email, full_name')
      .eq('id', request.requester_id)
      .single();

    if (!profile) return;

    await sendNotification({
      event_type: 'approved',
      request_id: request.id,
      request_number: request.request_number,
      requester_email: profile.email,
      requester_name: profile.full_name,
      amount: request.amount,
      description: request.description,
    });
  };

  const notifyRejected = async (request: {
    id: string;
    request_number: string;
    requester_id: string;
    amount: number;
    description: string;
    rejection_reason: string;
  }) => {
    const { data: profile } = await supabase
      .from('profiles_secure')
      .select('email, full_name')
      .eq('id', request.requester_id)
      .single();

    if (!profile) return;

    await sendNotification({
      event_type: 'rejected',
      request_id: request.id,
      request_number: request.request_number,
      requester_email: profile.email,
      requester_name: profile.full_name,
      amount: request.amount,
      description: request.description,
      rejection_reason: request.rejection_reason,
    });
  };

  const notifyPaid = async (request: {
    id: string;
    request_number: string;
    requester_id: string;
    amount: number;
    description: string;
  }) => {
    const { data: profile } = await supabase
      .from('profiles_secure')
      .select('email, full_name')
      .eq('id', request.requester_id)
      .single();

    if (!profile) return;

    await sendNotification({
      event_type: 'paid',
      request_id: request.id,
      request_number: request.request_number,
      requester_email: profile.email,
      requester_name: profile.full_name,
      amount: request.amount,
      description: request.description,
    });
  };

  return {
    sendNotification,
    notifySubmitted,
    notifyApproved,
    notifyRejected,
    notifyPaid,
  };
}
