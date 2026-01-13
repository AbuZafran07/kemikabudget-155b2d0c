import { supabase } from "@/integrations/supabase/client";

interface LogNotificationParams {
  requestId?: string;
  eventType: string;
  recipients: string[];
  subject: string;
  status: "pending" | "sent" | "failed";
  errorMessage?: string;
}

export function useNotificationLogs() {
  const logNotification = async (params: LogNotificationParams) => {
    const { error } = await supabase.from("notification_logs").insert({
      request_id: params.requestId || null,
      event_type: params.eventType,
      recipients: params.recipients,
      subject: params.subject,
      status: params.status,
      error_message: params.errorMessage || null,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    });

    if (error && import.meta.env.DEV) {
      console.error("Failed to log notification:", error);
    }
  };

  const updateNotificationStatus = async (
    logId: string,
    status: "sent" | "failed",
    errorMessage?: string
  ) => {
    const { error } = await supabase
      .from("notification_logs")
      .update({
        status,
        error_message: errorMessage || null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", logId);

    if (error && import.meta.env.DEV) {
      console.error("Failed to update notification log:", error);
    }
  };

  return { logNotification, updateNotificationStatus };
}