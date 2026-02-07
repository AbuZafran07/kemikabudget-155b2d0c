import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  divisionId: string;
  phone?: string;
  role: 'super_admin' | 'finance' | 'admin' | 'user';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const requestedHeaders = req.headers.get('access-control-request-headers');
  if (requestedHeaders) {
    corsHeaders['Access-Control-Allow-Headers'] = requestedHeaders;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authorization header to verify the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify they're super_admin
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the user making the request
    const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callerUser) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if caller is super_admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .single();

    if (roleError || roleData?.role !== 'super_admin') {
      console.error('Role check failed:', roleError || 'Not super_admin');
      return new Response(
        JSON.stringify({ success: false, error: 'Only super_admin can create users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: max 50 users created per hour per admin
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentCreations, error: rateLimitError } = await supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', callerUser.id)
      .eq('event_type', 'user_created')
      .gte('created_at', oneHourAgo);

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      // Continue on error - don't block legitimate requests
    } else if (recentCreations !== null && recentCreations >= 50) {
      console.log(`Rate limit exceeded for admin ${callerUser.id}: ${recentCreations} users in last hour`);
      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded: maximum 50 users per hour' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const payload: CreateUserPayload = await req.json();
    const { email, password, fullName, divisionId, phone, role } = payload;

    // Validate inputs
    if (!email || !password || !fullName || !divisionId || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if division exists
    const { data: division, error: divError } = await supabaseAdmin
      .from('divisions')
      .select('id')
      .eq('id', divisionId)
      .eq('is_active', true)
      .single();

    if (divError || !division) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or inactive division' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'User with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating user: ${email} with role: ${role}`);

    // Create the user in auth.users using admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: fullName.trim(),
      },
    });

    if (createError || !newUser.user) {
      console.error('Create user error:', createError);
      return new Response(
        JSON.stringify({ success: false, error: createError?.message || 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = newUser.user.id;
    console.log(`User created with ID: ${userId}`);

    // The handle_new_user trigger should create the profile, but we update it with additional info
    // Wait a bit for the trigger to execute
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update the profile with division and phone
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        division_id: divisionId,
        phone: phone?.trim() || null,
        is_active: true,
        requires_otp: role === 'super_admin',
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Don't fail completely, profile might still work
    }

    // Update or insert user role
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: role,
      }, { onConflict: 'user_id' });

    if (roleInsertError) {
      console.error('Role insert error:', roleInsertError);
    }

    // Log the action
    await supabaseAdmin.from('audit_logs').insert({
      entity_type: 'user',
      entity_id: userId,
      event_type: 'user_created',
      user_id: callerUser.id,
      description: 'User created by admin with password',
      metadata: { email: email, role: role, division_id: divisionId },
    });

    console.log(`User ${email} created successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User created successfully',
        user_id: userId 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
