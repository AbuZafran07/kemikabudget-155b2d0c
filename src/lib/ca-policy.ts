/**
 * Aturan kebijakan Cash Advance (sisi klien).
 *
 * Penegakan sebenarnya ada di database (trigger `guard_ca_policy_on_submit` dan
 * `guard_ca_settlement_attachments`). Fungsi di sini hanya untuk menampilkan
 * peringatan lebih awal di UI, dengan perhitungan yang sama:
 * - "hari ini" memakai zona waktu kantor (Asia/Jakarta)
 * - batas pengajuan  = tanggal mulai kegiatan - min_lead_days
 * - jatuh tempo laporan = tanggal selesai kegiatan + settlement_due_days
 * - laporan dianggap disampaikan bila ada realisasi berstatus submitted/approved
 */

export interface CaPolicySettings {
  min_lead_days: number;
  settlement_due_days: number;
  enforce_lead_time: boolean;
  block_on_overdue_settlement: boolean;
  require_settlement_attachment: boolean;
  /** Daftar Nominatif Entertainment wajib untuk pos bertanda requires_nominative */
  require_entertainment_nominative: boolean;
  company_legal_name: string;
  company_npwp: string;
}

export const DEFAULT_CA_POLICY: CaPolicySettings = {
  min_lead_days: 14,
  settlement_due_days: 7,
  enforce_lead_time: true,
  block_on_overdue_settlement: true,
  require_settlement_attachment: true,
  require_entertainment_nominative: true,
  company_legal_name: "PT KEMIKA KARYA PRATAMA",
  company_npwp: "71.608.326.6-416.000",
};

export const CA_SETTLEMENT_ATTACHMENT_BUCKET = "ca-settlement-attachments";

export const CA_SETTLEMENT_ATTACHMENT_TYPES = [
  { value: "receipt", id: "Nota / Kuitansi", en: "Receipt / Invoice" },
  { value: "transfer_proof", id: "Bukti Transfer", en: "Transfer Proof" },
  { value: "qris_proof", id: "Bukti QRIS", en: "QRIS Proof" },
  { value: "stamped_receipt", id: "Tanda Terima Bermeterai", en: "Stamped Receipt" },
  { value: "recipient_proof", id: "Bukti Penerima", en: "Recipient Proof" },
  { value: "other", id: "Lainnya", en: "Other" },
] as const;

export type CaSettlementAttachmentType = (typeof CA_SETTLEMENT_ATTACHMENT_TYPES)[number]["value"];

/** Tanggal hari ini (YYYY-MM-DD) menurut zona waktu Asia/Jakarta. */
export function jakartaToday(now: Date = new Date()): string {
  // en-CA menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Tambah/kurang hari pada tanggal YYYY-MM-DD tanpa terpengaruh zona waktu browser. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Selisih hari (a - b) untuk dua tanggal YYYY-MM-DD. */
export function diffDays(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

/** Tanggal mulai kegiatan paling awal yang masih boleh diajukan hari ini. */
export function earliestActivityStart(policy: CaPolicySettings, today: string = jakartaToday()): string {
  return policy.enforce_lead_time ? addDays(today, policy.min_lead_days) : today;
}

export interface ActivityDateCheck {
  ok: boolean;
  /** Pesan untuk ditampilkan; null bila valid. */
  message: string | null;
  /** Batas terakhir pengajuan (YYYY-MM-DD) bila tanggal mulai sudah diisi. */
  submitDeadline: string | null;
}

export function checkActivityDates(
  start: string | null | undefined,
  end: string | null | undefined,
  policy: CaPolicySettings,
  language: "id" | "en" = "id",
  today: string = jakartaToday(),
): ActivityDateCheck {
  const en = language === "en";
  if (!start || !end) {
    return {
      ok: false,
      message: en ? "Activity start and end dates are required." : "Tanggal mulai dan selesai kegiatan wajib diisi.",
      submitDeadline: start ? addDays(start, -policy.min_lead_days) : null,
    };
  }
  if (end < start) {
    return {
      ok: false,
      message: en ? "Activity end date cannot be before the start date." : "Tanggal selesai kegiatan tidak boleh sebelum tanggal mulai.",
      submitDeadline: addDays(start, -policy.min_lead_days),
    };
  }
  const submitDeadline = addDays(start, -policy.min_lead_days);
  if (policy.enforce_lead_time && today > submitDeadline) {
    return {
      ok: false,
      message: en
        ? `Cash advances must be submitted at least ${policy.min_lead_days} calendar days before the activity (deadline ${formatIsoDate(submitDeadline)}). Late submissions cannot be processed.`
        : `CA wajib diajukan paling lambat ${policy.min_lead_days} hari kalender sebelum kegiatan (batas ${formatIsoDate(submitDeadline)}). Pengajuan terlambat tidak dapat diproses.`,
      submitDeadline,
    };
  }
  return { ok: true, message: null, submitDeadline };
}

export type SettlementDeadlineState = "not_applicable" | "pending" | "due_today" | "overdue" | "reported";

export interface SettlementDeadlineInfo {
  state: SettlementDeadlineState;
  dueDate: string | null;
  /** Positif = terlambat sekian hari; negatif = sisa hari. null bila tidak berlaku. */
  daysOverdue: number | null;
}

const FUNDED_STATUSES = ["paid", "partially_settled"];
const REPORTED_SETTLEMENT_STATUSES = ["submitted", "approved"];

export function getSettlementDeadline(
  ca: { status: string; activity_end_date?: string | null },
  settlements: { status: string }[] | null | undefined,
  policy: CaPolicySettings,
  today: string = jakartaToday(),
): SettlementDeadlineInfo {
  if (!ca.activity_end_date) return { state: "not_applicable", dueDate: null, daysOverdue: null };
  const dueDate = addDays(ca.activity_end_date, policy.settlement_due_days);
  const reported =
    ca.status === "settled" ||
    (settlements || []).some((s) => REPORTED_SETTLEMENT_STATUSES.includes(s.status));
  if (reported) return { state: "reported", dueDate, daysOverdue: null };
  if (!FUNDED_STATUSES.includes(ca.status)) return { state: "not_applicable", dueDate, daysOverdue: null };
  const daysOverdue = diffDays(today, dueDate);
  if (daysOverdue > 0) return { state: "overdue", dueDate, daysOverdue };
  if (daysOverdue === 0) return { state: "due_today", dueDate, daysOverdue };
  return { state: "pending", dueDate, daysOverdue };
}

/** Format YYYY-MM-DD menjadi DD-MM-YYYY (sama dengan pesan dari database). */
export function formatIsoDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "-";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}
