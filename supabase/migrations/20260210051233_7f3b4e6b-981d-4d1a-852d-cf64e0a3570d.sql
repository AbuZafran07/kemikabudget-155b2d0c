
-- Adjustment/Correction Entry table
CREATE TABLE public.adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  adjustment_number TEXT NOT NULL UNIQUE,
  
  -- Reference to original record
  reference_type TEXT NOT NULL CHECK (reference_type IN ('expense_request', 'cash_advance', 'medical_claim')),
  reference_id UUID NOT NULL,
  
  -- Adjustment details
  original_amount NUMERIC NOT NULL,
  adjusted_amount NUMERIC NOT NULL,
  difference_amount NUMERIC NOT NULL, -- positive = increase, negative = decrease
  reason TEXT NOT NULL,
  
  -- Division & category for budget adjustment
  division_id UUID NOT NULL REFERENCES public.divisions(id),
  category_id UUID REFERENCES public.cost_categories(id),
  period_id UUID REFERENCES public.budget_periods(id),
  funding_source_id UUID REFERENCES public.funding_sources(id),
  
  -- Workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_note TEXT,
  
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Flags
  adjust_budget BOOLEAN NOT NULL DEFAULT true,
  adjust_cash BOOLEAN NOT NULL DEFAULT false,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admin full access on adjustments"
  ON public.adjustments FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Finance can view all adjustments"
  ON public.adjustments FOR SELECT
  USING (public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance can create adjustments"
  ON public.adjustments FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'finance') AND auth.uid() = created_by);

-- Sequence for adjustment numbers
CREATE OR REPLACE FUNCTION public.get_next_adjustment_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT;
  v_month INT;
  v_seq INT;
  v_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM now());
  v_month := EXTRACT(MONTH FROM now());
  
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(adjustment_number, '/', 1) AS INT)
  ), 0) + 1
  INTO v_seq
  FROM adjustments
  WHERE adjustment_number LIKE '%/ADJ/' || v_year::TEXT || '/' || LPAD(v_month::TEXT, 2, '0');
  
  v_number := LPAD(v_seq::TEXT, 4, '0') || '/ADJ/' || v_year::TEXT || '/' || LPAD(v_month::TEXT, 2, '0');
  RETURN v_number;
END;
$$;

-- Approve adjustment function (atomic)
CREATE OR REPLACE FUNCTION public.approve_adjustment(
  p_adjustment_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_user_id UUID;
  v_budget_id UUID;
  v_old_used NUMERIC;
BEGIN
  v_user_id := auth.uid();
  
  -- Only super_admin can approve
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Hanya Super Admin yang dapat menyetujui adjustment');
  END IF;
  
  -- Lock and fetch adjustment
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id AND status = 'pending' FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment tidak ditemukan atau sudah diproses');
  END IF;
  
  -- Cannot approve own adjustment
  IF v_adj.created_by = v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Tidak dapat menyetujui adjustment sendiri');
  END IF;
  
  -- Update adjustment status
  UPDATE adjustments SET
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now(),
    approval_note = p_note,
    updated_at = now()
  WHERE id = p_adjustment_id;
  
  -- Apply budget adjustment if needed
  IF v_adj.adjust_budget AND v_adj.category_id IS NOT NULL AND v_adj.period_id IS NOT NULL THEN
    -- Find the division budget
    SELECT id, used_amount INTO v_budget_id, v_old_used
    FROM division_budgets
    WHERE division_id = v_adj.division_id
      AND category_id = v_adj.category_id
      AND period_id = v_adj.period_id
    FOR UPDATE;
    
    IF v_budget_id IS NOT NULL THEN
      -- Update used_amount by the difference
      UPDATE division_budgets
      SET used_amount = used_amount + v_adj.difference_amount,
          updated_at = now()
      WHERE id = v_budget_id;
      
      -- Record budget movement
      INSERT INTO budget_movements (
        division_budget_id, movement_type, amount,
        balance_before, balance_after,
        description, performed_by, request_id
      ) VALUES (
        v_budget_id,
        'adjustment',
        ABS(v_adj.difference_amount),
        v_old_used,
        v_old_used + v_adj.difference_amount,
        'Adjustment: ' || v_adj.reason,
        v_user_id,
        CASE WHEN v_adj.reference_type = 'expense_request' THEN v_adj.reference_id ELSE NULL END
      );
    END IF;
  END IF;
  
  -- Apply cash/funding source adjustment if needed
  IF v_adj.adjust_cash AND v_adj.funding_source_id IS NOT NULL THEN
    UPDATE funding_sources
    SET balance = balance - v_adj.difference_amount,
        updated_at = now()
    WHERE id = v_adj.funding_source_id;
  END IF;
  
  -- Update the original record's amount
  IF v_adj.reference_type = 'expense_request' THEN
    UPDATE requests
    SET approved_amount = v_adj.adjusted_amount,
        updated_at = now()
    WHERE id = v_adj.reference_id;
  ELSIF v_adj.reference_type = 'cash_advance' THEN
    UPDATE cash_advances
    SET total_amount = v_adj.adjusted_amount,
        updated_at = now()
    WHERE id = v_adj.reference_id;
  ELSIF v_adj.reference_type = 'medical_claim' THEN
    UPDATE medical_claims
    SET approved_amount = v_adj.adjusted_amount,
        updated_at = now()
    WHERE id = v_adj.reference_id;
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (event_type, entity_type, entity_id, description, user_id)
  VALUES (
    'adjustment_approved',
    v_adj.reference_type,
    v_adj.reference_id::TEXT,
    'Adjustment approved: ' || v_adj.original_amount || ' → ' || v_adj.adjusted_amount || ' (' || v_adj.reason || ')',
    v_user_id
  );
  
  RETURN json_build_object('success', true);
END;
$$;

-- Reject adjustment function
CREATE OR REPLACE FUNCTION public.reject_adjustment(
  p_adjustment_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT has_role(v_user_id, 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Hanya Super Admin yang dapat menolak adjustment');
  END IF;
  
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id AND status = 'pending' FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment tidak ditemukan atau sudah diproses');
  END IF;
  
  UPDATE adjustments SET
    status = 'rejected',
    rejected_by = v_user_id,
    rejected_at = now(),
    rejection_reason = p_reason,
    updated_at = now()
  WHERE id = p_adjustment_id;
  
  INSERT INTO audit_logs (event_type, entity_type, entity_id, description, user_id)
  VALUES (
    'adjustment_rejected',
    v_adj.reference_type,
    v_adj.reference_id::TEXT,
    'Adjustment rejected: ' || p_reason,
    v_user_id
  );
  
  RETURN json_build_object('success', true);
END;
$$;

-- Updated_at trigger
CREATE TRIGGER update_adjustments_updated_at
  BEFORE UPDATE ON public.adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.adjustments;
