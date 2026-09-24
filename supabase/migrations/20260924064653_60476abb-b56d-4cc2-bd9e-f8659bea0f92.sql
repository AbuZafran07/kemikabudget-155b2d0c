CREATE POLICY "Requester or super admin can update draft transfers"
ON public.budget_transfers
FOR UPDATE
TO authenticated
USING (status = 'draft' AND (requester_id = auth.uid() OR has_role(auth.uid(), 'super_admin')))
WITH CHECK (status = 'draft' AND (requester_id = auth.uid() OR has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Requester or super admin can delete draft transfers"
ON public.budget_transfers
FOR DELETE
TO authenticated
USING (status = 'draft' AND (requester_id = auth.uid() OR has_role(auth.uid(), 'super_admin')));