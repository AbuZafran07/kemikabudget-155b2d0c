-- =====================================================
-- Security Hardening Migration
-- Fix: Session revocation enforcement, input validation, 
-- and remove financial details from error messages
-- =====================================================

-- 1. Create session validation function for RLS policies
CREATE OR REPLACE FUNCTION public.check_session_valid()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user has any revoked sessions that are still within the JWT window
  -- If a session was revoked, block access at database level as defense in depth
  RETURN NOT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = auth.uid()
    AND is_revoked = true
    AND last_active_at > NOW() - INTERVAL '1 hour'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 2. Update approve_request function to remove financial details from errors
CREATE OR REPLACE FUNCTION public.approve_request(p_request_id UUID, p_approval_note TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_budget RECORD;
  v_remaining NUMERIC;
  v_user_id UUID;
  v_safe_note TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate and sanitize approval note
  IF p_approval_note IS NOT NULL THEN
    IF LENGTH(p_approval_note) > 1000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Note too long (max 1000 characters)');
    END IF;
    v_safe_note := LEFT(TRIM(p_approval_note), 1000);
  ELSE
    v_safe_note := NULL;
  END IF;
  
  -- Check if user has super_admin role
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can approve requests');
  END IF;
  
  -- Lock and get the request
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request cannot be approved in current status');
  END IF;
  
  -- Check if request amount > 50M requires note and attachments
  IF v_request.amount > 50000000 THEN
    IF v_safe_note IS NULL OR LENGTH(v_safe_note) < 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requests over IDR 50,000,000 require approval notes');
    END IF;
    
    -- Check for invoice or quotation attachment
    IF NOT EXISTS (
      SELECT 1 FROM request_attachments 
      WHERE request_id = p_request_id 
      AND attachment_type IN ('invoice', 'quotation')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requests over IDR 50,000,000 require invoice or quotation attachment');
    END IF;
  END IF;
  
  -- Get budget for this request
  SELECT db.* INTO v_budget
  FROM division_budgets db
  JOIN budget_periods bp ON db.period_id = bp.id
  WHERE db.division_id = v_request.division_id
  AND db.category_id = v_request.category_id
  AND bp.is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active budget found for this category');
  END IF;
  
  v_remaining := v_budget.allocated_amount - v_budget.used_amount;
  
  IF v_remaining < v_request.amount THEN
    -- Generic error without revealing exact budget amount
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget for this request');
  END IF;
  
  -- Update budget
  UPDATE division_budgets 
  SET used_amount = used_amount + v_request.amount,
      updated_at = NOW()
  WHERE id = v_budget.id;
  
  -- Record budget movement
  INSERT INTO budget_movements (
    division_budget_id, request_id, movement_type, amount,
    balance_before, balance_after, performed_by, description
  ) VALUES (
    v_budget.id, p_request_id, 'deduct', v_request.amount,
    v_remaining, v_remaining - v_request.amount, v_user_id,
    'Approved request ' || v_request.request_number
  );
  
  -- Update request
  UPDATE requests SET
    status = 'approved',
    approved_at = NOW(),
    approved_by = v_user_id,
    period_id = v_budget.period_id,
    is_locked = true,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  -- Record event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (p_request_id, 'approved', 'Request approved', v_user_id, 
    jsonb_build_object('note', v_safe_note));
  
  RETURN jsonb_build_object('success', true, 'message', 'Request approved successfully');
END;
$$;

-- 3. Update reject_request function with input validation
CREATE OR REPLACE FUNCTION public.reject_request(p_request_id UUID, p_rejection_reason TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_user_id UUID;
  v_safe_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required (min 10 characters)');
  END IF;
  
  IF LENGTH(p_rejection_reason) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason too long (max 1000 characters)');
  END IF;
  
  v_safe_reason := LEFT(TRIM(p_rejection_reason), 1000);
  
  -- Check if user has super_admin role
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can reject requests');
  END IF;
  
  -- Lock and get the request
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request cannot be rejected in current status');
  END IF;
  
  -- Update request
  UPDATE requests SET
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = v_user_id,
    rejection_reason = v_safe_reason,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  -- Record event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (p_request_id, 'rejected', 'Request rejected', v_user_id, 
    jsonb_build_object('reason', v_safe_reason));
  
  RETURN jsonb_build_object('success', true, 'message', 'Request rejected');
END;
$$;

-- 4. Update pay_request function to remove financial details from errors
CREATE OR REPLACE FUNCTION public.pay_request(p_request_id UUID, p_payment_note TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_funding funding_sources%ROWTYPE;
  v_user_id UUID;
  v_safe_note TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate and sanitize payment note
  IF p_payment_note IS NOT NULL THEN
    IF LENGTH(p_payment_note) > 1000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Note too long (max 1000 characters)');
    END IF;
    v_safe_note := LEFT(TRIM(p_payment_note), 1000);
  ELSE
    v_safe_note := NULL;
  END IF;
  
  -- Check if user has finance or super_admin role
  IF NOT has_role(v_user_id, 'finance') AND NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance or super_admin can process payments');
  END IF;
  
  -- Lock and get the request
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved requests can be paid');
  END IF;
  
  -- Get funding source
  IF v_request.funding_source_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No funding source specified');
  END IF;
  
  SELECT * INTO v_funding FROM funding_sources WHERE id = v_request.funding_source_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;
  
  IF v_funding.balance < v_request.amount THEN
    -- Generic error without revealing exact balance
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds available');
  END IF;
  
  -- Deduct from funding source
  UPDATE funding_sources SET
    balance = balance - v_request.amount,
    updated_at = NOW()
  WHERE id = v_funding.id;
  
  -- If petty cash, record transaction
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (
      funding_source_id, request_id, transaction_type, amount,
      balance_before, balance_after, performed_by, description
    ) VALUES (
      v_funding.id, p_request_id, 'out', v_request.amount,
      v_funding.balance, v_funding.balance - v_request.amount, v_user_id,
      'Payment for ' || v_request.request_number
    );
  END IF;
  
  -- Update request
  UPDATE requests SET
    status = 'paid',
    paid_at = NOW(),
    paid_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  -- Record event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (p_request_id, 'paid', 'Payment processed', v_user_id,
    jsonb_build_object('funding_source', v_funding.name, 'note', v_safe_note));
  
  RETURN jsonb_build_object('success', true, 'message', 'Payment processed successfully');
END;
$$;

-- 5. Update admin_create_user function with email validation
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_full_name TEXT,
  p_division_id UUID,
  p_role app_role,
  p_phone TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Remove non-numeric characters except + for country code
    v_safe_phone := regexp_replace(v_safe_phone, '[^0-9+]', '', 'g');
  ELSE
    v_safe_phone := NULL;
  END IF;
  
  -- Validate division exists
  IF NOT EXISTS (SELECT 1 FROM divisions WHERE id = p_division_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive division');
  END IF;
  
  -- Check if email already exists
  IF EXISTS (SELECT 1 FROM profiles WHERE email = v_safe_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User with this email already exists');
  END IF;
  
  -- Generate a UUID for the new user (they will complete signup later)
  v_user_id := gen_random_uuid();
  
  -- Create profile (user will complete auth signup separately)
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
    'message', 'User created successfully. They need to sign up with this email.'
  );
END;
$$;

-- 6. Add session validation to critical RLS policies for requests table
-- Drop existing policies first
DROP POLICY IF EXISTS "Session validated requests access" ON requests;

-- Create a policy that checks session validity for request modifications
CREATE POLICY "Session validated request modifications"
  ON requests
  FOR UPDATE
  USING (
    check_session_valid() AND (
      has_role(auth.uid(), 'super_admin') OR
      has_role(auth.uid(), 'finance') OR
      (requester_id = auth.uid() AND status = 'draft' AND is_locked = false)
    )
  )
  WITH CHECK (
    check_session_valid() AND (
      has_role(auth.uid(), 'super_admin') OR
      has_role(auth.uid(), 'finance') OR
      (requester_id = auth.uid() AND status = 'draft' AND is_locked = false)
    )
  );

-- 7. Add text length constraints to relevant tables (as database-level protection)
-- These are advisory and won't break existing data
DO $$
BEGIN
  -- Add check constraint for request description length if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'requests_description_length_check'
  ) THEN
    ALTER TABLE requests ADD CONSTRAINT requests_description_length_check 
      CHECK (LENGTH(description) <= 500);
  END IF;
  
  -- Add check constraint for request notes length if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'requests_notes_length_check'
  ) THEN
    ALTER TABLE requests ADD CONSTRAINT requests_notes_length_check 
      CHECK (notes IS NULL OR LENGTH(notes) <= 2000);
  END IF;
EXCEPTION
  WHEN others THEN
    -- Ignore errors if constraints can't be added (e.g., existing data too long)
    NULL;
END $$;

-- Grant execute on new function
GRANT EXECUTE ON FUNCTION public.check_session_valid() TO authenticated;