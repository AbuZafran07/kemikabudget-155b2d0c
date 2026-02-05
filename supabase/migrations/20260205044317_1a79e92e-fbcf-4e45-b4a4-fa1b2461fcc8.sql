-- Add is_public column to cost_categories for visibility control
ALTER TABLE public.cost_categories 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN public.cost_categories.is_public IS 'When true, this category is visible to all users. When false, only super_admin can see it.';

-- Update existing categories to be public by default
UPDATE public.cost_categories SET is_public = true WHERE is_public IS NULL;