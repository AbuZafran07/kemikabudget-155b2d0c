## Tujuan

Menambahkan role baru **`executive`** untuk BOD / CEO / Komisaris. Role ini bisa **menggunakan budget semua divisi** (pilih divisi manapun saat input Request, Cash Advance, Medical), tapi **tidak punya hak Approve, Pay, atau master-data**. User-nya sudah ada di sistem — Super Admin tinggal mengubah role-nya lewat Users page.

## Cakupan

### 1. Database
- Tambah nilai `'executive'` ke enum `public.app_role` (di posisi setelah `super_admin`, sebelum `finance`).
- Update semua SECURITY DEFINER helper functions yang melakukan cek "boleh lintas divisi" agar memasukkan `executive`:
  - `can_access_all_divisions(uid)` / `is_privileged_user(uid)` / fungsi sejenis yang dipakai RLS untuk requests, cash_advances, medical_claims, budget_ledger, dll.
  - Tambahkan policy SELECT/INSERT untuk role executive pada tabel `requests`, `cash_advances`, `medical_claims`, `request_attachments`, `request_events`, `approvals` (read-only) — INSERT diizinkan ke divisi manapun, UPDATE hanya untuk record miliknya sendiri saat masih `draft`.
- **Tidak** memberikan hak: approve, reject, pay, settle, edit master data, hapus data.

### 2. Auth & Hierarki
- `src/contexts/AuthContext.tsx`:
  - `AppRole` → `'super_admin' | 'executive' | 'finance' | 'admin' | 'user'`.
  - `roleHierarchy`: super_admin=5, executive=4, finance=3, admin=2, user=1.
  - `canAccessDivision`: tambahkan `executive` ke daftar yang akses semua divisi.
- `src/hooks/usePermissions.ts`:
  - `canEdit/canDelete/canCreate (master)/canApprove/canPay/canManageUsers/canManageMasterData` → semua **false** untuk executive (kecuali edit draft miliknya sendiri yang sudah ditangani di form-level).
  - Expose `isExecutive`.

### 3. Form Input (cross-division)
- `RequestForm.tsx` → `isPrivilegedUser = hasRoleOrHigher('admin')` sudah otomatis include executive karena posisi hierarki lebih tinggi. **Verifikasi** load divisi & budget jalan untuk executive (tidak hardcode skip).
- `CashAdvanceForm.tsx` → saat ini `divisionId = profile?.division_id` (terkunci). Ubah agar executive bisa memilih divisi (selector divisi seperti di RequestForm).
- `MedicalReimbursementForm.tsx` → cek serupa; medical biasanya per-employee, jadi executive boleh ajukan untuk diri sendiri (tetap pakai division_id sendiri) — **tidak diubah** kecuali user minta.

### 4. UI Visibility
- `AppSidebar.tsx`: executive melihat menu Dashboard, Requests, Cash Advance, Medical Reimbursement, Reports, Audit Logs (read). **Sembunyikan**: Approvals, Payment Queue, Petty Cash, Bank Payments, Budget Planning/Transfer, Master Data (Divisions, Categories, Funding, Users, Templates), Settings admin-only.
- Dashboard: tampilkan KPI semua divisi (sama seperti super_admin tapi tanpa "Pending Approvals to act on").
- Reports: aktifkan filter semua divisi untuk executive.
- `Users.tsx`: tambahkan opsi role `executive` di dropdown create/edit user (hanya super_admin yang lihat).

### 5. Tidak Diubah
- Workflow approval (executive tetap butuh super_admin/admin approve request mereka — sesuai prinsip segregation of duties).
- Logic budget deduction (tetap on approve), cash deduction (tetap on payment).
- Audit logs immutability.

## Detail Teknis

```text
Role hierarchy (UI only):
super_admin (5) ──► full control
executive   (4) ──► cross-division input + read-only semua data
finance     (3) ──► pay/settle/petty-cash
admin       (2) ──► approve dalam divisi
user        (1) ──► input dalam divisi sendiri
```

RLS pattern baru (contoh `requests`):
```sql
-- view: executive bisa lihat semua
CREATE POLICY "executive_view_all_requests"
ON public.requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'executive'));

-- insert: executive bisa insert ke divisi manapun selama dia requester
CREATE POLICY "executive_insert_requests"
ON public.requests FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'executive')
  AND requester_id = auth.uid()
);

-- update: hanya draft miliknya
CREATE POLICY "executive_update_own_draft"
ON public.requests FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'executive')
  AND requester_id = auth.uid()
  AND status = 'draft'
);
```

Helper function update:
```sql
CREATE OR REPLACE FUNCTION public.can_access_all_divisions(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_uid, 'super_admin')
      OR public.has_role(_uid, 'finance')
      OR public.has_role(_uid, 'executive');
$$;
```

## Langkah Implementasi

1. **Migrasi DB** — tambah enum value, update helper functions, tambah RLS policies untuk executive di tabel transaksi.
2. **Update AuthContext + usePermissions** — role baru di hierarki.
3. **Update CashAdvanceForm** — division selector untuk privileged user.
4. **Update AppSidebar + Users page dropdown** — visibility & opsi role.
5. **Smoke test** — buat 1 user dummy executive lewat Users page, verifikasi: bisa pilih divisi di Request form, tidak lihat menu Approvals/Payment.

## Catatan

User BOD/CEO/Komisaris sudah ada di database — Super Admin tinggal ubah role-nya menjadi `executive` di halaman **Users** setelah migrasi selesai.
