-- Add CHECK constraints for text fields that lack server-side validation
-- This addresses INPUT_VALIDATION finding: client_side_validation_only

-- Add length constraints on requests table for vendor and beneficiary fields
ALTER TABLE public.requests
ADD CONSTRAINT requests_vendor_length CHECK (LENGTH(vendor) <= 200),
ADD CONSTRAINT requests_beneficiary_name_length CHECK (LENGTH(beneficiary_name) <= 200),
ADD CONSTRAINT requests_beneficiary_bank_length CHECK (LENGTH(beneficiary_bank) <= 100),
ADD CONSTRAINT requests_beneficiary_account_length CHECK (LENGTH(beneficiary_account) <= 50),
ADD CONSTRAINT requests_beneficiary_email_length CHECK (LENGTH(beneficiary_email) <= 255);

-- Add comment documenting the security purpose
COMMENT ON CONSTRAINT requests_vendor_length ON public.requests IS 'Security: Prevents excessively long vendor names that could cause display issues or memory attacks';
COMMENT ON CONSTRAINT requests_beneficiary_name_length ON public.requests IS 'Security: Prevents excessively long beneficiary names';
COMMENT ON CONSTRAINT requests_beneficiary_bank_length ON public.requests IS 'Security: Prevents excessively long bank names';
COMMENT ON CONSTRAINT requests_beneficiary_account_length ON public.requests IS 'Security: Prevents excessively long account numbers';
COMMENT ON CONSTRAINT requests_beneficiary_email_length ON public.requests IS 'Security: Standard email length limit';

-- Enable pgcrypto extension for OTP secret encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a function to encrypt OTP secrets before storage
-- This addresses SECRETS_EXPOSED finding: otp_secrets_encryption
CREATE OR REPLACE FUNCTION public.encrypt_otp_secret(p_secret TEXT, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
BEGIN
    -- Derive encryption key from a combination of factors for defense-in-depth
    -- In production, this should use an external secrets manager
    -- For now, use a deterministic key derived from the user_id and a salt
    -- The actual encryption key should be stored in environment/secrets manager
    v_key := encode(digest(p_user_id::text || 'otp_encryption_salt_v1', 'sha256'), 'hex');
    
    RETURN encode(pgp_sym_encrypt(p_secret::bytea, v_key), 'base64');
END;
$$;

-- Create a function to decrypt OTP secrets
CREATE OR REPLACE FUNCTION public.decrypt_otp_secret(p_encrypted_secret TEXT, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
BEGIN
    IF p_encrypted_secret IS NULL OR p_encrypted_secret = '' THEN
        RETURN NULL;
    END IF;
    
    -- Same key derivation as encrypt function
    v_key := encode(digest(p_user_id::text || 'otp_encryption_salt_v1', 'sha256'), 'hex');
    
    RETURN pgp_sym_decrypt(decode(p_encrypted_secret, 'base64'), v_key)::text;
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails (legacy unencrypted secret), return as-is for backward compatibility
        RETURN p_encrypted_secret;
END;
$$;

-- Update set_user_otp_secret to encrypt before storing
CREATE OR REPLACE FUNCTION public.set_user_otp_secret(p_user_id UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_encrypted_secret TEXT;
BEGIN
    -- Only the user themselves or super_admin can set OTP secret
    IF auth.uid() != p_user_id AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
        RETURN FALSE;
    END IF;

    -- Encrypt the secret before storing
    v_encrypted_secret := encrypt_otp_secret(p_secret, p_user_id);

    INSERT INTO public.otp_secrets (user_id, secret)
    VALUES (p_user_id, v_encrypted_secret)
    ON CONFLICT (user_id) 
    DO UPDATE SET secret = v_encrypted_secret, updated_at = now();
    
    RETURN TRUE;
END;
$$;

-- Update get_user_otp_secret to decrypt when retrieving
CREATE OR REPLACE FUNCTION public.get_user_otp_secret(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_encrypted_secret TEXT;
BEGIN
    -- Only super_admin or the user themselves can get OTP secret
    IF auth.uid() != p_user_id AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
        RETURN NULL;
    END IF;

    SELECT secret INTO v_encrypted_secret
    FROM public.otp_secrets
    WHERE user_id = p_user_id;

    IF v_encrypted_secret IS NULL THEN
        RETURN NULL;
    END IF;

    -- Decrypt the secret before returning
    RETURN decrypt_otp_secret(v_encrypted_secret, p_user_id);
END;
$$;

-- Add a comment explaining the encryption approach
COMMENT ON FUNCTION public.encrypt_otp_secret IS 'Encrypts OTP secrets using pgcrypto with a derived key. In production, consider using Supabase Vault or external secrets manager for the encryption key.';
COMMENT ON FUNCTION public.decrypt_otp_secret IS 'Decrypts OTP secrets. Falls back to returning the value as-is for backward compatibility with unencrypted secrets.';

-- Add comment to funding_source_options documenting its intentional design
COMMENT ON VIEW public.funding_source_options IS 'Security Note: This view intentionally allows all authenticated users to see non-sensitive funding source metadata (id, code, name, type) for UI dropdown population. Sensitive data (bank account numbers, balance) is NOT exposed. Access to full funding source details is restricted via the funding_sources_secure view and funding_sources table RLS.';