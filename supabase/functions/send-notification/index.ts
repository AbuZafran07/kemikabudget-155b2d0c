import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  event_type: "submitted" | "approved" | "rejected" | "paid" | "settled";
  request_id: string;
  request_number: string;
  requester_email: string;
  requester_name: string;
  amount: number;
  description: string;
  rejection_reason?: string;
  admin_emails?: string[];
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const getEmailContent = (data: NotificationRequest): { subject: string; html: string } => {
  const baseStyle = `
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f9f9f9;
  `;

  const headerStyle = `
    background-color: #2d5a27;
    color: white;
    padding: 20px;
    text-align: center;
    border-radius: 8px 8px 0 0;
  `;

  const contentStyle = `
    background-color: white;
    padding: 30px;
    border-radius: 0 0 8px 8px;
    border: 1px solid #e0e0e0;
  `;

  const tableStyle = `
    width: 100%;
    margin: 20px 0;
    border-collapse: collapse;
  `;

  const cellStyle = `
    padding: 12px;
    border-bottom: 1px solid #e0e0e0;
    text-align: left;
  `;

  switch (data.event_type) {
    case "submitted":
      return {
        subject: `[Persetujuan Diperlukan] Pengajuan ${data.request_number}`,
        html: `
          <div style="${baseStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Pengajuan Baru Menunggu Persetujuan</h1>
            </div>
            <div style="${contentStyle}">
              <p>Yth. Admin,</p>
              <p>Pengajuan baru telah dikirim dan memerlukan persetujuan Anda:</p>
              <table style="${tableStyle}">
                <tr><td style="${cellStyle}"><strong>No. Pengajuan</strong></td><td style="${cellStyle}">${data.request_number}</td></tr>
                <tr><td style="${cellStyle}"><strong>Pengaju</strong></td><td style="${cellStyle}">${data.requester_name}</td></tr>
                <tr><td style="${cellStyle}"><strong>Deskripsi</strong></td><td style="${cellStyle}">${data.description}</td></tr>
                <tr><td style="${cellStyle}"><strong>Jumlah</strong></td><td style="${cellStyle}">${formatCurrency(data.amount)}</td></tr>
              </table>
              <p>Silakan masuk ke sistem untuk meninjau dan menyetujui pengajuan ini.</p>
              <p>Terima kasih,<br>Sistem Anggaran PT. Kemika Karya Pratama</p>
            </div>
          </div>
        `,
      };

    case "approved":
      return {
        subject: `[Disetujui] Pengajuan ${data.request_number} Telah Disetujui`,
        html: `
          <div style="${baseStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Pengajuan Disetujui ✓</h1>
            </div>
            <div style="${contentStyle}">
              <p>Yth. ${data.requester_name},</p>
              <p>Pengajuan Anda telah <strong style="color: #22c55e;">DISETUJUI</strong>:</p>
              <table style="${tableStyle}">
                <tr><td style="${cellStyle}"><strong>No. Pengajuan</strong></td><td style="${cellStyle}">${data.request_number}</td></tr>
                <tr><td style="${cellStyle}"><strong>Deskripsi</strong></td><td style="${cellStyle}">${data.description}</td></tr>
                <tr><td style="${cellStyle}"><strong>Jumlah</strong></td><td style="${cellStyle}">${formatCurrency(data.amount)}</td></tr>
              </table>
              <p>Pengajuan Anda sedang dalam antrian pembayaran dan akan segera diproses.</p>
              <p>Terima kasih,<br>Sistem Anggaran PT. Kemika Karya Pratama</p>
            </div>
          </div>
        `,
      };

    case "rejected":
      return {
        subject: `[Ditolak] Pengajuan ${data.request_number} Ditolak`,
        html: `
          <div style="${baseStyle}">
            <div style="${headerStyle}; background-color: #dc2626;">
              <h1 style="margin: 0;">Pengajuan Ditolak</h1>
            </div>
            <div style="${contentStyle}">
              <p>Yth. ${data.requester_name},</p>
              <p>Mohon maaf, pengajuan Anda telah <strong style="color: #dc2626;">DITOLAK</strong>:</p>
              <table style="${tableStyle}">
                <tr><td style="${cellStyle}"><strong>No. Pengajuan</strong></td><td style="${cellStyle}">${data.request_number}</td></tr>
                <tr><td style="${cellStyle}"><strong>Deskripsi</strong></td><td style="${cellStyle}">${data.description}</td></tr>
                <tr><td style="${cellStyle}"><strong>Jumlah</strong></td><td style="${cellStyle}">${formatCurrency(data.amount)}</td></tr>
                <tr><td style="${cellStyle}"><strong>Alasan Penolakan</strong></td><td style="${cellStyle}">${data.rejection_reason || '-'}</td></tr>
              </table>
              <p>Silakan hubungi atasan Anda jika ada pertanyaan.</p>
              <p>Terima kasih,<br>Sistem Anggaran PT. Kemika Karya Pratama</p>
            </div>
          </div>
        `,
      };

    case "paid":
      return {
        subject: `[Dibayar] Pengajuan ${data.request_number} Telah Dibayar`,
        html: `
          <div style="${baseStyle}">
            <div style="${headerStyle}; background-color: #0ea5e9;">
              <h1 style="margin: 0;">Pembayaran Berhasil ✓</h1>
            </div>
            <div style="${contentStyle}">
              <p>Yth. ${data.requester_name},</p>
              <p>Pengajuan Anda telah <strong style="color: #0ea5e9;">DIBAYAR</strong>:</p>
              <table style="${tableStyle}">
                <tr><td style="${cellStyle}"><strong>No. Pengajuan</strong></td><td style="${cellStyle}">${data.request_number}</td></tr>
                <tr><td style="${cellStyle}"><strong>Deskripsi</strong></td><td style="${cellStyle}">${data.description}</td></tr>
                <tr><td style="${cellStyle}"><strong>Jumlah</strong></td><td style="${cellStyle}">${formatCurrency(data.amount)}</td></tr>
              </table>
              <p>Dana telah ditransfer. Silakan cek rekening Anda.</p>
              <p>Terima kasih,<br>Sistem Anggaran PT. Kemika Karya Pratama</p>
            </div>
          </div>
        `,
      };

    case "settled":
      return {
        subject: `[Selesai] Pengajuan ${data.request_number} Telah Diselesaikan`,
        html: `
          <div style="${baseStyle}">
            <div style="${headerStyle}">
              <h1 style="margin: 0;">Pengajuan Selesai ✓</h1>
            </div>
            <div style="${contentStyle}">
              <p>Yth. ${data.requester_name},</p>
              <p>Pengajuan Anda telah <strong>SELESAI</strong>:</p>
              <table style="${tableStyle}">
                <tr><td style="${cellStyle}"><strong>No. Pengajuan</strong></td><td style="${cellStyle}">${data.request_number}</td></tr>
                <tr><td style="${cellStyle}"><strong>Deskripsi</strong></td><td style="${cellStyle}">${data.description}</td></tr>
                <tr><td style="${cellStyle}"><strong>Jumlah</strong></td><td style="${cellStyle}">${formatCurrency(data.amount)}</td></tr>
              </table>
              <p>Terima kasih telah menggunakan sistem kami.</p>
              <p>Salam,<br>Sistem Anggaran PT. Kemika Karya Pratama</p>
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: `Update Pengajuan ${data.request_number}`,
        html: `<p>Pengajuan ${data.request_number} telah diperbarui.</p>`,
      };
  }
};

const sendWithResend = async (
  apiKey: string,
  to: string[],
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "PT Kemika <onboarding@resend.dev>",
        to: to,
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend API error:", response.status, errorText);
      return { success: false, error: errorText };
    }

    const result = await response.json();
    console.log("Resend API success:", result);
    return { success: true };
  } catch (err: any) {
    console.error("Resend API exception:", err);
    return { success: false, error: err.message };
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client for logging
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data: NotificationRequest = await req.json();
    console.log("Received notification request:", data);

    const { subject, html } = getEmailContent(data);
    const recipients: string[] = [];

    // For submitted events, send to admin_emails
    if (data.event_type === "submitted" && data.admin_emails?.length) {
      recipients.push(...data.admin_emails);
    } else {
      // For other events, send to requester
      recipients.push(data.requester_email);
    }

    console.log("Sending email to:", recipients, "Subject:", subject);

    if (recipients.length === 0) {
      console.log("No recipients found");
      
      // Log the notification attempt
      await supabase.from("notification_logs").insert({
        request_id: data.request_id,
        event_type: data.event_type,
        recipients: [],
        subject: subject,
        status: "failed",
        error_message: "No recipients found",
      });

      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, message: "No recipients" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send emails
    const result = await sendWithResend(RESEND_API_KEY, recipients, subject, html);

    // Log the notification
    await supabase.from("notification_logs").insert({
      request_id: data.request_id,
      event_type: data.event_type,
      recipients: recipients,
      subject: subject,
      status: result.success ? "sent" : "failed",
      error_message: result.error || null,
      sent_at: result.success ? new Date().toISOString() : null,
    });

    return new Response(
      JSON.stringify({
        success: result.success,
        sent: result.success ? recipients.length : 0,
        failed: result.success ? 0 : recipients.length,
        error: result.error,
      }),
      {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    
    // Try to log the error
    try {
      await supabase.from("notification_logs").insert({
        request_id: null,
        event_type: "unknown",
        recipients: [],
        subject: "Error",
        status: "failed",
        error_message: error.message,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);