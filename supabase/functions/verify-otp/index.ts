import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isValidUUID } from '../_shared/cors.ts';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

// Generate new OTP secret (base32 encoded)
function generateOtpSecret(): string {
  const bytes = new Uint8Array(20);
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
    console.log(`[verify-otp] Action: ${action}`);

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

      // Verify OTP using database RPC function
      const { data: isValid, error: verifyError } = await supabase.rpc('verify_user_otp', {
        p_user_id: userId,
        p_otp_code: otp,
      });

      if (verifyError) {
        console.error('[verify-otp] Verification error:', verifyError);
        return new Response(
          JSON.stringify({ success: false, error: 'Verification failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (isValid === true) {
        // Reset rate limit on success
        await resetRateLimit(userId, supabase);
        console.log(`[verify-otp] OTP verified successfully`);
        
        // Log successful OTP verification
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'auth',
          event_type: 'otp_verified',
          description: 'OTP verification successful',
          metadata: {},
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

      console.log(`[verify-otp] Generated new OTP secret`);

      // Generate QR code URL for authenticator apps
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      const issuer = 'KemikaExpenseSystem';
      const otpAuthUrl = `otpauth://totp/${issuer}:${userProfile?.email}?secret=${newSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

      return new Response(
        JSON.stringify({ 
          success: true, 
          secret: newSecret,
          otpAuthUrl,
          message: 'Scan the QR code with your authenticator app'
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
