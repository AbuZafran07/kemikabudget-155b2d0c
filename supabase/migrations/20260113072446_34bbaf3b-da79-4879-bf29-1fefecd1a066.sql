-- Add budget_movements table for tracking budget changes
CREATE TABLE IF NOT EXISTS public.budget_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  division_budget_id UUID NOT NULL REFERENCES public.division_budgets(id),
  request_id UUID REFERENCES public.requests(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('allocation', 'deduction', 'transfer_in', 'transfer_out', 'adjustment')),
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  description TEXT,
  performed_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage budget movements"
  ON public.budget_movements
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can view budget movements"
  ON public.budget_movements
  FOR SELECT
  USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Users can view their division budget movements"
  ON public.budget_movements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM division_budgets db
      WHERE db.id = budget_movements.division_budget_id
      AND can_access_division(auth.uid(), db.division_id)
    )
  );

-- Function to approve request with budget deduction (TRANSACTION)
CREATE OR REPLACE FUNCTION public.approve_request(
  p_request_id UUID,
  p_approval_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_budget RECORD;
  v_new_used NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- Check if user is super_admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Super Admin can approve requests');
  END IF;

  -- Get request details
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be submitted or under review to approve');
  END IF;

  -- Check if amount > 50M requires note
  IF v_request.amount > 50000000 AND (p_approval_note IS NULL OR p_approval_note = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approval note is required for amounts exceeding 50,000,000 IDR');
  END IF;

  -- Get division budget for this category and period
  SELECT * INTO v_budget 
  FROM division_budgets 
  WHERE division_id = v_request.division_id 
    AND category_id = v_request.category_id
    AND period_id = v_request.period_id
  FOR UPDATE;
  
  IF v_budget IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No budget allocated for this division and category');
  END IF;

  -- Check remaining budget
  v_remaining := v_budget.allocated_amount - v_budget.used_amount;
  IF v_remaining < v_request.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient budget. Remaining: ' || v_remaining::TEXT || ' IDR');
  END IF;

  -- Calculate new used amount
  v_new_used := v_budget.used_amount + v_request.amount;

  -- Update division budget (DEDUCT BUDGET)
  UPDATE division_budgets 
  SET used_amount = v_new_used,
      updated_at = now()
  WHERE id = v_budget.id;

  -- Record budget movement
  INSERT INTO budget_movements (
    division_budget_id,
    request_id,
    movement_type,
    amount,
    balance_before,
    balance_after,
    description,
    performed_by
  ) VALUES (
    v_budget.id,
    p_request_id,
    'deduction',
    v_request.amount,
    v_budget.allocated_amount - v_budget.used_amount,
    v_budget.allocated_amount - v_new_used,
    COALESCE(p_approval_note, 'Budget deducted for request ' || v_request.request_number),
    auth.uid()
  );

  -- Update request status to approved
  UPDATE requests 
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid()
  WHERE id = p_request_id;

  -- Log event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (
    p_request_id,
    'approved',
    'Request approved' || CASE WHEN p_approval_note IS NOT NULL THEN ': ' || p_approval_note ELSE '' END,
    auth.uid(),
    jsonb_build_object('amount', v_request.amount, 'budget_remaining', v_budget.allocated_amount - v_new_used)
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request approved successfully',
    'budget_remaining', v_budget.allocated_amount - v_new_used
  );
END;
$$;

-- Function to reject request
CREATE OR REPLACE FUNCTION public.reject_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Check if user is super_admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Super Admin can reject requests');
  END IF;

  IF p_rejection_reason IS NULL OR p_rejection_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  -- Get request details
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'submitted' AND v_request.status != 'under_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be submitted or under review to reject');
  END IF;

  -- Update request status to rejected
  UPDATE requests 
  SET status = 'rejected',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = p_rejection_reason,
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid()
  WHERE id = p_request_id;

  -- Log event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (
    p_request_id,
    'rejected',
    'Request rejected: ' || p_rejection_reason,
    auth.uid(),
    jsonb_build_object('reason', p_rejection_reason)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Request rejected');
END;
$$;

-- Function to pay request (CASH DEDUCTION)
CREATE OR REPLACE FUNCTION public.pay_request(
  p_request_id UUID,
  p_payment_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_funding RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Check if user is super_admin or finance
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Super Admin or Finance can process payments');
  END IF;

  -- Get request details
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be approved before payment');
  END IF;

  IF v_request.funding_source_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No funding source specified for this request');
  END IF;

  -- Get funding source
  SELECT * INTO v_funding FROM funding_sources WHERE id = v_request.funding_source_id FOR UPDATE;
  
  IF v_funding IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;

  -- Check balance
  IF v_funding.balance < v_request.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds. Available: ' || v_funding.balance::TEXT || ' IDR');
  END IF;

  -- Calculate new balance
  v_new_balance := v_funding.balance - v_request.amount;

  -- Deduct from funding source (CASH DEDUCTION)
  UPDATE funding_sources 
  SET balance = v_new_balance,
      updated_at = now()
  WHERE id = v_funding.id;

  -- Update request status to paid
  UPDATE requests 
  SET status = 'paid',
      paid_at = now(),
      paid_by = auth.uid()
  WHERE id = p_request_id;

  -- Log event
  INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
  VALUES (
    p_request_id,
    'paid',
    'Payment processed via ' || v_funding.name || CASE WHEN p_payment_note IS NOT NULL THEN ': ' || p_payment_note ELSE '' END,
    auth.uid(),
    jsonb_build_object('funding_source', v_funding.name, 'amount', v_request.amount, 'balance_after', v_new_balance)
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Payment processed successfully',
    'funding_balance', v_new_balance
  );
END;
$$;

-- Function to settle request
CREATE OR REPLACE FUNCTION public.settle_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Check if user is super_admin or finance
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Super Admin or Finance can settle requests');
  END IF;

  -- Get request details
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be paid before settling');
  END IF;

  -- Update request status to settled
  UPDATE requests 
  SET status = 'settled',
      settled_at = now(),
      settled_by = auth.uid()
  WHERE id = p_request_id;

  -- Log event
  INSERT INTO request_events (request_id, event_type, description, performed_by)
  VALUES (
    p_request_id,
    'settled',
    'Request settled and completed',
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'message', 'Request settled successfully');
END;
$$;

-- Function to create user with role (for User Management)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_full_name TEXT,
  p_division_id UUID,
  p_role app_role,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if user is super_admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Super Admin can create users');
  END IF;

  -- Generate a random UUID for the new user
  v_user_id := gen_random_uuid();

  -- Create profile
  INSERT INTO profiles (id, email, full_name, division_id, phone, requires_otp)
  VALUES (
    v_user_id,
    p_email,
    p_full_name,
    p_division_id,
    p_phone,
    CASE WHEN p_role = 'super_admin' THEN true ELSE false END
  );

  -- Assign role
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role);

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User created successfully. They need to sign up with this email.',
    'user_id', v_user_id
  );
END;
$$;

-- Allow super_admin to insert profiles
CREATE POLICY "Super admins can create profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));