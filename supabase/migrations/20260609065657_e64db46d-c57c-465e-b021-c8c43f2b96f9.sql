
-- Allow settlement creators to update/delete their own DRAFT settlements
CREATE POLICY "Users can update their draft settlements"
ON public.cash_advance_settlements
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() AND status = 'draft'::settlement_status)
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their draft settlements"
ON public.cash_advance_settlements
FOR DELETE
TO authenticated
USING (created_by = auth.uid() AND status = 'draft'::settlement_status);
