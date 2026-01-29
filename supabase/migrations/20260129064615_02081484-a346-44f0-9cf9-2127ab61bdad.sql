-- Add category_id column to cash_advance_items table
ALTER TABLE public.cash_advance_items 
ADD COLUMN category_id uuid REFERENCES public.cost_categories(id);

-- Create index for better query performance
CREATE INDEX idx_cash_advance_items_category_id ON public.cash_advance_items(category_id);

-- Drop the category_id column from cash_advances table since it will now be per-item
-- First remove the foreign key constraint if exists
ALTER TABLE public.cash_advances DROP CONSTRAINT IF EXISTS cash_advances_category_id_fkey;

-- Remove category_id from cash_advances (make it nullable first for existing data)
-- Note: We keep the column for now as existing CAs may have data, just make it optional
ALTER TABLE public.cash_advances ALTER COLUMN category_id DROP NOT NULL;