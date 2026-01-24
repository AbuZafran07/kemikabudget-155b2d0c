
-- Create document_templates table for storing PDF template settings
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE, -- 'pengajuan_dana', 'receipt', 'report'
  
  -- Header settings
  header_company_name TEXT NOT NULL DEFAULT 'PT. KEMIKA KARYA PRATAMA',
  header_address TEXT DEFAULT 'Jakarta, Indonesia',
  header_phone TEXT DEFAULT '',
  header_email TEXT DEFAULT '',
  header_logo_url TEXT DEFAULT '',
  show_header BOOLEAN NOT NULL DEFAULT true,
  
  -- Footer settings
  footer_text TEXT DEFAULT 'Dokumen ini digenerate secara otomatis oleh sistem.',
  footer_page_number BOOLEAN NOT NULL DEFAULT true,
  show_footer BOOLEAN NOT NULL DEFAULT true,
  
  -- Document number format settings
  -- Placeholders: {YYYY}, {YY}, {MM}, {DD}, {DIV}, {SEQ}, {SEQ2}, {SEQ3}, {SEQ4}
  number_format TEXT NOT NULL DEFAULT 'PD/{DIV}/{YYYY}/{SEQ4}',
  number_prefix TEXT DEFAULT 'PD',
  reset_sequence_yearly BOOLEAN NOT NULL DEFAULT true,
  reset_sequence_monthly BOOLEAN NOT NULL DEFAULT false,
  
  -- Watermark settings
  draft_watermark_text TEXT NOT NULL DEFAULT 'DRAFT',
  draft_watermark_opacity NUMERIC NOT NULL DEFAULT 0.15,
  show_draft_watermark BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create document_sequences table for tracking document numbers per division/year
CREATE TABLE public.document_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL,
  division_id UUID REFERENCES public.divisions(id),
  year INTEGER NOT NULL,
  month INTEGER, -- NULL if not monthly reset
  current_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicate sequences
  UNIQUE(template_type, division_id, year, month)
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_templates
CREATE POLICY "Authenticated users can view templates"
  ON public.document_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage templates"
  ON public.document_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid"
  ON public.document_templates FOR ALL
  USING (check_session_valid())
  WITH CHECK (check_session_valid());

-- RLS Policies for document_sequences
CREATE POLICY "Authenticated users can view sequences"
  ON public.document_sequences FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage sequences"
  ON public.document_sequences FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "session_must_be_valid"
  ON public.document_sequences FOR ALL
  USING (check_session_valid())
  WITH CHECK (check_session_valid());

-- Function to get next document number with transaction lock
CREATE OR REPLACE FUNCTION public.get_next_document_number(
  p_template_type TEXT,
  p_division_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template document_templates%ROWTYPE;
  v_sequence document_sequences%ROWTYPE;
  v_year INTEGER;
  v_month INTEGER;
  v_next_seq INTEGER;
  v_division_code TEXT;
  v_result TEXT;
BEGIN
  -- Get template settings
  SELECT * INTO v_template FROM document_templates WHERE template_type = p_template_type;
  
  IF v_template IS NULL THEN
    -- Use defaults if no template exists
    v_template.number_format := 'PD/{DIV}/{YYYY}/{SEQ4}';
    v_template.reset_sequence_yearly := true;
    v_template.reset_sequence_monthly := false;
  END IF;
  
  -- Get current year and month
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month := CASE WHEN v_template.reset_sequence_monthly THEN EXTRACT(MONTH FROM NOW())::INTEGER ELSE NULL END;
  
  -- Get division code
  SELECT code INTO v_division_code FROM divisions WHERE id = p_division_id;
  IF v_division_code IS NULL THEN
    v_division_code := 'GEN';
  END IF;
  
  -- Lock and get/create sequence record
  SELECT * INTO v_sequence 
  FROM document_sequences 
  WHERE template_type = p_template_type 
    AND division_id = p_division_id 
    AND year = v_year
    AND (month IS NOT DISTINCT FROM v_month)
  FOR UPDATE;
  
  IF v_sequence IS NULL THEN
    -- Create new sequence record
    INSERT INTO document_sequences (template_type, division_id, year, month, current_sequence)
    VALUES (p_template_type, p_division_id, v_year, v_month, 1)
    RETURNING * INTO v_sequence;
    v_next_seq := 1;
  ELSE
    -- Increment sequence
    v_next_seq := v_sequence.current_sequence + 1;
    UPDATE document_sequences 
    SET current_sequence = v_next_seq, updated_at = NOW()
    WHERE id = v_sequence.id;
  END IF;
  
  -- Build document number from format
  v_result := v_template.number_format;
  v_result := REPLACE(v_result, '{YYYY}', v_year::TEXT);
  v_result := REPLACE(v_result, '{YY}', RIGHT(v_year::TEXT, 2));
  v_result := REPLACE(v_result, '{MM}', LPAD(EXTRACT(MONTH FROM NOW())::TEXT, 2, '0'));
  v_result := REPLACE(v_result, '{DD}', LPAD(EXTRACT(DAY FROM NOW())::TEXT, 2, '0'));
  v_result := REPLACE(v_result, '{DIV}', v_division_code);
  v_result := REPLACE(v_result, '{SEQ}', v_next_seq::TEXT);
  v_result := REPLACE(v_result, '{SEQ2}', LPAD(v_next_seq::TEXT, 2, '0'));
  v_result := REPLACE(v_result, '{SEQ3}', LPAD(v_next_seq::TEXT, 3, '0'));
  v_result := REPLACE(v_result, '{SEQ4}', LPAD(v_next_seq::TEXT, 4, '0'));
  
  RETURN v_result;
END;
$$;

-- Insert default template for pengajuan_dana
INSERT INTO public.document_templates (
  template_type,
  header_company_name,
  header_address,
  number_format,
  number_prefix,
  draft_watermark_text
) VALUES (
  'pengajuan_dana',
  'PT. KEMIKA KARYA PRATAMA',
  'Jakarta, Indonesia',
  'PD/{DIV}/{YYYY}/{SEQ4}',
  'PD',
  'DRAFT'
);

-- Trigger for updated_at
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_document_sequences_updated_at
  BEFORE UPDATE ON public.document_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
