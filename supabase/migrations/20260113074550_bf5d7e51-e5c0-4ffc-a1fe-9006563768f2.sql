-- Create budget_transfers table for transfer requests between categories
CREATE TABLE public.budget_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_number TEXT NOT NULL UNIQUE,
  division_id UUID NOT NULL REFERENCES public.divisions(id),
  from_budget_id UUID NOT NULL REFERENCES public.division_budgets(id),
  to_budget_id UUID NOT NULL REFERENCES public.division_budgets(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  requester_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for budget_transfers (correct argument order: has_role(uuid, app_role), can_access_division(uuid, uuid))
CREATE POLICY "Users can view their division transfers"
  ON public.budget_transfers FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'finance'::app_role) OR
    public.can_access_division(auth.uid(), division_id)
  );

CREATE POLICY "Admins can create transfers for their division"
  ON public.budget_transfers FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    (public.has_role(auth.uid(), 'admin'::app_role) AND public.can_access_division(auth.uid(), division_id))
  );

CREATE POLICY "Only super_admin can update transfers"
  ON public.budget_transfers FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Function to generate transfer number
CREATE OR REPLACE FUNCTION public.generate_transfer_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transfer_number FROM 'TRF-' || year_part || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM public.budget_transfers
  WHERE transfer_number LIKE 'TRF-' || year_part || '-%';
  
  NEW.transfer_number := 'TRF-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_transfer_number
  BEFORE INSERT ON public.budget_transfers
  FOR EACH ROW
  WHEN (NEW.transfer_number IS NULL OR NEW.transfer_number = '')
  EXECUTE FUNCTION public.generate_transfer_number();

-- Function to approve budget transfer (with transaction)
CREATE OR REPLACE FUNCTION public.approve_budget_transfer(
  p_transfer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_from_budget RECORD;
  v_to_budget RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is super_admin
  IF NOT public.has_role(v_user_id, 'super_admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'Only super admin can approve transfers');
  END IF;
  
  -- Get and lock the transfer
  SELECT * INTO v_transfer
  FROM budget_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;
  
  IF v_transfer IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  IF v_transfer.status != 'submitted' THEN
    RETURN json_build_object('success', false, 'error', 'Transfer is not in submitted status');
  END IF;
  
  -- Get and lock from_budget
  SELECT * INTO v_from_budget
  FROM division_budgets
  WHERE id = v_transfer.from_budget_id
  FOR UPDATE;
  
  -- Get and lock to_budget
  SELECT * INTO v_to_budget
  FROM division_budgets
  WHERE id = v_transfer.to_budget_id
  FOR UPDATE;
  
  -- Check sufficient budget
  IF (v_from_budget.allocated_amount - v_from_budget.used_amount) < v_transfer.amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient remaining budget in source category');
  END IF;
  
  -- Deduct from source budget
  UPDATE division_budgets
  SET allocated_amount = allocated_amount - v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.from_budget_id;
  
  -- Add to target budget
  UPDATE division_budgets
  SET allocated_amount = allocated_amount + v_transfer.amount,
      updated_at = NOW()
  WHERE id = v_transfer.to_budget_id;
  
  -- Record movements
  INSERT INTO budget_movements (
    division_budget_id, movement_type, amount, 
    balance_before, balance_after, 
    description, performed_by
  ) VALUES (
    v_transfer.from_budget_id, 'transfer_out', v_transfer.amount,
    v_from_budget.allocated_amount, v_from_budget.allocated_amount - v_transfer.amount,
    'Transfer to ' || v_transfer.transfer_number, v_user_id
  );
  
  INSERT INTO budget_movements (
    division_budget_id, movement_type, amount, 
    balance_before, balance_after, 
    description, performed_by
  ) VALUES (
    v_transfer.to_budget_id, 'transfer_in', v_transfer.amount,
    v_to_budget.allocated_amount, v_to_budget.allocated_amount + v_transfer.amount,
    'Transfer from ' || v_transfer.transfer_number, v_user_id
  );
  
  -- Update transfer status
  UPDATE budget_transfers
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_transfer_id;
  
  RETURN json_build_object('success', true, 'message', 'Transfer approved successfully');
END;
$$;

-- Function to reject budget transfer
CREATE OR REPLACE FUNCTION public.reject_budget_transfer(
  p_transfer_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT public.has_role(v_user_id, 'super_admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'Only super admin can reject transfers');
  END IF;
  
  SELECT * INTO v_transfer
  FROM budget_transfers
  WHERE id = p_transfer_id;
  
  IF v_transfer IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  IF v_transfer.status != 'submitted' THEN
    RETURN json_build_object('success', false, 'error', 'Transfer is not in submitted status');
  END IF;
  
  UPDATE budget_transfers
  SET status = 'rejected',
      rejected_at = NOW(),
      rejected_by = v_user_id,
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
  WHERE id = p_transfer_id;
  
  RETURN json_build_object('success', true, 'message', 'Transfer rejected');
END;
$$;