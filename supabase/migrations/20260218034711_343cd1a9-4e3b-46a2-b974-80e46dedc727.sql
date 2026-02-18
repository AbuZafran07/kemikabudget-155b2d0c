
-- Step 1: Add 'revision' to request_status enum and reference_number column
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'revision' AFTER 'submitted';
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS reference_number text;
