-- Add unique constraint on user_roles.user_id to enable proper upsert
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);