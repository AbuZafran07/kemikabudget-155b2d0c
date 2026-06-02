
-- 1. Helper: executive boleh akses semua divisi (read)
CREATE OR REPLACE FUNCTION public.can_access_division(_user_id uuid, _division_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'super_admin') OR
    public.has_role(_user_id, 'finance')     OR
    public.has_role(_user_id, 'executive')   OR
    public.get_user_division_id(_user_id) = _division_id
$$;

-- 2. Helper: executive boleh pakai budget divisi manapun (insert)
CREATE OR REPLACE FUNCTION public.can_use_division_budget(_user_id uuid, _division_id uuid, _category_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'executive')
    OR EXISTS (
      SELECT 1 WHERE _division_id = public.get_user_division_id(_user_id)
      UNION
      SELECT 1
      FROM public.cost_categories cc
      JOIN public.division_budgets db ON db.category_id = cc.id
      JOIN public.budget_periods bp ON bp.id = db.period_id
      WHERE cc.id = _category_id
        AND cc.is_public = true
        AND cc.is_active = true
        AND db.division_id = _division_id
        AND db.allocated_amount > db.used_amount
        AND bp.is_active = true
        AND bp.is_closed = false
    );
$$;

-- 3. Cash Advances: tambah policy INSERT untuk executive (lintas divisi)
DROP POLICY IF EXISTS "Executives can create cash advances in any division" ON public.cash_advances;
CREATE POLICY "Executives can create cash advances in any division"
ON public.cash_advances
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'executive')
  AND requester_id = auth.uid()
);

-- 4. Cash Advances: executive bisa update draft miliknya (lintas divisi)
DROP POLICY IF EXISTS "Executives can update own draft cash advances" ON public.cash_advances;
CREATE POLICY "Executives can update own draft cash advances"
ON public.cash_advances
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'executive')
  AND requester_id = auth.uid()
  AND status = 'draft'::cash_advance_status
  AND is_locked = false
)
WITH CHECK (
  public.has_role(auth.uid(), 'executive')
  AND requester_id = auth.uid()
  AND status = 'draft'::cash_advance_status
);
