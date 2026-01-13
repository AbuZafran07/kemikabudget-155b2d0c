-- Create super admin user ferry@kemika.co.id using DO block for transaction

DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    aud,
    role
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'ferry@kemika.co.id',
    crypt('123456', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Ferry Kemika"}',
    now(),
    now(),
    '',
    'authenticated',
    'authenticated'
  );

  -- Check if profile was auto-created by trigger, if not create it
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_user_id) THEN
    INSERT INTO public.profiles (id, email, full_name, division_id, is_active, requires_otp)
    VALUES (
      new_user_id,
      'ferry@kemika.co.id',
      'Ferry Kemika',
      '461d7c03-8f42-4ae6-890f-04f756025363',
      true,
      true
    );
  ELSE
    UPDATE public.profiles 
    SET full_name = 'Ferry Kemika',
        division_id = '461d7c03-8f42-4ae6-890f-04f756025363',
        is_active = true,
        requires_otp = true
    WHERE id = new_user_id;
  END IF;

  -- Insert role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Insert OTP secret using hex encoding instead of base32
  INSERT INTO public.otp_secrets (user_id, secret)
  VALUES (new_user_id, encode(gen_random_bytes(20), 'hex'))
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Super admin user created with ID: %', new_user_id;
END $$;