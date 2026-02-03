-- Fix the SECURITY DEFINER view warning by recreating with SECURITY INVOKER
-- Drop and recreate the view with proper security settings

DROP VIEW IF EXISTS public.requests_secure;

CREATE VIEW public.requests_secure 
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.division_id,
  r.category_id,
  r.requester_id,
  r.period_id,
  r.amount,
  r.needed_date,
  r.funding_source_id,
  r.status,
  r.submitted_at,
  r.approved_at,
  r.approved_by,
  r.rejected_at,
  r.rejected_by,
  r.paid_at,
  r.paid_by,
  r.settled_at,
  r.settled_by,
  r.is_locked,
  r.locked_at,
  r.locked_by,
  r.created_at,
  r.updated_at,
  r.approved_amount,
  r.notes,
  r.rejection_reason,
  r.request_number,
  r.description,
  r.vendor,
  r.payment_method,
  -- Mask beneficiary data: only show full details to requester, approved_by, finance, or super_admin
  CASE 
    WHEN r.requester_id = auth.uid() THEN r.beneficiary_name
    WHEN r.approved_by = auth.uid() THEN r.beneficiary_name
    WHEN public.has_role(auth.uid(), 'finance') THEN r.beneficiary_name
    WHEN public.has_role(auth.uid(), 'super_admin') THEN r.beneficiary_name
    ELSE CASE 
      WHEN r.beneficiary_name IS NOT NULL THEN '***TERSEMBUNYI***'
      ELSE NULL
    END
  END AS beneficiary_name,
  CASE 
    WHEN r.requester_id = auth.uid() THEN r.beneficiary_bank
    WHEN r.approved_by = auth.uid() THEN r.beneficiary_bank
    WHEN public.has_role(auth.uid(), 'finance') THEN r.beneficiary_bank
    WHEN public.has_role(auth.uid(), 'super_admin') THEN r.beneficiary_bank
    ELSE CASE 
      WHEN r.beneficiary_bank IS NOT NULL THEN '***TERSEMBUNYI***'
      ELSE NULL
    END
  END AS beneficiary_bank,
  CASE 
    WHEN r.requester_id = auth.uid() THEN r.beneficiary_account
    WHEN r.approved_by = auth.uid() THEN r.beneficiary_account
    WHEN public.has_role(auth.uid(), 'finance') THEN r.beneficiary_account
    WHEN public.has_role(auth.uid(), 'super_admin') THEN r.beneficiary_account
    ELSE CASE 
      WHEN r.beneficiary_account IS NOT NULL THEN '****' || RIGHT(r.beneficiary_account, 4)
      ELSE NULL
    END
  END AS beneficiary_account,
  CASE 
    WHEN r.requester_id = auth.uid() THEN r.beneficiary_email
    WHEN r.approved_by = auth.uid() THEN r.beneficiary_email
    WHEN public.has_role(auth.uid(), 'finance') THEN r.beneficiary_email
    WHEN public.has_role(auth.uid(), 'super_admin') THEN r.beneficiary_email
    ELSE CASE 
      WHEN r.beneficiary_email IS NOT NULL THEN '***@***'
      ELSE NULL
    END
  END AS beneficiary_email
FROM public.requests r;

-- Grant access to the view
GRANT SELECT ON public.requests_secure TO authenticated;

-- Add comment explaining the view purpose
COMMENT ON VIEW public.requests_secure IS 'Secure view for requests that masks beneficiary payment details. Only requester, approver, finance, or super_admin can see full beneficiary information. Uses SECURITY INVOKER to respect querying user permissions.';