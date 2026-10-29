CREATE OR REPLACE FUNCTION public.guard_ca_item_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_status public.cash_advance_status;
BEGIN
 IF TG_OP='UPDATE' AND NEW.cash_advance_id IS DISTINCT FROM OLD.cash_advance_id THEN RAISE EXCEPTION 'Rincian tidak dapat dipindah ke CA lain'; END IF;
 v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.cash_advance_id ELSE NEW.cash_advance_id END;
 SELECT status INTO v_status FROM public.cash_advances WHERE cash_advances.id=v_id FOR UPDATE;
 IF v_status IS NOT NULL AND v_status<>'draft' AND NOT (TG_OP='DELETE' AND public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'Rincian CA yang sudah diajukan tidak dapat diubah'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;