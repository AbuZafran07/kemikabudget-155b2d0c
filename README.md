# Budget Expense

terlampir untuk logo perusahaan dan Icon untuk aplikasinya di gambar 2
gambar 3 - 5 rekomendasi tampilan login dan halaman utama

You are a senior full-stack engineer, enterprise software architect, finance system analyst,
security engineer, and professional product designer.

Your task:
Build a PRODUCTION-READY ENTERPRISE APPLICATION for internal corporate use.

Company:
PT. KEMIKA KARYA PRATAMA

Application Name:
EXPENSE BUDGET & APPROVAL SYSTEM

=====================================================================
1. CORE OBJECTIVE
=====================================================================
Build a modern, secure, finance-grade budget control system that:
- Is used by ALL divisions in ONE application
- Strictly isolates data per division
- Uses SINGLE DATA ENTRY (no double input anywhere)
- Enforces approval-based budget deduction
- Enforces payment-based cash deduction
- Is audit-ready, secure, and scalable
- Produces office-style A4 PDF documents
- Supports Desktop + Mobile + PWA
- Is NOT indexable by search engines

=====================================================================
2. ABSOLUTE RULES (NON-NEGOTIABLE)
=====================================================================
A) SINGLE ENTRY
- Users input expense data ONLY ONCE in “Requests”.
- No separate input in Petty Cash or Bank.
- Payment modules auto-post from approved requests.

B) FINANCE LOGIC SEPARATION
- Budget is reduced ONLY when APPROVED.
- Cash is reduced ONLY when PAID.
- NEVER deduct budget during payment.

C) SECURITY
- All authorization is SERVER-SIDE.
- Block IDOR (cannot access by guessing IDs).
- No public pages.
- No SEO indexing (meta + headers).

D) DATA INTEGRITY
- Approval, Payment, Budget Transfer MUST be DB transactions.
- No partial updates.
- Immutable records after approval.

=====================================================================
3. USER ROLES & ACCESS CONTROL
=====================================================================
ROLES:
1) super_admin
2) finance
3) admin (division admin)
4) user

ROLE RULES:

SUPER ADMIN:
- Full access across all divisions
- Create/edit budgets
- Approve / Reject requests
- Pay / Settle payments
- Approve budget transfers
- Manage users & divisions
- Manage closing periods
- Revoke user sessions
- MUST use OTP at login

FINANCE:
- View APPROVED requests across divisions
- Access Payment Queue
- Execute payments
- Manage Petty Cash & Bank Payments
- Perform cash reconcile
- Export reports
- CANNOT approve requests

ADMIN (DIVISION):
- View division data only
- Optional review (submitted → under_review)
- Cannot approve or pay

USER:
- Create/edit drafts
- Submit requests
- View division requests only
- Cannot approve or pay

ROW-LEVEL SECURITY:
- If NOT super_admin or finance:
  user.division_id MUST MATCH record.division_id

=====================================================================
4. MAIN WORKFLOW (LOCKED & FINAL)
=====================================================================
REQUEST STATUS FLOW:

draft
→ submitted
→ under_review (optional)
→ approved  → (BUDGET DEDUCTED)
→ paid      → (CASH DEDUCTED)
→ settled

Other:
- rejected
- cancelled

RULES:
- Request becomes READ-ONLY after approval
- Payment cannot occur twice
- Cannot pay without approval
- Cannot edit financial fields after approval

=====================================================================
5. MENU STRUCTURE (ENTERPRISE STYLE)
=====================================================================
SUMMARY
- Dashboard

TRANSACTIONS
- Requests
- Approvals (Super Admin only) [badge: pending]

FINANCE
- Payment Queue [badge: to pay]
- Petty Cash
- Bank Payments

PLANNING
- Budget Planning
- Budget Transfer

MASTER DATA
- Divisions
- Cost Categories
- Funding Sources
- Users
- Settings

REPORTS
- Reports
- Audit Logs

=====================================================================
6. DASHBOARD (MANDATORY & ROLE-AWARE)
=====================================================================
SUPER ADMIN DASHBOARD:
KPIs:
- Total Budget (year)
- Remaining Budget
- Actual Paid
- Pending Approvals
- Pending Payments
- Overdue Approvals
- Overdue Payments

Widgets:
- Pending Approvals list (latest 10, clickable)
- To Pay list (latest 10, clickable)
- Charts:
  - Spend by Category
  - Budget vs Used vs Remaining

DIVISION DASHBOARD:
- Allocated Budget
- Remaining Budget
- My Pending Requests
- Approved Requests
- Recent Requests list (clickable)

Quick Action:
- Desktop: “Create Request”
- Mobile: Floating Action Button

=====================================================================
7. TABLE LIST BEHAVIOR (ALL LISTS)
=====================================================================
ALL tables MUST have:
- Search
- Sort
- Filter
- SERVER-SIDE pagination

Pagination footer:
- “Menampilkan X–Y dari Z data”
- Previous | Page Numbers | Next
- Page size: 10 / 25 / 50
- Reset page on filter/search change
- URL state persistence

Mobile:
- Compact pagination
- NO horizontal scrolling

=====================================================================
8. REQUEST FORM (SINGLE ENTRY)
=====================================================================
FIELDS:
- Division (auto, locked)
- Request Date (auto)
- Needed Date
- Category (required)
- Description (required)
- Vendor
- Amount IDR (>0)
- Funding Source (Petty Cash / Bank)
- Payment Method
- Notes
- Beneficiary (Bank only):
  name, bank, account, email
- Attachments (multi):
  quotation / invoice / receipt / other

FEATURES:
- Draft autosave every 10–20s
- Restore draft on reload
- Duplicate request button (copy to new draft)

=====================================================================
9. APPROVAL MODULE
=====================================================================
- List with filters + pagination
- Soft lock:
  lock request 2 minutes when opened
- Approval limit:
  If amount > 50,000,000:
    - Mandatory approval note
    - Mandatory invoice or quotation
- Approve (transaction):
  - Check remaining budget
  - Insert approval record
  - Insert budget_movements(deduct)
  - Lock request
- Reject:
  - Mandatory rejection reason

Timeline Activity Log:
- Created
- Submitted
- Approved/Rejected
- Paid
- Settled
- Attachments added
- Transfers

=====================================================================
10. AGING & SLA CONTROL
=====================================================================
Settings:
- approval_sla_days (default 3)
- payment_sla_days (default 3)

Overdue:
- Approval overdue badge
- Payment overdue badge
- Dashboard counters
- Quick filters

=====================================================================
11. PAYMENT QUEUE (FINANCE)
=====================================================================
Shows approved & unpaid requests.

PAY RULES:
- Attachment checklist:
  Before Pay: invoice OR quotation
  Before Settle: invoice OR receipt
- Override allowed with reason (audit)

PAY ACTION:
- 1 click pay
- Petty Cash → auto petty_cash_transaction(out)
- Bank → auto bank_payment (prefill beneficiary)
- Upload proof
- Status = paid

SETTLE:
- Checklist satisfied
- Status = settled

Prevent double payment via unique constraint.

=====================================================================
12. PETTY CASH MODULE
=====================================================================
- Wallet balance
- Auto transactions from payment
- Manual top-up
- Threshold warning
- Reconcile:
  physical cash vs system cash
  variance logged
  audit trail

=====================================================================
13. BANK PAYMENTS & BATCH
=====================================================================
- Bank payment list
- Batch payment:
  select multiple requests
  create batch
  export CSV
- Audit Pack export:
  PDF + attachments + approval + payment + timeline

=====================================================================
14. BUDGET PLANNING & TRANSFER
=====================================================================
Budget Planning:
- Per division, per category, per year
- Excel import/export

Budget Transfer:
- Draft → Submit → Approve
- Super Admin approval
- Two adjust movements
- Full audit

=====================================================================
15. EMAIL NOTIFICATIONS (ASYNC)
=====================================================================
Events:
- Submitted → Super Admin
- Approved / Rejected → Requester + Admin
- Paid / Settled → Requester
- Transfer Approved → Admin

Implementation:
- notification_jobs queue
- Retry logic
- Bilingual templates
- DEV/STAGING redirect to test inbox only

=====================================================================
16. ENVIRONMENT SEPARATION
=====================================================================
ENV:
- DEV
- STAGING
- PROD

Rules:
- Separate DB, storage, email sender
- STAGING badge visible
- STAGING cannot send real emails
- ENV controlled by APP_ENV

=====================================================================
17. DISASTER RECOVERY
=====================================================================
- Daily DB backup
- Encrypted backups
- Attachment backup
- Monthly restore test to STAGING
- RPO: 24h
- RTO: 4h
- Log emergency actions

=====================================================================
18. SECURITY HARDENING
=====================================================================
- Security headers (HSTS, CSP, XFO, nosniff, noindex)
- Rate limit login, OTP, export, PDF
- OTP for Super Admin
- Session management:
  view & revoke sessions
- Signed attachment URLs
- Mask bank account numbers
- Append-only audit logs
- Transaction-safe DB operations

=====================================================================
19. DATABASE (POSTGRES)
=====================================================================
Tables include:
- divisions, users, user_preferences
- budget_periods, budget_accounts, division_budgets
- funding_sources, bank_accounts
- requests
- request_attachments
- approvals
- request_events
- budget_movements
- petty_cash_wallets
- petty_cash_transactions
- cash_reconciliations
- bank_payments
- payment_batches, batch_items
- budget_transfers
- notification_jobs
- audit_logs
- app_settings
- saved_views
- closing_periods
- user_sessions

Seed:
- Divisions: HRGA, FIN, MKT, SALES_GOV, TECH_SALES, PUR, WH
- Categories: TRAVEL, OFFICE, TRAINING, MAINT, LOG, ENT, UTIL, MISC
- Funding: PETTY_CASH, BANK_BCA, BANK_MANDIRI
- Default Super Admin:
  ferry@kemika.co.id / Ksatria2312

=====================================================================
20. FINAL DELIVERY
=====================================================================
Deliver a COMPLETE, WORKING, ENTERPRISE-GRADE application with:
- Minimal bugs
- Strict validation
- Finance-safe logic
- Secure PDF generation
- Responsive UI
- PWA support
- No public indexing

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kemikabudget.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9347cc37-04c7-467c-bf44-7179c0f6af58).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
