
-- Create enum for cash advance status
CREATE TYPE public.cash_advance_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'paid',
  'partially_settled',
  'settled',
  'cancelled'
);

-- Create enum for settlement status
CREATE TYPE public.settlement_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

-- Create enum for budget ledger entry type
CREATE TYPE public.budget_ledger_type AS ENUM (
  'commitment_add',
  'commitment_release',
  'actual_add',
  'actual_release',
  'refund',
  'topup'
);

-- Create budget_ledger table for commitment/actual tracking
CREATE TABLE public.budget_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_budget_id UUID NOT NULL REFERENCES public.division_budgets(id),
  entry_type budget_ledger_type NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reference_type TEXT NOT NULL, -- 'cash_advance', 'settlement', 'request'
  reference_id UUID NOT NULL,
  description TEXT,
  performed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_advances table
CREATE TABLE public.cash_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_number TEXT NOT NULL UNIQUE,
  division_id UUID NOT NULL REFERENCES public.divisions(id),
  category_id UUID NOT NULL REFERENCES public.cost_categories(id),
  period_id UUID REFERENCES public.budget_periods(id),
  requester_id UUID NOT NULL,
  status cash_advance_status NOT NULL DEFAULT 'draft',
  purpose TEXT NOT NULL,
  total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
  needed_date DATE NOT NULL,
  notes TEXT,
  
  -- Approval fields
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  approval_note TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,
  
  -- Payment fields
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  funding_source_id UUID REFERENCES public.funding_sources(id),
  
  -- Settlement summary
  total_realized NUMERIC DEFAULT 0,
  settled_at TIMESTAMPTZ,
  settled_by UUID,
  
  -- Locking
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_advance_items table
CREATE TABLE public.cash_advance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_advance_id UUID NOT NULL REFERENCES public.cash_advances(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_advance_settlements table
CREATE TABLE public.cash_advance_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number TEXT NOT NULL UNIQUE,
  cash_advance_id UUID NOT NULL REFERENCES public.cash_advances(id),
  status settlement_status NOT NULL DEFAULT 'draft',
  total_realized NUMERIC NOT NULL DEFAULT 0,
  variance_amount NUMERIC NOT NULL DEFAULT 0, -- positive = refund needed, negative = topup needed
  notes TEXT,
  
  -- Approval
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  approval_note TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_advance_settlement_items table
CREATE TABLE public.cash_advance_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.cash_advance_settlements(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  receipt_number TEXT,
  receipt_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_advance_events table for timeline/audit
CREATE TABLE public.cash_advance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_advance_id UUID NOT NULL REFERENCES public.cash_advances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  performed_by UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.budget_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advance_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advance_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_advance_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for budget_ledger
CREATE POLICY "Super admins can manage budget ledger"
  ON public.budget_ledger FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can view budget ledger"
  ON public.budget_ledger FOR SELECT
  USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Users can view their division budget ledger"
  ON public.budget_ledger FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM division_budgets db
    WHERE db.id = budget_ledger.division_budget_id
    AND can_access_division(auth.uid(), db.division_id)
  ));

CREATE POLICY "session_must_be_valid" ON public.budget_ledger FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- RLS Policies for cash_advances
CREATE POLICY "Super admins can manage all cash advances"
  ON public.cash_advances FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can view all cash advances"
  ON public.cash_advances FOR SELECT
  USING (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update payment status"
  ON public.cash_advances FOR UPDATE
  USING (has_role(auth.uid(), 'finance'::app_role) AND status = 'approved'::cash_advance_status)
  WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Users can view cash advances in their division"
  ON public.cash_advances FOR SELECT
  USING (can_access_division(auth.uid(), division_id));

CREATE POLICY "Users can create cash advances in their division"
  ON public.cash_advances FOR INSERT
  WITH CHECK (requester_id = auth.uid() AND division_id = get_user_division_id(auth.uid()));

CREATE POLICY "Users can update their own draft cash advances"
  ON public.cash_advances FOR UPDATE
  USING (requester_id = auth.uid() AND status = 'draft'::cash_advance_status AND is_locked = false)
  WITH CHECK (requester_id = auth.uid() AND status = 'draft'::cash_advance_status AND is_locked = false);

CREATE POLICY "session_must_be_valid" ON public.cash_advances FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- RLS Policies for cash_advance_items
CREATE POLICY "Super admins can manage all CA items"
  ON public.cash_advance_items FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view CA items for accessible CAs"
  ON public.cash_advance_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_advances ca
    WHERE ca.id = cash_advance_items.cash_advance_id
    AND can_access_division(auth.uid(), ca.division_id)
  ));

CREATE POLICY "Users can manage items for their draft CAs"
  ON public.cash_advance_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cash_advances ca
    WHERE ca.id = cash_advance_items.cash_advance_id
    AND ca.requester_id = auth.uid()
    AND ca.status = 'draft'::cash_advance_status
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cash_advances ca
    WHERE ca.id = cash_advance_items.cash_advance_id
    AND ca.requester_id = auth.uid()
    AND ca.status = 'draft'::cash_advance_status
  ));

CREATE POLICY "session_must_be_valid" ON public.cash_advance_items FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- RLS Policies for cash_advance_settlements
CREATE POLICY "Super admins can manage all settlements"
  ON public.cash_advance_settlements FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can manage settlements"
  ON public.cash_advance_settlements FOR ALL
  USING (has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Users can view settlements for accessible CAs"
  ON public.cash_advance_settlements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_advances ca
    WHERE ca.id = cash_advance_settlements.cash_advance_id
    AND can_access_division(auth.uid(), ca.division_id)
  ));

CREATE POLICY "Users can create settlements for their paid CAs"
  ON public.cash_advance_settlements FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM cash_advances ca
      WHERE ca.id = cash_advance_settlements.cash_advance_id
      AND ca.requester_id = auth.uid()
      AND ca.status = 'paid'::cash_advance_status
    )
  );

CREATE POLICY "session_must_be_valid" ON public.cash_advance_settlements FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- RLS Policies for cash_advance_settlement_items
CREATE POLICY "Super admins can manage all settlement items"
  ON public.cash_advance_settlement_items FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can manage settlement items"
  ON public.cash_advance_settlement_items FOR ALL
  USING (has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Users can view settlement items for accessible settlements"
  ON public.cash_advance_settlement_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_advance_settlements s
    JOIN cash_advances ca ON ca.id = s.cash_advance_id
    WHERE s.id = cash_advance_settlement_items.settlement_id
    AND can_access_division(auth.uid(), ca.division_id)
  ));

CREATE POLICY "Users can manage items for their draft settlements"
  ON public.cash_advance_settlement_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cash_advance_settlements s
    WHERE s.id = cash_advance_settlement_items.settlement_id
    AND s.created_by = auth.uid()
    AND s.status = 'draft'::settlement_status
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cash_advance_settlements s
    WHERE s.id = cash_advance_settlement_items.settlement_id
    AND s.created_by = auth.uid()
    AND s.status = 'draft'::settlement_status
  ));

CREATE POLICY "session_must_be_valid" ON public.cash_advance_settlement_items FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- RLS Policies for cash_advance_events
CREATE POLICY "Super admins can manage CA events"
  ON public.cash_advance_events FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view events for accessible CAs"
  ON public.cash_advance_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_advances ca
    WHERE ca.id = cash_advance_events.cash_advance_id
    AND can_access_division(auth.uid(), ca.division_id)
  ));

CREATE POLICY "Users can create events"
  ON public.cash_advance_events FOR INSERT
  WITH CHECK (performed_by = auth.uid());

CREATE POLICY "session_must_be_valid" ON public.cash_advance_events FOR ALL
  USING (check_session_valid()) WITH CHECK (check_session_valid());

-- Create function to generate CA number
CREATE OR REPLACE FUNCTION public.generate_ca_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  division_code TEXT;
  year_part TEXT;
  sequence_num INTEGER;
  new_number TEXT;
BEGIN
  SELECT code INTO division_code FROM public.divisions WHERE id = NEW.division_id;
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ca_number FROM '[0-9]+$') AS INTEGER)
  ), 0) + 1 INTO sequence_num
  FROM public.cash_advances
  WHERE ca_number LIKE 'CA/' || division_code || '/' || year_part || '/%';
  
  new_number := 'CA/' || division_code || '/' || year_part || '/' || LPAD(sequence_num::TEXT, 4, '0');
  NEW.ca_number := new_number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_ca_number_trigger
  BEFORE INSERT ON public.cash_advances
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ca_number();

-- Create function to generate settlement number
CREATE OR REPLACE FUNCTION public.generate_settlement_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ca_number TEXT;
  sequence_num INTEGER;
  new_number TEXT;
BEGIN
  SELECT ca.ca_number INTO ca_number FROM public.cash_advances ca WHERE ca.id = NEW.cash_advance_id;
  
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM public.cash_advance_settlements
  WHERE cash_advance_id = NEW.cash_advance_id;
  
  new_number := REPLACE(ca_number, 'CA/', 'STL/') || '-' || LPAD(sequence_num::TEXT, 2, '0');
  NEW.settlement_number := new_number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generate_settlement_number_trigger
  BEFORE INSERT ON public.cash_advance_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_settlement_number();

-- Create function to submit cash advance (adds commitment)
CREATE OR REPLACE FUNCTION public.submit_cash_advance(p_ca_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_budget division_budgets%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance is not in draft status');
  END IF;
  
  IF v_ca.requester_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get budget for period
  SELECT db.* INTO v_budget
  FROM division_budgets db
  JOIN budget_periods bp ON db.period_id = bp.id
  WHERE db.division_id = v_ca.division_id
  AND db.category_id = v_ca.category_id
  AND bp.is_active = true
  FOR UPDATE;
  
  IF v_budget IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active budget found for this category');
  END IF;
  
  -- Update CA status
  UPDATE cash_advances
  SET status = 'submitted',
      submitted_at = NOW(),
      period_id = v_budget.period_id,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  -- Create commitment entry in budget_ledger
  INSERT INTO budget_ledger (
    division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
  ) VALUES (
    v_budget.id, 'commitment_add', v_ca.total_amount, 'cash_advance', p_ca_id,
    'Commitment for CA ' || v_ca.ca_number, v_user_id
  );
  
  -- Log event
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by)
  VALUES (p_ca_id, 'submitted', 'Cash advance submitted', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance submitted');
END;
$$;

-- Create function to approve cash advance
CREATE OR REPLACE FUNCTION public.approve_cash_advance(p_ca_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super admin can approve');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status NOT IN ('submitted', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance cannot be approved in current status');
  END IF;
  
  UPDATE cash_advances
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = v_user_id,
      approval_note = p_note,
      is_locked = true,
      locked_at = NOW(),
      locked_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'approved', 'Cash advance approved', v_user_id, jsonb_build_object('note', p_note));
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance approved');
END;
$$;

-- Create function to reject cash advance
CREATE OR REPLACE FUNCTION public.reject_cash_advance(p_ca_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_budget division_budgets%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super admin can reject');
  END IF;
  
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason required (min 10 characters)');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status NOT IN ('submitted', 'under_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance cannot be rejected in current status');
  END IF;
  
  -- Get budget to release commitment
  SELECT db.* INTO v_budget
  FROM division_budgets db
  WHERE db.id = (
    SELECT division_budget_id FROM budget_ledger
    WHERE reference_type = 'cash_advance' AND reference_id = p_ca_id
    AND entry_type = 'commitment_add'
    LIMIT 1
  );
  
  -- Release commitment
  IF v_budget IS NOT NULL THEN
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
    ) VALUES (
      v_budget.id, 'commitment_release', v_ca.total_amount, 'cash_advance', p_ca_id,
      'Commitment released for rejected CA ' || v_ca.ca_number, v_user_id
    );
  END IF;
  
  UPDATE cash_advances
  SET status = 'rejected',
      rejected_at = NOW(),
      rejected_by = v_user_id,
      rejection_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'rejected', 'Cash advance rejected', v_user_id, jsonb_build_object('reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'message', 'Cash advance rejected');
END;
$$;

-- Create function to pay cash advance
CREATE OR REPLACE FUNCTION public.pay_cash_advance(p_ca_id UUID, p_funding_source_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ca cash_advances%ROWTYPE;
  v_funding funding_sources%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance or super admin can process payment');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = p_ca_id FOR UPDATE;
  
  IF v_ca IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance not found');
  END IF;
  
  IF v_ca.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash advance must be approved first');
  END IF;
  
  SELECT * INTO v_funding FROM funding_sources WHERE id = p_funding_source_id FOR UPDATE;
  
  IF v_funding IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;
  
  IF v_funding.balance < v_ca.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;
  
  -- Deduct from funding source
  UPDATE funding_sources
  SET balance = balance - v_ca.total_amount, updated_at = NOW()
  WHERE id = p_funding_source_id;
  
  -- Record petty cash transaction if applicable
  IF v_funding.type = 'petty_cash' THEN
    INSERT INTO petty_cash_transactions (
      funding_source_id, transaction_type, amount, balance_before, balance_after,
      performed_by, description
    ) VALUES (
      p_funding_source_id, 'out', v_ca.total_amount, v_funding.balance,
      v_funding.balance - v_ca.total_amount, v_user_id, 'Cash advance payment: ' || v_ca.ca_number
    );
  END IF;
  
  UPDATE cash_advances
  SET status = 'paid',
      paid_at = NOW(),
      paid_by = v_user_id,
      funding_source_id = p_funding_source_id,
      updated_at = NOW()
  WHERE id = p_ca_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (p_ca_id, 'paid', 'Payment processed', v_user_id, jsonb_build_object('funding_source', v_funding.name));
  
  RETURN jsonb_build_object('success', true, 'message', 'Payment processed');
END;
$$;

-- Create function to approve settlement (releases commitment, adds actual)
CREATE OR REPLACE FUNCTION public.approve_settlement(p_settlement_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement cash_advance_settlements%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_budget_id UUID;
  v_user_id UUID;
  v_variance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT (has_role(v_user_id, 'finance') OR has_role(v_user_id, 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only finance or super admin can approve settlements');
  END IF;
  
  SELECT * INTO v_settlement FROM cash_advance_settlements WHERE id = p_settlement_id FOR UPDATE;
  
  IF v_settlement IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found');
  END IF;
  
  IF v_settlement.status != 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is not in submitted status');
  END IF;
  
  SELECT * INTO v_ca FROM cash_advances WHERE id = v_settlement.cash_advance_id FOR UPDATE;
  
  -- Get budget ID from original commitment
  SELECT division_budget_id INTO v_budget_id
  FROM budget_ledger
  WHERE reference_type = 'cash_advance' AND reference_id = v_ca.id
  AND entry_type = 'commitment_add'
  LIMIT 1;
  
  -- Release commitment
  INSERT INTO budget_ledger (
    division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
  ) VALUES (
    v_budget_id, 'commitment_release', v_ca.total_amount, 'settlement', p_settlement_id,
    'Commitment released for settlement ' || v_settlement.settlement_number, v_user_id
  );
  
  -- Add actual
  INSERT INTO budget_ledger (
    division_budget_id, entry_type, amount, reference_type, reference_id, description, performed_by
  ) VALUES (
    v_budget_id, 'actual_add', v_settlement.total_realized, 'settlement', p_settlement_id,
    'Actual expense for settlement ' || v_settlement.settlement_number, v_user_id
  );
  
  -- Calculate variance
  v_variance := v_ca.total_amount - v_settlement.total_realized;
  
  -- Update settlement
  UPDATE cash_advance_settlements
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = v_user_id,
      approval_note = p_note,
      variance_amount = v_variance,
      updated_at = NOW()
  WHERE id = p_settlement_id;
  
  -- Update CA
  UPDATE cash_advances
  SET status = 'settled',
      total_realized = v_settlement.total_realized,
      settled_at = NOW(),
      settled_by = v_user_id,
      updated_at = NOW()
  WHERE id = v_ca.id;
  
  -- Update budget used_amount with actual
  UPDATE division_budgets
  SET used_amount = used_amount + v_settlement.total_realized,
      updated_at = NOW()
  WHERE id = v_budget_id;
  
  INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
  VALUES (v_ca.id, 'settled', 'Cash advance settled', v_user_id, 
    jsonb_build_object('settlement_id', p_settlement_id, 'realized', v_settlement.total_realized, 'variance', v_variance));
  
  RETURN jsonb_build_object('success', true, 'message', 'Settlement approved', 'variance', v_variance);
END;
$$;

-- Create indexes for performance
CREATE INDEX idx_cash_advances_division ON public.cash_advances(division_id);
CREATE INDEX idx_cash_advances_requester ON public.cash_advances(requester_id);
CREATE INDEX idx_cash_advances_status ON public.cash_advances(status);
CREATE INDEX idx_budget_ledger_division_budget ON public.budget_ledger(division_budget_id);
CREATE INDEX idx_budget_ledger_reference ON public.budget_ledger(reference_type, reference_id);
CREATE INDEX idx_settlements_ca ON public.cash_advance_settlements(cash_advance_id);

-- Add updated_at triggers
CREATE TRIGGER update_cash_advances_updated_at
  BEFORE UPDATE ON public.cash_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settlements_updated_at
  BEFORE UPDATE ON public.cash_advance_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
