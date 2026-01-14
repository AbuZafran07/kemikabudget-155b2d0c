-- Fix admin_create_user to use Supabase's auth.users table properly
-- The issue is profiles.id has a foreign key to auth.users(id) 
-- So we need to use auth.admin.create_user or a simpler approach

-- Option: Remove the foreign key constraint from profiles.id to auth.users
-- This allows profiles to be created before auth signup completes
-- The user will then claim their profile by signing up with matching email

-- First, drop the existing foreign key constraint on profiles.id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Recreate the admin_create_user function to properly handle this case
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text, 
  p_full_name text, 
  p_division_id uuid, 
  p_role app_role, 
  p_phone text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_caller_id UUID;
  v_safe_email TEXT;
  v_safe_name TEXT;
  v_safe_phone TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller is super_admin
  IF NOT has_role(v_caller_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can create users');
  END IF;
  
  -- Validate and sanitize email
  v_safe_email := LOWER(TRIM(p_email));
  IF v_safe_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email format');
  END IF;
  
  IF LENGTH(v_safe_email) > 255 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email too long');
  END IF;
  
  -- Validate and sanitize name
  v_safe_name := TRIM(p_full_name);
  IF LENGTH(v_safe_name) < 2 OR LENGTH(v_safe_name) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Name must be 2-100 characters');
  END IF;
  
  -- Validate and sanitize phone
  IF p_phone IS NOT NULL THEN
    v_safe_phone := TRIM(p_phone);
    IF LENGTH(v_safe_phone) > 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Phone number too long');
    END IF;
    v_safe_phone := regexp_replace(v_safe_phone, '[^0-9+]', '', 'g');
  ELSE
    v_safe_phone := NULL;
  END IF;
  
  -- Validate division exists
  IF NOT EXISTS (SELECT 1 FROM divisions WHERE id = p_division_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive division');
  END IF;
  
  -- Check if email already exists in profiles
  IF EXISTS (SELECT 1 FROM profiles WHERE email = v_safe_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User with this email already exists');
  END IF;
  
  -- Generate a UUID for the pending user
  v_user_id := gen_random_uuid();
  
  -- Create profile (pending user - no auth.users entry yet)
  -- The user will "claim" this profile when they sign up with the same email
  INSERT INTO profiles (id, email, full_name, division_id, phone, is_active, requires_otp)
  VALUES (v_user_id, v_safe_email, v_safe_name, p_division_id, v_safe_phone, true, p_role = 'super_admin');
  
  -- Assign role
  INSERT INTO user_roles (user_id, role) VALUES (v_user_id, p_role);
  
  -- Audit log
  INSERT INTO audit_logs (entity_type, entity_id, event_type, user_id, description, metadata)
  VALUES ('user', v_user_id, 'user_created', v_caller_id, 'User created by admin',
    jsonb_build_object('email', v_safe_email, 'role', p_role, 'division_id', p_division_id));
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User created successfully. They need to sign up with this email.',
    'user_id', v_user_id
  );
END;
$function$;

-- Update handle_new_user to check for existing profile by email and claim it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_profile_id UUID;
  v_existing_role app_role;
BEGIN
  -- Check if there's a pre-created profile for this email (created by admin)
  SELECT id INTO v_existing_profile_id
  FROM public.profiles
  WHERE email = NEW.email;
  
  IF v_existing_profile_id IS NOT NULL THEN
    -- Profile exists - update the id to match auth.users id
    -- First, get any existing role
    SELECT role INTO v_existing_role FROM public.user_roles WHERE user_id = v_existing_profile_id;
    
    -- Delete old user_roles entry
    DELETE FROM public.user_roles WHERE user_id = v_existing_profile_id;
    
    -- Update the profile id to match the new auth.users id
    UPDATE public.profiles 
    SET id = NEW.id, 
        updated_at = now()
    WHERE id = v_existing_profile_id;
    
    -- Re-create user_roles with correct user_id
    IF v_existing_role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_existing_role);
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
    END IF;
  ELSE
    -- No pre-created profile - create new profile and role
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
      NEW.email
    );
    
    -- Default role is 'user'
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$function$;