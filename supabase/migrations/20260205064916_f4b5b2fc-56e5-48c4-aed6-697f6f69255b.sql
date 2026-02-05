-- Update the allocate_medical_budget function to use HR_WELFARE instead of WELFARE
CREATE OR REPLACE FUNCTION public.allocate_medical_budget(
  p_employee_id uuid,
  p_year integer,
  p_entitlement numeric,
  p_performed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hrga_division_id uuid;
  v_welfare_category_id uuid;
  v_division_budget_id uuid;
  v_budget_period_id uuid;
  v_current_allocated numeric;
  v_current_used numeric;
  v_remaining_budget numeric;
  v_existing_budget_id uuid;
  v_existing_entitlement numeric;
  v_difference numeric;
  v_performer_id uuid;
BEGIN
  -- Get performer ID (use param or current user)
  v_performer_id := COALESCE(p_performed_by, auth.uid());

  -- Get HRGA division ID
  SELECT id INTO v_hrga_division_id
  FROM divisions
  WHERE code = 'HRGA' AND is_active = true;

  IF v_hrga_division_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'HRGA division not found');
  END IF;

  -- Get Kesejahteraan Karyawan (Welfare) category ID - using HR_WELFARE code
  SELECT id INTO v_welfare_category_id
  FROM cost_categories
  WHERE code = 'HR_WELFARE' AND is_active = true;

  IF v_welfare_category_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'HR Welfare category not found');
  END IF;

  -- Get the active budget period for the year
  SELECT id INTO v_budget_period_id
  FROM budget_periods
  WHERE year = p_year AND is_active = true;

  IF v_budget_period_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active budget period for year ' || p_year);
  END IF;

  -- Get HRGA welfare budget
  SELECT id, allocated_amount, used_amount
  INTO v_division_budget_id, v_current_allocated, v_current_used
  FROM division_budgets
  WHERE division_id = v_hrga_division_id
    AND category_id = v_welfare_category_id
    AND period_id = v_budget_period_id;

  IF v_division_budget_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'HRGA Welfare budget does not exist for this year');
  END IF;

  v_remaining_budget := v_current_allocated - v_current_used;

  -- Check if employee already has a budget for this year
  SELECT id, total_entitlement
  INTO v_existing_budget_id, v_existing_entitlement
  FROM employee_medical_budgets
  WHERE employee_id = p_employee_id AND year = p_year;

  -- Calculate how much additional budget is needed
  IF v_existing_budget_id IS NOT NULL THEN
    v_difference := p_entitlement - v_existing_entitlement;
  ELSE
    v_difference := p_entitlement;
  END IF;

  -- Check if HRGA welfare budget has enough remaining
  IF v_difference > 0 AND v_difference > v_remaining_budget THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient HRGA welfare budget. Available: ' || v_remaining_budget || ', Required: ' || v_difference
    );
  END IF;

  -- Start transaction
  IF v_existing_budget_id IS NOT NULL THEN
    -- Update existing budget
    UPDATE employee_medical_budgets
    SET 
      total_entitlement = p_entitlement,
      remaining_amount = p_entitlement - used_amount,
      source_division_budget_id = v_division_budget_id,
      updated_at = now()
    WHERE id = v_existing_budget_id;
  ELSE
    -- Create new budget
    INSERT INTO employee_medical_budgets (
      employee_id, year, total_entitlement, used_amount, remaining_amount, 
      status, source_division_budget_id
    ) VALUES (
      p_employee_id, p_year, p_entitlement, 0, p_entitlement, 
      'active', v_division_budget_id
    );
  END IF;

  -- Update HRGA welfare budget used_amount (add the difference)
  IF v_difference > 0 THEN
    UPDATE division_budgets
    SET used_amount = used_amount + v_difference, updated_at = now()
    WHERE id = v_division_budget_id;

    -- Insert budget ledger entry
    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type, 
      reference_id, description, performed_by
    ) VALUES (
      v_division_budget_id, 'actual_add', v_difference, 'medical_budget',
      p_employee_id, 'Medical budget allocation for employee', v_performer_id
    );
  ELSIF v_difference < 0 THEN
    -- Refund the difference back to HRGA welfare budget
    UPDATE division_budgets
    SET used_amount = used_amount + v_difference, updated_at = now()
    WHERE id = v_division_budget_id;

    INSERT INTO budget_ledger (
      division_budget_id, entry_type, amount, reference_type,
      reference_id, description, performed_by
    ) VALUES (
      v_division_budget_id, 'actual_release', ABS(v_difference), 'medical_budget',
      p_employee_id, 'Medical budget adjustment refund', v_performer_id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'deducted_from_hrga', GREATEST(v_difference, 0),
    'remaining_hrga_budget', v_remaining_budget - GREATEST(v_difference, 0)
  );
END;
$$;