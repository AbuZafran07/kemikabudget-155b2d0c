import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, isValidUUID } from '../_shared/cors.ts';

// Rate limiting store (in-memory, resets on function restart)
const otpAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const attempts = otpAttempts.get(userId);

  if (!attempts || now - attempts.firstAttempt > ATTEMPT_WINDOW_MS) {
    otpAttempts.set(userId, { count: 1, firstAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  attempts.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - attempts.count };
}

function resetRateLimit(userId: string): void {
  otpAttempts.delete(userId);
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

      // Check rate limit
      const rateLimit = checkRateLimit(userId);
      if (!rateLimit.allowed) {
        console.log(`[verify-otp] Rate limit exceeded for user`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Too many attempts. Please wait 5 minutes and try again.',
            rateLimited: true 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
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
        resetRateLimit(userId);
        console.log(`[verify-otp] OTP verified successfully`);
        
        // Log successful OTP verification
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'auth',
          event_type: 'otp_verified',
          description: 'OTP verification successful',
          metadata: { remaining_attempts: MAX_ATTEMPTS },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
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
