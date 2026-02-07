
-- Fix get_user_division_id function to be SECURITY DEFINER
-- Using CREATE OR REPLACE to avoid dependency issues
-- This is needed because the function is called from RLS policies on other tables
-- and needs to read the profiles table regardless of the calling user's profile access

CREATE OR REPLACE FUNCTION public.get_user_division_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT division_id
  FROM public.profiles
  WHERE id = _user_id
$$;

-- Also ensure can_access_division is SECURITY DEFINER for consistency
CREATE OR REPLACE FUNCTION public.can_access_division(_user_id uuid, _division_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'super_admin') OR
    public.has_role(_user_id, 'finance') OR
    public.get_user_division_id(_user_id) = _division_id
$$;
