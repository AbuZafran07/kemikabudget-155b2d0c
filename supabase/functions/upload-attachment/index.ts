import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isValidUUID } from '../_shared/cors.ts';

// Allowed MIME types and extensions for security
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/msword': ['.doc'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// File magic numbers for validation
const MAGIC_NUMBERS: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a, GIF89a
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF)
};

const VALID_ATTACHMENT_TYPES = ['quotation', 'invoice', 'receipt', 'other'];

function validateMagicNumbers(bytes: Uint8Array, mimeType: string): boolean {
  const signatures = MAGIC_NUMBERS[mimeType];
  if (!signatures) {
    // For Office documents and text files, we rely on MIME type check
    return true;
  }

  for (const sig of signatures) {
    let matches = true;
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\.\//g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '');
  
  // Keep only alphanumeric, dots, underscores, and hyphens
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, '');
  
  // Collapse multiple dots
  sanitized = sanitized.replace(/\.{2,}/g, '.');
  
  // Limit filename length
  if (sanitized.length > 100) {
    const ext = sanitized.slice(sanitized.lastIndexOf('.'));
    sanitized = sanitized.slice(0, 96 - ext.length) + ext;
  }
  
  // Ensure filename is not empty
  if (!sanitized || sanitized === '.') {
    sanitized = 'file';
  }
  
  return sanitized;
}

function getExtensionFromMime(mimeType: string): string {
  const extensions = ALLOWED_MIME_TYPES[mimeType];
  return extensions ? extensions[0] : '.bin';
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get user token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('[upload-attachment] Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log(`[upload-attachment] Processing upload for user: ${user.id}`);

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const requestId = formData.get('requestId') as string | null;
    const attachmentType = formData.get('attachmentType') as string | null;

    // Validate requestId format
    if (!requestId || !isValidUUID(requestId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request ID format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate attachment type
    const safeAttachmentType = attachmentType && VALID_ATTACHMENT_TYPES.includes(attachmentType) 
      ? attachmentType 
      : 'other';

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.log(`[upload-attachment] File too large: ${file.size} bytes`);
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 10MB limit' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES[file.type]) {
      console.log(`[upload-attachment] Invalid MIME type: ${file.type}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'File type not allowed. Only PDF, images, and Office documents are permitted.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Read file bytes for magic number validation
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    
    if (!validateMagicNumbers(fileBytes, file.type)) {
      console.log(`[upload-attachment] Magic number validation failed for: ${file.type}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'File content does not match declared type' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verify request exists
    const { data: requestData, error: requestError } = await supabase
      .from('requests')
      .select('requester_id, division_id, status')
      .eq('id', requestId)
      .single();

    if (requestError || !requestData) {
      console.log(`[upload-attachment] Request not found: ${requestId}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Request not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Check if user is the requester or has appropriate role using has_role RPC
    if (requestData.requester_id !== user.id) {
      // Use has_role RPC for consistent multi-role handling
      const { data: isSuperAdmin } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'super_admin'
      });
      
      const { data: isFinance } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'finance'
      });

      if (!isSuperAdmin && !isFinance) {
        console.log(`[upload-attachment] User ${user.id} not authorized for request ${requestId}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Not authorized to upload to this request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    // Generate secure server-side filename
    const sanitizedOriginalName = sanitizeFilename(file.name);
    const extension = getExtensionFromMime(file.type);
    const uniqueId = crypto.randomUUID();
    const secureFileName = `${user.id}/${requestId}/${uniqueId}${extension}`;

    console.log(`[upload-attachment] Uploading to: ${secureFileName}`);

    // Upload file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('request-attachments')
      .upload(secureFileName, fileBytes, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload-attachment] Upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Insert attachment record
    const { data: attachmentData, error: attachmentError } = await supabase
      .from('request_attachments')
      .insert({
        request_id: requestId,
        file_name: sanitizedOriginalName,
        file_path: secureFileName,
        file_size: file.size,
        file_type: file.type,
        attachment_type: safeAttachmentType,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (attachmentError) {
      console.error('[upload-attachment] Attachment record error:', attachmentError);
      // Try to clean up uploaded file
      await supabase.storage.from('request-attachments').remove([secureFileName]);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save attachment record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[upload-attachment] Successfully uploaded: ${secureFileName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        attachment: {
          id: attachmentData.id,
          fileName: sanitizedOriginalName,
          filePath: secureFileName,
          fileSize: file.size,
          fileType: file.type,
          attachmentType: safeAttachmentType,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload-attachment] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
