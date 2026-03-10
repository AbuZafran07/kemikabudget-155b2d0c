
-- Drop the old pay_request function (2 params version)
DROP FUNCTION IF EXISTS public.pay_request(uuid, text);

-- The 3-param version (p_request_id, p_payment_note, p_paid_amount) already exists and handles all cases
