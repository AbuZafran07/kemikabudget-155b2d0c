-- Allow request owner to delete their own DRAFT requests
CREATE POLICY "Users can delete own draft requests"
ON public.requests
FOR DELETE
TO public
USING (
  requester_id = auth.uid()
  AND status = 'draft'
  AND is_locked = false
);