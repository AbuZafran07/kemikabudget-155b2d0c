-- Generate new RFC 6238 compliant OTP secrets for all Super Admins
-- This ensures compatibility with the new HMAC-SHA1 TOTP implementation

DO $$
DECLARE
    v_super_admin RECORD;
    v_new_secret TEXT;
    v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_bytes BYTEA;
    v_bits TEXT;
    v_byte INT;
    v_i INT;
BEGIN
    -- Loop through all super_admin users
    FOR v_super_admin IN 
        SELECT p.id, p.email
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role = 'super_admin' AND p.requires_otp = true
    LOOP
        -- Generate cryptographically secure random bytes (20 bytes = 160 bits for HMAC-SHA1)
        v_bytes := gen_random_bytes(20);
        
        -- Convert to base32
        v_new_secret := '';
        v_bits := '';
        
        -- Convert bytes to binary string
        FOR v_i IN 0..19 LOOP
            v_byte := get_byte(v_bytes, v_i);
            v_bits := v_bits || lpad(v_byte::BIT(8)::TEXT, 8, '0');
        END LOOP;
        
        -- Convert binary to base32 (5 bits per character)
        FOR v_i IN 0..(length(v_bits) / 5 - 1) LOOP
            v_new_secret := v_new_secret || 
                substr(v_alphabet, 1 + (substring(v_bits FROM (v_i * 5 + 1) FOR 5)::BIT(5)::INT), 1);
        END LOOP;
        
        -- Upsert to otp_secrets table
        INSERT INTO public.otp_secrets (user_id, secret, updated_at)
        VALUES (v_super_admin.id, v_new_secret, now())
        ON CONFLICT (user_id) 
        DO UPDATE SET secret = v_new_secret, updated_at = now();
        
        -- Also update profiles.otp_secret for backward compatibility
        UPDATE public.profiles
        SET otp_secret = v_new_secret, updated_at = now()
        WHERE id = v_super_admin.id;
        
        -- Log the regeneration in audit logs
        INSERT INTO public.audit_logs (
            user_id,
            entity_type,
            entity_id,
            event_type,
            description,
            metadata
        ) VALUES (
            v_super_admin.id,
            'user',
            v_super_admin.id,
            'otp_secret_regenerated',
            'OTP secret regenerated for RFC 6238 compliance',
            jsonb_build_object(
                'email', v_super_admin.email,
                'algorithm', 'HMAC-SHA1',
                'digits', 6,
                'period', 30,
                'regenerated_by', 'system_migration'
            )
        );
        
        RAISE NOTICE 'Regenerated OTP secret for Super Admin: %', v_super_admin.email;
    END LOOP;
END $$;

-- Add comment for documentation
COMMENT ON TABLE public.otp_secrets IS 'RFC 6238 compliant OTP secrets for TOTP authentication. Secrets are Base32 encoded, 160-bit for HMAC-SHA1.';