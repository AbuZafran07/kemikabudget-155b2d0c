-- Create cost_categories table
CREATE TABLE public.cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create funding_sources table
CREATE TABLE public.funding_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('petty_cash', 'bank')),
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create budget_periods table
CREATE TABLE public.budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year)
);

-- Create division_budgets table (budget allocation per division per category per period)
CREATE TABLE public.division_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.cost_categories(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.budget_periods(id) ON DELETE CASCADE,
  allocated_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(division_id, category_id, period_id)
);

-- Create request status enum
CREATE TYPE public.request_status AS ENUM (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'settled', 'cancelled'
);

-- Create requests table
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  division_id UUID NOT NULL REFERENCES public.divisions(id),
  category_id UUID NOT NULL REFERENCES public.cost_categories(id),
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  period_id UUID REFERENCES public.budget_periods(id),
  
  -- Request details
  description TEXT NOT NULL,
  vendor TEXT,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  needed_date DATE NOT NULL,
  
  -- Funding
  funding_source_id UUID REFERENCES public.funding_sources(id),
  payment_method TEXT,
  
  -- Beneficiary (for bank transfers)
  beneficiary_name TEXT,
  beneficiary_bank TEXT,
  beneficiary_account TEXT,
  beneficiary_email TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Status tracking
  status request_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  settled_at TIMESTAMPTZ,
  settled_by UUID REFERENCES auth.users(id),
  
  -- Audit
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create request_attachments table
CREATE TABLE public.request_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('quotation', 'invoice', 'receipt', 'other')),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create request_events table (activity log)
CREATE TABLE public.request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('request-attachments', 'request-attachments', false, 10485760);

-- Enable RLS on all tables
ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.division_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cost_categories
CREATE POLICY "Authenticated users can view active categories"
  ON public.cost_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can manage categories"
  ON public.cost_categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for funding_sources
CREATE POLICY "Authenticated users can view active funding sources"
  ON public.funding_sources FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can manage funding sources"
  ON public.funding_sources FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for budget_periods
CREATE POLICY "Authenticated users can view active periods"
  ON public.budget_periods FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Super admins can manage periods"
  ON public.budget_periods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for division_budgets
CREATE POLICY "Users can view their division budgets"
  ON public.division_budgets FOR SELECT
  TO authenticated
  USING (public.can_access_division(auth.uid(), division_id));

CREATE POLICY "Super admins can manage all budgets"
  ON public.division_budgets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for requests
CREATE POLICY "Users can view requests in their division"
  ON public.requests FOR SELECT
  TO authenticated
  USING (public.can_access_division(auth.uid(), division_id));

CREATE POLICY "Users can create requests in their division"
  ON public.requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid() AND
    division_id = public.get_user_division_id(auth.uid())
  );

CREATE POLICY "Users can update their own draft requests"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid() AND 
    status = 'draft' AND
    is_locked = false
  )
  WITH CHECK (
    requester_id = auth.uid() AND 
    status = 'draft' AND
    is_locked = false
  );

CREATE POLICY "Super admins can manage all requests"
  ON public.requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Finance can view approved requests"
  ON public.requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance') AND
    status IN ('approved', 'paid', 'settled')
  );

CREATE POLICY "Finance can update payment status"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance') AND
    status = 'approved'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'finance') AND
    status IN ('approved', 'paid')
  );

-- RLS Policies for request_attachments
CREATE POLICY "Users can view attachments for accessible requests"
  ON public.request_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
      AND public.can_access_division(auth.uid(), r.division_id)
    )
  );

CREATE POLICY "Users can add attachments to their own requests"
  ON public.request_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
      AND r.requester_id = auth.uid()
      AND r.status IN ('draft', 'submitted')
    )
  );

CREATE POLICY "Super admins can manage all attachments"
  ON public.request_attachments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for request_events
CREATE POLICY "Users can view events for accessible requests"
  ON public.request_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
      AND public.can_access_division(auth.uid(), r.division_id)
    )
  );

CREATE POLICY "System can insert events"
  ON public.request_events FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- Storage policies for request-attachments bucket
CREATE POLICY "Users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'request-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'request-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Super admins and finance can view all attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'request-attachments' AND
    (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'finance'))
  );

-- Function to generate request number
CREATE OR REPLACE FUNCTION public.generate_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  division_code TEXT;
  year_part TEXT;
  sequence_num INTEGER;
  new_number TEXT;
BEGIN
  -- Get division code
  SELECT code INTO division_code FROM public.divisions WHERE id = NEW.division_id;
  
  -- Get year
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  -- Get next sequence number for this division and year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)
  ), 0) + 1 INTO sequence_num
  FROM public.requests
  WHERE request_number LIKE 'REQ/' || division_code || '/' || year_part || '/%';
  
  -- Format: REQ/HRGA/2026/0001
  new_number := 'REQ/' || division_code || '/' || year_part || '/' || LPAD(sequence_num::TEXT, 4, '0');
  
  NEW.request_number := new_number;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate request number
CREATE TRIGGER generate_request_number_trigger
  BEFORE INSERT ON public.requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION public.generate_request_number();

-- Function to log request events
CREATE OR REPLACE FUNCTION public.log_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_desc TEXT;
  event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_type := 'created';
    event_desc := 'Request created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      event_type := 'status_changed';
      event_desc := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSE
      event_type := 'updated';
      event_desc := 'Request updated';
    END IF;
  END IF;
  
  INSERT INTO public.request_events (request_id, event_type, description, performed_by)
  VALUES (NEW.id, event_type, event_desc, COALESCE(auth.uid(), NEW.requester_id));
  
  RETURN NEW;
END;
$$;

-- Trigger for request events
CREATE TRIGGER log_request_event_trigger
  AFTER INSERT OR UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_request_event();

-- Updated_at triggers
CREATE TRIGGER update_cost_categories_updated_at
  BEFORE UPDATE ON public.cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funding_sources_updated_at
  BEFORE UPDATE ON public.funding_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_periods_updated_at
  BEFORE UPDATE ON public.budget_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_division_budgets_updated_at
  BEFORE UPDATE ON public.division_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed cost categories
INSERT INTO public.cost_categories (code, name, description) VALUES
  ('TRAVEL', 'Perjalanan Dinas', 'Biaya transportasi dan akomodasi perjalanan dinas'),
  ('OFFICE', 'Perlengkapan Kantor', 'ATK, peralatan kantor, dan supplies'),
  ('TRAINING', 'Pelatihan & Pengembangan', 'Biaya training, seminar, dan sertifikasi'),
  ('MAINT', 'Pemeliharaan', 'Biaya perawatan dan perbaikan aset'),
  ('LOG', 'Logistik', 'Biaya pengiriman dan logistik'),
  ('ENT', 'Entertainment', 'Biaya jamuan dan representasi'),
  ('UTIL', 'Utilitas', 'Listrik, air, telepon, internet'),
  ('MISC', 'Lain-lain', 'Biaya lain yang tidak termasuk kategori di atas');

-- Seed funding sources
INSERT INTO public.funding_sources (code, name, type, bank_name, account_number, account_holder, balance) VALUES
  ('PETTY_CASH', 'Kas Kecil', 'petty_cash', NULL, NULL, NULL, 50000000),
  ('BANK_BCA', 'Bank BCA', 'bank', 'BCA', '1234567890', 'PT. Kemika Karya Pratama', 500000000),
  ('BANK_MANDIRI', 'Bank Mandiri', 'bank', 'Mandiri', '0987654321', 'PT. Kemika Karya Pratama', 300000000);

-- Seed budget period for 2026
INSERT INTO public.budget_periods (year, name, start_date, end_date, is_active) VALUES
  (2026, 'Tahun Anggaran 2026', '2026-01-01', '2026-12-31', true);