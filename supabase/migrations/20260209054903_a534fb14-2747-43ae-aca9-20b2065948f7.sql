-- Update the review_medical_claim_hrga function to accept both 'submitted' and 'review_hrga' status
CREATE OR REPLACE FUNCTION public.review_medical_claim_hrga(
  p_claim_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim medical_claims%ROWTYPE;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Allow super_admin OR admin
  IF NOT (has_role(v_user_id, 'super_admin') OR has_role(v_user_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can review claims');
  END IF;
  
  SELECT * INTO v_claim FROM medical_claims WHERE id = p_claim_id FOR UPDATE;
  
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Medical claim not found');
  END IF;
  
  -- Accept both 'submitted' and 'review_hrga' status
  IF v_claim.status NOT IN ('submitted', 'review_hrga') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim cannot be reviewed in current status');
  END IF;
  
  IF p_action = 'approve' THEN
    -- HRGA directly approves now (no finance review step)
    UPDATE medical_claims
    SET status = 'approved',
        approved_at = NOW(),
        approved_by = v_user_id,
        approved_amount = claim_amount, -- Set approved amount to claim amount
        reviewed_hrga_at = NOW(),
        reviewed_hrga_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_claim_id;
    
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'approved', 'Claim approved by HRGA', v_user_id, jsonb_build_object('note', p_note));
    
    RETURN jsonb_build_object('success', true, 'message', 'Claim approved successfully');
  ELSIF p_action = 'reject' THEN
    IF p_note IS NULL OR LENGTH(TRIM(p_note)) < 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
    END IF;
    
    UPDATE medical_claims
    SET status = 'rejected',
        rejected_at = NOW(),
        rejected_by = v_user_id,
        rejection_reason = p_note,
        updated_at = NOW()
    WHERE id = p_claim_id;
    
    INSERT INTO medical_claim_events (claim_id, event_type, description, performed_by, metadata)
    VALUES (p_claim_id, 'rejected', 'Claim rejected by HRGA', v_user_id, jsonb_build_object('reason', p_note));
    
    RETURN jsonb_build_object('success', true, 'message', 'Claim rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use approve or reject');
  END IF;
END;
$$;