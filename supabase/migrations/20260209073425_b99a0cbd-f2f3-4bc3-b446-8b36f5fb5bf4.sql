-- Fix RLS policy to allow finance/super_admin to upload attachments at any request status
-- The current policy only allows upload when status is draft/submitted, but finance needs to upload during payment

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can add attachments to their own requests" ON public.request_attachments;

-- Create new policy that:
-- 1. Allows requester to upload when request is in draft/submitted status
-- 2. Allows super_admin and finance to upload at any status (for payment proof, etc.)
CREATE POLICY "Users can add attachments to their requests"
ON public.request_attachments
FOR INSERT
WITH CHECK (
  (uploaded_by = auth.uid()) AND (
    -- Requester can upload in draft/submitted status
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_attachments.request_id
        AND r.requester_id = auth.uid()
        AND r.status IN ('draft', 'submitted')
    )
    OR
    -- Super admin can upload at any status
    has_role(auth.uid(), 'super_admin'::app_role)
    OR
    -- Finance can upload for approved/paid requests (payment proof)
    (
      has_role(auth.uid(), 'finance'::app_role)
      AND EXISTS (
        SELECT 1 FROM requests r
        WHERE r.id = request_attachments.request_id
          AND r.status IN ('approved', 'paid', 'settled')
      )
    )
  )
);