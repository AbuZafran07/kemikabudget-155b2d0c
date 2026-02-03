-- Create storage bucket for medical claim attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-attachments', 
  'medical-attachments', 
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for medical-attachments bucket
CREATE POLICY "Users can view their own medical attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'medical-attachments' AND
  auth.uid() IS NOT NULL AND
  (
    -- Owner can view
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Super admin, Finance, HRGA can view all
    has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'finance')
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can upload their own medical attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'medical-attachments' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own medical attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'medical-attachments' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Insert sample medical budgets for existing employees (Year 2026)
INSERT INTO public.employee_medical_budgets (employee_id, year, total_entitlement, used_amount, status)
SELECT 
  p.id,
  2026,
  5000000, -- Rp 5,000,000 per year
  0,
  'active'
FROM public.profiles p
WHERE p.is_active = true
ON CONFLICT DO NOTHING;