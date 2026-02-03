-- Add source_division_budget_id to employee_medical_budgets to track where the budget came from
ALTER TABLE public.employee_medical_budgets 
ADD COLUMN IF NOT EXISTS source_division_budget_id uuid REFERENCES public.division_budgets(id);

-- Create function to allocate medical budget from HRGA welfare budget
CREATE OR REPLACE FUNCTION public.allocate_medical_budget(
  p_employee_id uuid,
  p_year integer,
  p_entitlement numeric,
  p_performed_by uuid DEFAULT auth.uid()
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
  v_medical_budget_id uuid;
  v_existing_entitlement numeric := 0;
  v_difference numeric;
BEGIN
  -- Check permission
  IF NOT has_role(p_performed_by, 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can allocate medical budgets');
  END IF;

  -- Get HRGA division ID
  SELECT id INTO v_hrga_division_id
  FROM divisions
  WHERE code = 'HRGA' AND is_active = true;

  IF v_hrga_division_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'HRGA division not found');
  END IF;

  -- Get Kesejahteraan Karyawan (Welfare) category ID
  SELECT id INTO v_welfare_category_id
  FROM cost_categories
  WHERE code = 'WELFARE' AND is_active = true;

  IF v_welfare_category_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Welfare category not found');
  END IF;

  -- Get active budget period for the year
  SELECT id INTO v_budget_period_id
  FROM budget_periods
  WHERE year = p_year AND is_active = true
  LIMIT 1;

  IF v_budget_period_id IS NULL THEN
    -- Try to find any period for that year
    SELECT id INTO v_budget_period_id
    FROM budget_periods
    WHERE year = p_year
    LIMIT 1;
  END IF;

  IF v_budget_period_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No budget period found for year ' || p_year);
  END IF;

  -- Get HRGA welfare budget
  SELECT id, allocated_amount, used_amount
  INTO v_division_budget_id, v_current_allocated, v_current_used
  FROM division_budgets
  WHERE division_id = v_hrga_division_id
    AND category_id = v_welfare_category_id
    AND period_id = v_budget_period_id;

  IF v_division_budget_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'HRGA welfare budget not found for year ' || p_year);
  END IF;

  -- Check if employee already has a medical budget for this year
  SELECT id, total_entitlement INTO v_medical_budget_id, v_existing_entitlement
  FROM employee_medical_budgets
  WHERE employee_id = p_employee_id AND year = p_year;

  -- Calculate the difference (new allocation minus existing)
  v_difference := p_entitlement - COALESCE(v_existing_entitlement, 0);
  
  -- Calculate remaining budget
  v_remaining_budget := v_current_allocated - v_current_used;

  -- Check if there's enough budget for new allocation
  IF v_difference > 0 AND v_difference > v_remaining_budget THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient HRGA welfare budget. Available: ' || v_remaining_budget || ', Required: ' || v_difference
    );
  END IF;

  -- Begin transaction
  IF v_medical_budget_id IS NOT NULL THEN
    -- Update existing medical budget
    UPDATE employee_medical_budgets
    SET total_entitlement = p_entitlement,
        source_division_budget_id = v_division_budget_id,
        updated_at = now()
    WHERE id = v_medical_budget_id;
  ELSE
    -- Create new medical budget
    INSERT INTO employee_medical_budgets (
      employee_id, year, total_entitlement, used_amount, status, source_division_budget_id
    ) VALUES (
      p_employee_id, p_year, p_entitlement, 0, 'active', v_division_budget_id
    )
    RETURNING id INTO v_medical_budget_id;
  END IF;

  -- Update division budget used_amount (add the difference)
  UPDATE division_budgets
  SET used_amount = used_amount + v_difference,
      updated_at = now()
  WHERE id = v_division_budget_id;

  -- Record budget movement
  INSERT INTO budget_movements (
    division_budget_id,
    movement_type,
    amount,
    balance_before,
    balance_after,
    description,
    performed_by
  ) VALUES (
    v_division_budget_id,
    CASE WHEN v_difference > 0 THEN 'medical_allocation' ELSE 'medical_adjustment' END,
    v_difference,
    v_current_allocated - v_current_used,
    v_current_allocated - v_current_used - v_difference,
    'Medical budget allocation for employee ' || p_employee_id || ' year ' || p_year,
    p_performed_by
  );

  RETURN json_build_object(
    'success', true,
    'medical_budget_id', v_medical_budget_id,
    'allocated_amount', p_entitlement,
    'deducted_from_hrga', v_difference,
    'remaining_hrga_budget', v_current_allocated - v_current_used - v_difference
  );
END;
$$;