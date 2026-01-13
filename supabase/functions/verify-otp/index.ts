import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isValidUUID } from '../_shared/cors.ts';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// RFC 6238 compliant TOTP implementation using HMAC-SHA1
// Base32 decoding for OTP secrets
function base32Decode(encoded: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = '';
  for (const char of cleanInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }
  
  return bytes;
}

// Generate HMAC-SHA1 hash (RFC 2104)
async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message.buffer as ArrayBuffer);
  return new Uint8Array(signature);
}

// Convert counter to 8-byte big-endian buffer
function counterToBytes(counter: number): Uint8Array {
  const buffer = new Uint8Array(8);
  let remaining = counter;
  
  for (let i = 7; i >= 0; i--) {
    buffer[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  
  return buffer;
}

// RFC 6238 TOTP verification
async function verifyTOTP(
  secret: string, 
  token: string, 
  window: number = 1
): Promise<boolean> {
  const timeStep = 30;
  const currentTime = Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / timeStep);
  
  // Decode base32 secret
  const secretBytes = base32Decode(secret);
  
  // Check current window and adjacent windows for clock drift tolerance
  for (let i = -window; i <= window; i++) {
    const testCounter = counter + i;
    const expectedToken = await generateHOTP(secretBytes, testCounter);
    
    if (expectedToken === token) {
      return true;
    }
  }
  
  return false;
}

// Generate HOTP code (RFC 4226)
async function generateHOTP(secret: Uint8Array, counter: number): Promise<string> {
  const counterBytes = counterToBytes(counter);
  const hmac = await hmacSha1(secret, counterBytes);
  
  // Dynamic truncation (RFC 4226 Section 5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  
  return code.toString().padStart(6, '0');
}

// Database-backed rate limiting
async function checkRateLimit(
  userId: string, 
  supabase: SupabaseClient
): Promise<{ allowed: boolean; remaining: number; locked: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('check_otp_rate_limit', {
      p_user_id: userId
    });

    if (error) {
      console.error('[verify-otp] Rate limit check error:', error);
      // On error, allow attempt but log it (fail open for availability)
      return { allowed: true, remaining: MAX_ATTEMPTS - 1, locked: false };
    }

    return {
      allowed: data.allowed === true,
      remaining: data.remaining || 0,
      locked: data.locked === true,
      error: data.error || (data.permanent_lock ? 'Account locked. Contact administrator.' : undefined)
    };
  } catch (err) {
    console.error('[verify-otp] Rate limit exception:', err);
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, locked: false };
  }
}

async function recordFailure(userId: string, supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.rpc('record_otp_failure', { p_user_id: userId });
  } catch (err) {
    console.error('[verify-otp] Failed to record failure:', err);
  }
}

async function resetRateLimit(userId: string, supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.rpc('reset_otp_rate_limit', { p_user_id: userId });
  } catch (err) {
    console.error('[verify-otp] Failed to reset rate limit:', err);
  }
}

// Generate new OTP secret (base32 encoded, 160-bit for SHA1)
function generateOtpSecret(): string {
  const bytes = new Uint8Array(20); // 160 bits for HMAC-SHA1
  crypto.getRandomValues(bytes);
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const index = parseInt(bits.slice(i, i + 5), 2);
    result += alphabet[index];
  }
  
  return result;
}

// Progressive delay based on attempt count
function getProgressiveDelay(attemptCount: number): number {
  // Exponential backoff: 0, 1, 2, 4, 8 seconds (max 8s)
  return Math.min(1000 * Math.pow(2, Math.max(0, MAX_ATTEMPTS - attemptCount - 1)), 8000);
}

// Get user's OTP secret from database
async function getUserOtpSecret(userId: string, supabase: SupabaseClient): Promise<string | null> {
  // Try otp_secrets table first
  const { data: secretData } = await supabase
    .from('otp_secrets')
    .select('secret')
    .eq('user_id', userId)
    .single();
  
  if (secretData?.secret) {
    return secretData.secret;
  }
  
  // Fall back to profiles table during migration
  const { data: profileData } = await supabase
    .from('profiles')
    .select('otp_secret')
    .eq('id', userId)
    .single();
  
  return profileData?.otp_secret || null;
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, otp } = await req.json();
    console.log(`[verify-otp] Action: ${action}, using RFC 6238 HMAC-SHA1`);

    // Validate action
    if (!action || !['verify', 'generate-secret'].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (action === 'verify') {
      // Validate userId format
      if (!userId || !isValidUUID(userId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid user ID' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if (!otp) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing OTP' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Validate OTP format
      if (!/^\d{6}$/.test(otp)) {
        return new Response(
          JSON.stringify({ success: false, error: 'OTP must be 6 digits' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check database-backed rate limit
      const rateLimit = await checkRateLimit(userId, supabase);
      
      if (!rateLimit.allowed) {
        console.log(`[verify-otp] Rate limit exceeded or account locked`);
        
        const errorMessage = rateLimit.error || 
          `Too many attempts. Please wait ${LOCKOUT_MINUTES} minutes and try again.`;
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            rateLimited: true,
            locked: rateLimit.locked
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
      }

      // Add progressive delay based on remaining attempts
      const delay = getProgressiveDelay(rateLimit.remaining);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Get user's OTP secret
      const secret = await getUserOtpSecret(userId, supabase);
      
      if (!secret) {
        console.log(`[verify-otp] No OTP secret found for user`);
        return new Response(
          JSON.stringify({ success: false, error: 'OTP not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Verify OTP using RFC 6238 compliant HMAC-SHA1
      const isValid = await verifyTOTP(secret, otp, 1); // Allow 1 window drift (±30s)

      if (isValid) {
        // Reset rate limit on success
        await resetRateLimit(userId, supabase);
        console.log(`[verify-otp] OTP verified successfully (RFC 6238 HMAC-SHA1)`);
        
        // Log successful OTP verification
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'auth',
          event_type: 'otp_verified',
          description: 'OTP verification successful (RFC 6238)',
          metadata: { algorithm: 'HMAC-SHA1', digits: 6, period: 30 },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Record failed attempt
        await recordFailure(userId, supabase);
        console.log(`[verify-otp] Invalid OTP, remaining attempts: ${rateLimit.remaining}`);
        
        // Log failed OTP attempt
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'auth',
          event_type: 'otp_failed',
          description: 'OTP verification failed',
          metadata: { remaining_attempts: rateLimit.remaining },
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid OTP code',
            remainingAttempts: rateLimit.remaining 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }
    } else if (action === 'generate-secret') {
      // Validate userId format
      if (!userId || !isValidUUID(userId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid user ID' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Generate a new OTP secret (only for super_admin use)
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Verify caller is super_admin
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );

      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid token' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Check if user is super_admin using has_role RPC
      const { data: isSuperAdmin } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'super_admin'
      });

      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient permissions' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const newSecret = generateOtpSecret();
      
      // Update user's OTP secret using the secure function
      const { data: updateResult, error: updateError } = await supabase.rpc('set_user_otp_secret', {
        p_user_id: userId,
        p_secret: newSecret,
      });

      if (updateError) {
        console.error('[verify-otp] Failed to update OTP secret:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to configure OTP' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[verify-otp] Generated new OTP secret (RFC 6238 compliant)`);

      // Generate QR code URL for authenticator apps (RFC 6238 compliant)
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      const issuer = 'KemikaExpenseSystem';
      // RFC 6238 compliant otpauth URL
      const otpAuthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userProfile?.email || '')}?secret=${newSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

      return new Response(
        JSON.stringify({ 
          success: true, 
          secret: newSecret,
          otpAuthUrl,
          message: 'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[verify-otp] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
