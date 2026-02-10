import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Cleanup attachments from settled/closed requests older than 60 days.
 * Deletes files from storage and removes attachment records.
 * Should be called periodically (e.g., daily via cron or manual trigger).
 */
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const requestedHeaders = req.headers.get('access-control-request-headers');
  if (requestedHeaders) {
    corsHeaders['Access-Control-Allow-Headers'] = requestedHeaders;
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Only super_admin can trigger cleanup
    const { data: isSuperAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin',
    });

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only Super Admin can trigger cleanup' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // ---- REQUEST ATTACHMENTS ----
    // Find attachments for settled/cancelled requests older than 60 days
    const { data: requestAttachments, error: raError } = await supabase
      .from('request_attachments')
      .select('id, file_path, request_id, requests!inner(status, settled_at, updated_at)')
      .in('requests.status', ['settled', 'cancelled'])
      .lt('requests.updated_at', sixtyDaysAgo)
      .limit(500);

    if (raError) {
      console.error('[cleanup] Error fetching request attachments:', raError);
    }

    let requestFilesDeleted = 0;
    if (requestAttachments && requestAttachments.length > 0) {
      const filePaths = requestAttachments.map(a => a.file_path);
      const ids = requestAttachments.map(a => a.id);

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('request-attachments')
        .remove(filePaths);

      if (storageError) {
        console.error('[cleanup] Storage delete error (requests):', storageError);
      }

      // Delete records
      const { error: deleteError } = await supabase
        .from('request_attachments')
        .delete()
        .in('id', ids);

      if (deleteError) {
        console.error('[cleanup] Record delete error (requests):', deleteError);
      } else {
        requestFilesDeleted = ids.length;
      }
    }

    // ---- MEDICAL CLAIM ATTACHMENTS ----
    const { data: medicalAttachments, error: maError } = await supabase
      .from('medical_claim_attachments')
      .select('id, file_path, claim_id, medical_claims!inner(status, closed_at, updated_at)')
      .in('medical_claims.status', ['closed', 'cancelled'])
      .lt('medical_claims.updated_at', sixtyDaysAgo)
      .limit(500);

    if (maError) {
      console.error('[cleanup] Error fetching medical attachments:', maError);
    }

    let medicalFilesDeleted = 0;
    if (medicalAttachments && medicalAttachments.length > 0) {
      const filePaths = medicalAttachments.map(a => a.file_path);
      const ids = medicalAttachments.map(a => a.id);

      const { error: storageError } = await supabase.storage
        .from('medical-attachments')
        .remove(filePaths);

      if (storageError) {
        console.error('[cleanup] Storage delete error (medical):', storageError);
      }

      const { error: deleteError } = await supabase
        .from('medical_claim_attachments')
        .delete()
        .in('id', ids);

      if (deleteError) {
        console.error('[cleanup] Record delete error (medical):', deleteError);
      } else {
        medicalFilesDeleted = ids.length;
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      event_type: 'attachment_cleanup',
      entity_type: 'system',
      description: `Auto-cleanup: ${requestFilesDeleted} request files, ${medicalFilesDeleted} medical files deleted (>60 days settled/closed)`,
      user_id: user.id,
    });

    console.log(`[cleanup] Done: ${requestFilesDeleted} request, ${medicalFilesDeleted} medical files deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: {
          request_attachments: requestFilesDeleted,
          medical_attachments: medicalFilesDeleted,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[cleanup] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
