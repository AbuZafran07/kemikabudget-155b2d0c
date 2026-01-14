
-- Drop the foreign key constraint on user_roles.user_id to auth.users
-- This is needed because admin_create_user creates profiles with temporary UUIDs
-- that don't exist in auth.users until the user signs up
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
