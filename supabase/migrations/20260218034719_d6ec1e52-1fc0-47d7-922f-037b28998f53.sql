
-- RLS policies for revision workflow
CREATE POLICY "Users can request revision on their submitted requests"
ON public.requests
FOR UPDATE
USING (
  requester_id = auth.uid()
  AND status = 'submitted'::request_status
  AND is_locked = false
)
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'revision'::request_status
);

CREATE POLICY "Users can edit and resubmit revision requests"
ON public.requests
FOR UPDATE
USING (
  requester_id = auth.uid()
  AND status = 'revision'::request_status
  AND is_locked = false
)
WITH CHECK (
  requester_id = auth.uid()
  AND is_locked = false
  AND (status = 'revision'::request_status OR status = 'submitted'::request_status)
);
