-- Petty Cash Transactions table
CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funding_source_id UUID NOT NULL REFERENCES public.funding_sources(id),
  request_id UUID REFERENCES public.requests(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('top_up', 'withdrawal', 'payment', 'adjustment')),
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  description TEXT,
  reference_number TEXT,
  performed_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage petty cash transactions"
  ON public.petty_cash_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can manage petty cash transactions"
  ON public.petty_cash_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- Cash Reconciliations table
CREATE TABLE IF NOT EXISTS public.cash_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funding_source_id UUID NOT NULL REFERENCES public.funding_sources(id),
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  system_balance NUMERIC NOT NULL,
  physical_balance NUMERIC NOT NULL,
  variance NUMERIC NOT NULL,
  variance_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reconciled_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can manage reconciliations"
  ON public.cash_reconciliations
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Finance can manage reconciliations"
  ON public.cash_reconciliations
  FOR ALL
  USING (has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (has_role(auth.uid(), 'finance'::app_role));

-- Function to top-up petty cash
CREATE OR REPLACE FUNCTION public.topup_petty_cash(
  p_funding_source_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funding RECORD;
  v_new_balance NUMERIC;
BEGIN
  -- Check authorization
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get funding source
  SELECT * INTO v_funding FROM funding_sources WHERE id = p_funding_source_id FOR UPDATE;
  
  IF v_funding IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;

  IF v_funding.type != 'petty_cash' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This is not a petty cash account');
  END IF;

  v_new_balance := v_funding.balance + p_amount;

  -- Update balance
  UPDATE funding_sources SET balance = v_new_balance, updated_at = now() WHERE id = p_funding_source_id;

  -- Record transaction
  INSERT INTO petty_cash_transactions (
    funding_source_id, transaction_type, amount, balance_before, balance_after,
    description, reference_number, performed_by
  ) VALUES (
    p_funding_source_id, 'top_up', p_amount, v_funding.balance, v_new_balance,
    COALESCE(p_description, 'Top-up kas kecil'), p_reference_number, auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Function to create reconciliation
CREATE OR REPLACE FUNCTION public.create_reconciliation(
  p_funding_source_id UUID,
  p_physical_balance NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funding RECORD;
  v_variance NUMERIC;
  v_recon_id UUID;
BEGIN
  -- Check authorization
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get funding source
  SELECT * INTO v_funding FROM funding_sources WHERE id = p_funding_source_id;
  
  IF v_funding IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Funding source not found');
  END IF;

  v_variance := p_physical_balance - v_funding.balance;

  -- Create reconciliation record
  INSERT INTO cash_reconciliations (
    funding_source_id, system_balance, physical_balance, variance, notes, reconciled_by
  ) VALUES (
    p_funding_source_id, v_funding.balance, p_physical_balance, v_variance, p_notes, auth.uid()
  ) RETURNING id INTO v_recon_id;

  RETURN jsonb_build_object('success', true, 'reconciliation_id', v_recon_id, 'variance', v_variance);
END;
$$;

-- SEED DATA: Test users profiles (they need to sign up to get auth.users entry)
-- We'll insert profiles that can be claimed when users sign up with matching emails

-- First, let's ensure we have budget period for 2026
INSERT INTO public.budget_periods (name, year, start_date, end_date, is_active, is_closed)
VALUES ('Periode 2026', 2026, '2026-01-01', '2026-12-31', true, false)
ON CONFLICT DO NOTHING;

-- Seed division budgets for testing (assuming divisions and categories exist)
DO $$
DECLARE
  v_period_id UUID;
  v_division RECORD;
  v_category RECORD;
BEGIN
  -- Get active period
  SELECT id INTO v_period_id FROM budget_periods WHERE is_active = true LIMIT 1;
  
  IF v_period_id IS NOT NULL THEN
    -- Create budgets for each division and category combination
    FOR v_division IN SELECT id FROM divisions WHERE is_active = true LOOP
      FOR v_category IN SELECT id FROM cost_categories WHERE is_active = true LOOP
        INSERT INTO division_budgets (division_id, category_id, period_id, allocated_amount, used_amount)
        VALUES (v_division.id, v_category.id, v_period_id, 100000000, 0) -- 100M per category
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- Update funding sources with initial balances
UPDATE funding_sources SET balance = 50000000 WHERE code = 'PETTY_CASH';
UPDATE funding_sources SET balance = 500000000 WHERE code = 'BANK_BCA';
UPDATE funding_sources SET balance = 500000000 WHERE code = 'BANK_MANDIRI';