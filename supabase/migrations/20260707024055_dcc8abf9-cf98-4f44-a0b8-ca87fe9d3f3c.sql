
-- Widen creator update/delete to draft OR submitted (before admin approves)
DROP POLICY IF EXISTS "Users can update their draft settlements" ON public.cash_advance_settlements;
CREATE POLICY "Users can update their pending settlements"
ON public.cash_advance_settlements
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND status IN ('draft'::settlement_status, 'submitted'::settlement_status)
)
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete their draft settlements" ON public.cash_advance_settlements;
CREATE POLICY "Users can delete their pending settlements"
ON public.cash_advance_settlements
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  AND status IN ('draft'::settlement_status, 'submitted'::settlement_status)
);

-- Same for settlement items
DROP POLICY IF EXISTS "Users can manage items for their draft settlements" ON public.cash_advance_settlement_items;
CREATE POLICY "Users can manage items for their pending settlements"
ON public.cash_advance_settlement_items FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM cash_advance_settlements s
  WHERE s.id = cash_advance_settlement_items.settlement_id
    AND s.created_by = auth.uid()
    AND s.status IN ('draft'::settlement_status, 'submitted'::settlement_status)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM cash_advance_settlements s
  WHERE s.id = cash_advance_settlement_items.settlement_id
    AND s.created_by = auth.uid()
    AND s.status IN ('draft'::settlement_status, 'submitted'::settlement_status)
));
