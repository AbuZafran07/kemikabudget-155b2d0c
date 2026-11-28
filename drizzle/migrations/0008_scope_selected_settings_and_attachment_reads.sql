ALTER POLICY "Authenticated can view budget release settings" ON public.budget_release_settings TO authenticated USING (
  id = true AND (select public.check_session_valid()) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active
  )
);
ALTER POLICY "Authenticated can read CA policy settings" ON public.ca_policy_settings TO authenticated USING (
  id = true AND (select public.check_session_valid()) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active
  )
);
ALTER POLICY "CA settlement attachments: view" ON storage.objects TO authenticated USING (
  bucket_id = 'ca-settlement-attachments' AND (select public.check_session_valid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active)
  AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.cash_advance_settlement_attachments a
      JOIN public.cash_advances ca ON ca.id = a.cash_advance_id
      WHERE a.file_path = objects.name
        AND public.can_access_division((select auth.uid()), ca.division_id)
    )
  )
);
ALTER POLICY "Entertainment nominative files: view" ON storage.objects TO authenticated USING (
  bucket_id = 'entertainment-nominatives' AND (select public.check_session_valid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active)
  AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.entertainment_nominatives h
      WHERE h.signed_file_path = objects.name AND (
        EXISTS (SELECT 1 FROM public.requests r WHERE r.id = h.request_id
          AND public.can_access_division((select auth.uid()), r.division_id))
        OR EXISTS (
          SELECT 1 FROM public.cash_advance_settlements s
          JOIN public.cash_advances ca ON ca.id = s.cash_advance_id
          WHERE s.id = h.settlement_id
            AND public.can_access_division((select auth.uid()), ca.division_id)
        )
      )
    )
  )
);
ALTER POLICY "Users can view referenced medical attachments" ON storage.objects TO authenticated USING (
  bucket_id = 'medical-attachments' AND (select public.check_session_valid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.is_active)
  AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.medical_claim_attachments a
      JOIN public.medical_claims c ON c.id = a.claim_id
      WHERE a.file_path = objects.name AND (
        c.employee_id = (select auth.uid())
        OR (select public.has_role((select auth.uid()), 'super_admin'))
        OR (select public.has_role((select auth.uid()), 'finance'))
        OR ((select public.has_role((select auth.uid()), 'admin')) AND EXISTS (
          SELECT 1 FROM public.divisions d
          WHERE d.id = (select public.get_user_division_id((select auth.uid()))) AND d.code = 'HRGA'
        ))
      )
    )
  )
);