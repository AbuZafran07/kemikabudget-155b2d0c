
-- Allow users to view approved/paid/settled requests within their own division
-- This enables division-level reporting for all users
CREATE POLICY "Users can view completed division requests"
ON public.requests
FOR SELECT
USING (
  status IN ('approved', 'paid', 'settled')
  AND can_access_division(auth.uid(), division_id)
);
