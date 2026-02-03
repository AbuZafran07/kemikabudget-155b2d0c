-- Create enum for medical claim status
CREATE TYPE public.medical_claim_status AS ENUM (
  'draft',
  'submitted',
  'review_hrga',
  'review_finance',
  'approved',
  'rejected',
  'paid',
  'closed',
  'cancelled'
);

-- Create enum for medical ledger entry types
CREATE TYPE public.medical_ledger_type AS ENUM (
  'commitment_add',
  'commitment_release',
  'actual_add',
  'adjustment'
);

-- Employee Medical Budgets table
CREATE TABLE public.employee_medical_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_entitlement NUMERIC NOT NULL DEFAULT 0,
  used_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC GENERATED ALWAYS AS (total_entitlement - used_amount) STORED,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year)
);

-- Medical Claims table
CREATE TABLE public.medical_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id),
  medical_budget_id UUID REFERENCES public.employee_medical_budgets(id),
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  treatment_date DATE NOT NULL,
  claim_amount NUMERIC NOT NULL,
  approved_amount NUMERIC,
  claim_type TEXT NOT NULL, -- 'outpatient', 'inpatient', 'dental', 'optical', 'maternity', 'other'
  patient_name TEXT NOT NULL,
  patient_relationship TEXT NOT NULL, -- 'self', 'spouse', 'child'
  diagnosis TEXT,
  hospital_clinic TEXT,
  doctor_name TEXT,
  notes TEXT,
  status medical_claim_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_hrga_at TIMESTAMPTZ,
  reviewed_hrga_by UUID,
  reviewed_finance_at TIMESTAMPTZ,
  reviewed_finance_by UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medical Claim Attachments
CREATE TABLE public.medical_claim_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.medical_claims(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  attachment_type TEXT NOT NULL, -- 'receipt', 'prescription', 'referral', 'medical_report', 'other'
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medical Claim Events (timeline)
CREATE TABLE public.medical_claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.medical_claims(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medical Ledger
CREATE TABLE public.medical_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_medical_budget_id UUID NOT NULL REFERENCES public.employee_medical_budgets(id),
  claim_id UUID REFERENCES public.medical_claims(id),
  entry_type medical_ledger_type NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  performed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.employee_medical_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_claim_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_claim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_medical_budgets
CREATE POLICY "Users can view their own medical budget"
ON public.employee_medical_budgets FOR SELECT
USING (employee_id = auth.uid());

CREATE POLICY "HRGA can view all medical budgets"
ON public.employee_medical_budgets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view all medical budgets"
ON public.employee_medical_budgets FOR SELECT
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Super admins can manage all medical budgets"
ON public.employee_medical_budgets FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid_medical_budgets"
ON public.employee_medical_budgets FOR ALL
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- RLS Policies for medical_claims
CREATE POLICY "Users can view their own claims"
ON public.medical_claims FOR SELECT
USING (employee_id = auth.uid());

CREATE POLICY "Users can create their own claims"
ON public.medical_claims FOR INSERT
WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Users can update their own draft claims"
ON public.medical_claims FOR UPDATE
USING (employee_id = auth.uid() AND status = 'draft' AND is_locked = false)
WITH CHECK (employee_id = auth.uid() AND status = 'draft' AND is_locked = false);

CREATE POLICY "HRGA can view all claims"
ON public.medical_claims FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "HRGA can update claims in review_hrga status"
ON public.medical_claims FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND status = 'review_hrga')
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view all claims"
ON public.medical_claims FOR SELECT
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update claims in review_finance or approved status"
ON public.medical_claims FOR UPDATE
USING (has_role(auth.uid(), 'finance'::app_role) AND status IN ('review_finance', 'approved'))
WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Super admins can manage all claims"
ON public.medical_claims FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid_medical_claims"
ON public.medical_claims FOR ALL
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- RLS Policies for medical_claim_attachments
CREATE POLICY "Users can view attachments for their claims"
ON public.medical_claim_attachments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.medical_claims c
  WHERE c.id = claim_id AND c.employee_id = auth.uid()
));

CREATE POLICY "Users can add attachments to their draft claims"
ON public.medical_claim_attachments FOR INSERT
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.medical_claims c
  WHERE c.id = claim_id AND c.employee_id = auth.uid() AND c.status IN ('draft', 'submitted')
));

CREATE POLICY "HRGA can view all attachments"
ON public.medical_claim_attachments FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view all attachments"
ON public.medical_claim_attachments FOR SELECT
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Super admins can manage all attachments"
ON public.medical_claim_attachments FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid_medical_attachments"
ON public.medical_claim_attachments FOR ALL
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- RLS Policies for medical_claim_events
CREATE POLICY "Users can view events for their claims"
ON public.medical_claim_events FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.medical_claims c
  WHERE c.id = claim_id AND c.employee_id = auth.uid()
));

CREATE POLICY "System can insert events"
ON public.medical_claim_events FOR INSERT
WITH CHECK (performed_by = auth.uid());

CREATE POLICY "HRGA can view all events"
ON public.medical_claim_events FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view all events"
ON public.medical_claim_events FOR SELECT
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Super admins can manage all events"
ON public.medical_claim_events FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid_medical_events"
ON public.medical_claim_events FOR ALL
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- RLS Policies for medical_ledger
CREATE POLICY "Users can view their own medical ledger"
ON public.medical_ledger FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.employee_medical_budgets b
  WHERE b.id = employee_medical_budget_id AND b.employee_id = auth.uid()
));

CREATE POLICY "HRGA can view all medical ledger"
ON public.medical_ledger FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view all medical ledger"
ON public.medical_ledger FOR SELECT
USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Super admins can manage all medical ledger"
ON public.medical_ledger FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid_medical_ledger"
ON public.medical_ledger FOR ALL
USING (check_session_valid())
WITH CHECK (check_session_valid());

-- Function to get next medical claim number
CREATE OR REPLACE FUNCTION public.get_next_medical_claim_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_sequence INTEGER;
  v_claim_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(claim_number, '/', 3) AS INTEGER)
  ), 0) + 1
  INTO v_sequence
  FROM public.medical_claims
  WHERE claim_number LIKE 'MED/' || v_year || '/%';
  
  v_claim_number := 'MED/' || v_year || '/' || LPAD(v_sequence::TEXT, 4, '0');
  
  RETURN v_claim_number;
END;
$$;

-- Function to submit medical claim
CREATE OR REPLACE FUNCTION public.submit_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_budget RECORD;
  v_result JSON;
BEGIN
  -- Get the claim
  SELECT * INTO v_claim FROM public.medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.employee_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF v_claim.status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Claim is not in draft status');
  END IF;
  
  -- Get or create medical budget for current year
  SELECT * INTO v_budget 
  FROM public.employee_medical_budgets 
  WHERE employee_id = v_claim.employee_id 
    AND year = EXTRACT(YEAR FROM CURRENT_DATE);
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No medical budget found for this year');
  END IF;
  
  -- Check if claim amount exceeds remaining budget
  IF v_claim.claim_amount > v_budget.remaining_amount THEN
    RETURN json_build_object('success', false, 'error', 'Claim amount exceeds remaining medical budget');
  END IF;
  
  -- Update claim
  UPDATE public.medical_claims
  SET 
    status = 'submitted',
    submitted_at = now(),
    medical_budget_id = v_budget.id,
    updated_at = now()
  WHERE id = p_claim_id;
  
  -- Create commitment entry in medical ledger
  INSERT INTO public.medical_ledger (
    employee_medical_budget_id,
    claim_id,
    entry_type,
    amount,
    description,
    performed_by
  ) VALUES (
    v_budget.id,
    p_claim_id,
    'commitment_add',
    v_claim.claim_amount,
    'Commitment for claim ' || v_claim.claim_number,
    auth.uid()
  );
  
  -- Add event
  INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, 'submitted', 'Claim submitted for review', auth.uid());
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function for HRGA to review claim
CREATE OR REPLACE FUNCTION public.review_medical_claim_hrga(
  p_claim_id UUID,
  p_action TEXT, -- 'approve' or 'reject'
  p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  SELECT * INTO v_claim FROM public.medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.status NOT IN ('submitted', 'review_hrga') THEN
    RETURN json_build_object('success', false, 'error', 'Claim is not ready for HRGA review');
  END IF;
  
  IF p_action = 'approve' THEN
    UPDATE public.medical_claims
    SET 
      status = 'review_finance',
      reviewed_hrga_at = now(),
      reviewed_hrga_by = auth.uid(),
      updated_at = now()
    WHERE id = p_claim_id;
    
    INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'reviewed_hrga', 'HRGA approved, forwarded to Finance', auth.uid(), 
            CASE WHEN p_note IS NOT NULL THEN jsonb_build_object('note', p_note) ELSE NULL END);
  ELSE
    UPDATE public.medical_claims
    SET 
      status = 'rejected',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = p_note,
      updated_at = now()
    WHERE id = p_claim_id;
    
    -- Release commitment
    INSERT INTO public.medical_ledger (
      employee_medical_budget_id,
      claim_id,
      entry_type,
      amount,
      description,
      performed_by
    ) 
    SELECT 
      v_claim.medical_budget_id,
      p_claim_id,
      'commitment_release',
      v_claim.claim_amount,
      'Commitment released - rejected by HRGA',
      auth.uid()
    WHERE v_claim.medical_budget_id IS NOT NULL;
    
    INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'rejected', 'Rejected by HRGA: ' || COALESCE(p_note, 'No reason provided'), auth.uid(),
            jsonb_build_object('reason', p_note, 'stage', 'hrga'));
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function for Finance to review claim
CREATE OR REPLACE FUNCTION public.review_medical_claim_finance(
  p_claim_id UUID,
  p_action TEXT, -- 'approve' or 'reject'
  p_approved_amount NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
BEGIN
  IF NOT has_role(auth.uid(), 'finance') AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  SELECT * INTO v_claim FROM public.medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.status != 'review_finance' THEN
    RETURN json_build_object('success', false, 'error', 'Claim is not ready for Finance review');
  END IF;
  
  IF p_action = 'approve' THEN
    UPDATE public.medical_claims
    SET 
      status = 'approved',
      approved_amount = COALESCE(p_approved_amount, v_claim.claim_amount),
      reviewed_finance_at = now(),
      reviewed_finance_by = auth.uid(),
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
    WHERE id = p_claim_id;
    
    INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'approved', 'Approved by Finance', auth.uid(),
            jsonb_build_object('approved_amount', COALESCE(p_approved_amount, v_claim.claim_amount), 'note', p_note));
  ELSE
    UPDATE public.medical_claims
    SET 
      status = 'rejected',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason = p_note,
      updated_at = now()
    WHERE id = p_claim_id;
    
    -- Release commitment
    INSERT INTO public.medical_ledger (
      employee_medical_budget_id,
      claim_id,
      entry_type,
      amount,
      description,
      performed_by
    ) 
    SELECT 
      v_claim.medical_budget_id,
      p_claim_id,
      'commitment_release',
      v_claim.claim_amount,
      'Commitment released - rejected by Finance',
      auth.uid()
    WHERE v_claim.medical_budget_id IS NOT NULL;
    
    INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'rejected', 'Rejected by Finance: ' || COALESCE(p_note, 'No reason provided'), auth.uid(),
            jsonb_build_object('reason', p_note, 'stage', 'finance'));
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function to pay medical claim
CREATE OR REPLACE FUNCTION public.pay_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_approved_amount NUMERIC;
BEGIN
  IF NOT has_role(auth.uid(), 'finance') AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  SELECT * INTO v_claim FROM public.medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.status != 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Claim is not approved');
  END IF;
  
  v_approved_amount := COALESCE(v_claim.approved_amount, v_claim.claim_amount);
  
  -- Update claim
  UPDATE public.medical_claims
  SET 
    status = 'paid',
    paid_at = now(),
    paid_by = auth.uid(),
    updated_at = now()
  WHERE id = p_claim_id;
  
  -- Release commitment and add actual
  INSERT INTO public.medical_ledger (
    employee_medical_budget_id,
    claim_id,
    entry_type,
    amount,
    description,
    performed_by
  ) VALUES (
    v_claim.medical_budget_id,
    p_claim_id,
    'commitment_release',
    v_claim.claim_amount,
    'Commitment released on payment',
    auth.uid()
  );
  
  INSERT INTO public.medical_ledger (
    employee_medical_budget_id,
    claim_id,
    entry_type,
    amount,
    description,
    performed_by
  ) VALUES (
    v_claim.medical_budget_id,
    p_claim_id,
    'actual_add',
    v_approved_amount,
    'Payment for claim ' || v_claim.claim_number,
    auth.uid()
  );
  
  -- Update employee medical budget
  UPDATE public.employee_medical_budgets
  SET 
    used_amount = used_amount + v_approved_amount,
    updated_at = now()
  WHERE id = v_claim.medical_budget_id;
  
  INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, 'paid', 'Payment processed', auth.uid());
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function to close medical claim
CREATE OR REPLACE FUNCTION public.close_medical_claim(p_claim_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
BEGIN
  IF NOT has_role(auth.uid(), 'finance') AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  SELECT * INTO v_claim FROM public.medical_claims WHERE id = p_claim_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Claim not found');
  END IF;
  
  IF v_claim.status != 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'Claim must be paid first');
  END IF;
  
  UPDATE public.medical_claims
  SET 
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_claim_id;
  
  INSERT INTO public.medical_claim_events (claim_id, event_type, description, performed_by)
  VALUES (p_claim_id, 'closed', 'Claim closed', auth.uid());
  
  RETURN json_build_object('success', true);
END;
$$;

-- Create indexes for performance
CREATE INDEX idx_medical_claims_employee ON public.medical_claims(employee_id);
CREATE INDEX idx_medical_claims_status ON public.medical_claims(status);
CREATE INDEX idx_medical_claims_medical_budget ON public.medical_claims(medical_budget_id);
CREATE INDEX idx_medical_ledger_budget ON public.medical_ledger(employee_medical_budget_id);
CREATE INDEX idx_medical_claim_events_claim ON public.medical_claim_events(claim_id);
CREATE INDEX idx_employee_medical_budgets_employee_year ON public.employee_medical_budgets(employee_id, year);