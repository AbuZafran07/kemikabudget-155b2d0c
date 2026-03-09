CREATE OR REPLACE FUNCTION public.reject_from_payment_queue(p_id uuid, p_type text, p_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request requests%ROWTYPE;
  v_claim medical_claims%ROWTYPE;
  v_ca cash_advances%ROWTYPE;
  v_budget_id uuid;
  v_amount numeric;
  v_budget_record division_budgets%ROWTYPE;
  v_medical_budget employee_medical_budgets%ROWTYPE;
BEGIN
  -- Only super_admin can reject from payment queue
  IF NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can reject from payment queue');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  IF p_type = 'request' THEN
    SELECT * INTO v_request FROM requests WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Request not found');
    END IF;
    IF v_request.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved requests can be rejected from payment queue');
    END IF;

    v_amount := COALESCE(v_request.approved_amount, v_request.amount);

    -- Find the division budget to reverse
    SELECT id INTO v_budget_id
    FROM division_budgets
    WHERE division_id = v_request.division_id
      AND category_id = v_request.category_id
      AND period_id = v_request.period_id
    LIMIT 1;

    -- Reverse budget deduction if budget was found
    IF v_budget_id IS NOT NULL THEN
      SELECT * INTO v_budget_record FROM division_budgets WHERE id = v_budget_id;
      
      UPDATE division_budgets
      SET used_amount = used_amount - v_amount,
          updated_at = NOW()
      WHERE id = v_budget_id;

      INSERT INTO budget_movements (division_budget_id, request_id, amount, balance_before, balance_after, movement_type, performed_by, description)
      VALUES (v_budget_id, p_id, v_amount, 
              v_budget_record.allocated_amount - v_budget_record.used_amount,
              v_budget_record.allocated_amount - v_budget_record.used_amount + v_amount,
              'reversal', auth.uid(), 'Budget reversed - rejected from payment queue: ' || p_reason);

      -- Also reverse budget ledger if exists
      INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_id, reference_type, performed_by, description)
      VALUES (v_budget_id, 'refund', v_amount, p_id, 'request', auth.uid(), 'Rejected from payment queue');
    END IF;

    -- Update request status
    UPDATE requests
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO request_events (request_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Request rejected and budget restored');

  ELSIF p_type = 'medical_claim' THEN
    SELECT * INTO v_claim FROM medical_claims WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Medical claim not found');
    END IF;
    IF v_claim.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved claims can be rejected from payment queue');
    END IF;

    v_amount := COALESCE(v_claim.approved_amount, v_claim.claim_amount);

    -- Reverse medical budget commitment if budget exists
    IF v_claim.medical_budget_id IS NOT NULL THEN
      SELECT * INTO v_medical_budget FROM employee_medical_budgets WHERE id = v_claim.medical_budget_id;
      
      IF FOUND THEN
        -- Insert reversal ledger entry
        INSERT INTO medical_ledger (employee_medical_budget_id, entry_type, amount, claim_id, performed_by, description)
        VALUES (v_claim.medical_budget_id, 'commitment_release', v_claim.claim_amount, p_id, auth.uid(), 'Rejected from payment queue');
      END IF;
    END IF;

    -- Update claim status
    UPDATE medical_claims
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Medical claim rejected and budget restored');

  ELSIF p_type = 'cash_advance' THEN
    SELECT * INTO v_ca FROM cash_advances WHERE id = p_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Cash advance not found');
    END IF;
    IF v_ca.status != 'approved' THEN
      RETURN json_build_object('success', false, 'error', 'Only approved cash advances can be rejected from payment queue');
    END IF;

    v_amount := v_ca.total_amount;

    -- Find and reverse budget deduction
    IF v_ca.category_id IS NOT NULL AND v_ca.period_id IS NOT NULL THEN
      SELECT id INTO v_budget_id
      FROM division_budgets
      WHERE division_id = v_ca.division_id
        AND category_id = v_ca.category_id
        AND period_id = v_ca.period_id
      LIMIT 1;

      IF v_budget_id IS NOT NULL THEN
        SELECT * INTO v_budget_record FROM division_budgets WHERE id = v_budget_id;
        
        UPDATE division_budgets
        SET used_amount = used_amount - v_amount,
            updated_at = NOW()
        WHERE id = v_budget_id;

        INSERT INTO budget_movements (division_budget_id, amount, balance_before, balance_after, movement_type, performed_by, description)
        VALUES (v_budget_id, v_amount,
                v_budget_record.allocated_amount - v_budget_record.used_amount,
                v_budget_record.allocated_amount - v_budget_record.used_amount + v_amount,
                'reversal', auth.uid(), 'Budget reversed - CA rejected from payment queue');

        INSERT INTO budget_ledger (division_budget_id, entry_type, amount, reference_id, reference_type, performed_by, description)
        VALUES (v_budget_id, 'refund', v_amount, p_id, 'cash_advance', auth.uid(), 'CA rejected from payment queue');
      END IF;
    END IF;

    -- Update CA status
    UPDATE cash_advances
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = auth.uid(),
        rejection_reason = p_reason,
        is_locked = true,
        updated_at = NOW()
    WHERE id = p_id;

    -- Log event
    INSERT INTO cash_advance_events (cash_advance_id, event_type, description, performed_by, metadata)
    VALUES (p_id, 'rejected', 'Rejected from payment queue: ' || p_reason, auth.uid(),
      json_build_object('stage', 'payment_queue', 'reason', p_reason)::jsonb);

    RETURN json_build_object('success', true, 'message', 'Cash advance rejected and budget restored');

  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid type: ' || p_type);
  END IF;
END;
$function$;