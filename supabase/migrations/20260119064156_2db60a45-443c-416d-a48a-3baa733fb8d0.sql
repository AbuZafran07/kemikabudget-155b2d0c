-- Add approved_amount column to requests table
ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS approved_amount numeric NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.requests.approved_amount IS 'The amount approved by super_admin, may differ from original request amount';

-- Drop and recreate the approve_request function to support approved_amount
CREATE OR REPLACE FUNCTION public.approve_request(
  p_request_id uuid,
  p_approval_note text DEFAULT NULL,
  p_approved_amount numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_budget RECORD;
  v_new_used_amount numeric;
  v_final_amount numeric;
BEGIN
  -- Check if user has super_admin role
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Get the request with FOR UPDATE lock
  SELECT r.*, bp.id as period_id
  INTO v_request
  FROM requests r
  LEFT JOIN budget_periods bp ON bp.is_active = true AND NOT bp.is_closed
  WHERE r.id = p_request_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  -- Check status
  IF v_request.status NOT IN ('submitted', 'under_review') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not in a valid state for approval');
  END IF;

  -- Determine the final amount (use approved_amount if provided, otherwise use original amount)
  v_final_amount := COALESCE(p_approved_amount, v_request.amount);
  
  -- Validate amount is positive
  IF v_final_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Approved amount must be greater than 0');
  END IF;

  -- Get the division budget for this category
  SELECT db.* INTO v_budget
  FROM division_budgets db
  WHERE db.division_id = v_request.division_id
    AND db.category_id = v_request.category_id
    AND db.period_id = v_request.period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No budget allocation found for this division and category');
  END IF;

  -- Check if there's enough budget
  IF (v_budget.allocated_amount - v_budget.used_amount) < v_final_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient budget');
  END IF;

  -- Calculate new used amount
  v_new_used_amount := v_budget.used_amount + v_final_amount;

  -- Update the budget
  UPDATE division_budgets
  SET used_amount = v_new_used_amount,
      updated_at = now()
  WHERE id = v_budget.id;

  -- Record budget movement with the approved amount
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
    v_final_amount,
    v_budget.allocated_amount - v_budget.used_amount,
    v_budget.allocated_amount - v_new_used_amount,
    'Budget deduction for approved request ' || v_request.request_number || 
      CASE 
        WHEN p_approved_amount IS NOT NULL AND p_approved_amount != v_request.amount 
        THEN ' (adjusted from ' || v_request.amount || ' to ' || p_approved_amount || ')'
        ELSE ''
      END,
    auth.uid()
  );

  -- Update request status, lock it, and record approved_amount
  UPDATE requests
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      approved_amount = v_final_amount,
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid(),
      notes = CASE 
        WHEN p_approval_note IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Approval Note: ' || p_approval_note
        ELSE notes
      END,
      updated_at = now()
  WHERE id = p_request_id;

  -- Record event
  INSERT INTO request_events (
    request_id,
    event_type,
    description,
    performed_by,
    metadata
  ) VALUES (
    p_request_id,
    'approved',
    'Request approved' || 
      CASE 
        WHEN p_approved_amount IS NOT NULL AND p_approved_amount != v_request.amount 
        THEN ' with adjusted amount from ' || v_request.amount || ' to ' || p_approved_amount
        ELSE ''
      END,
    auth.uid(),
    json_build_object(
      'note', p_approval_note,
      'original_amount', v_request.amount,
      'approved_amount', v_final_amount,
      'budget_remaining', v_budget.allocated_amount - v_new_used_amount
    )
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'Request approved successfully',
    'approved_amount', v_final_amount,
    'original_amount', v_request.amount
  );
END;
$$;