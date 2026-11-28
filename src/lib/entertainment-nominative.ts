/**
 * Daftar Nominatif Biaya Entertainment (format Lampiran SPT).
 *
 * Aturan kelengkapan ditegakkan di database (fungsi `entertainment_nominative_status`
 * dan trigger penjaga). Fungsi di sini hanya untuk tampilan/validasi awal di form,
 * dengan perhitungan yang sama.
 */

export const ENTERTAINMENT_NOMINATIVE_BUCKET = "entertainment-nominatives";

export interface NominativeEntryInput {
  /** id lokal untuk key React (bukan id database) */
  key: string;
  entry_date: string;
  place: string;
  address: string;
  entertainment_type: string;
  amount: number;
  recipient_name: string;
  recipient_position: string;
  recipient_company: string;
  recipient_business_type: string;
  notes: string;
}

export interface NominativeEntryRow {
  id: string;
  nominative_id: string;
  line_no: number;
  entry_date: string;
  place: string;
  address: string;
  entertainment_type: string;
  amount: number;
  recipient_name: string;
  recipient_position: string;
  recipient_company: string;
  recipient_business_type: string;
  notes: string | null;
}

export interface NominativeHeaderRow {
  id: string;
  settlement_id: string | null;
  request_id: string | null;
  cash_advance_id: string | null;
  signer_name: string;
  signer_city: string;
  signed_date: string | null;
  signed_file_name: string | null;
  signed_file_path: string | null;
  signed_file_type: string | null;
  signed_file_size: number | null;
  signed_uploaded_at: string | null;
  created_by: string;
}

export interface NominativeStatus {
  required: boolean;
  required_amount: number;
  entries_total: number;
  entry_count: number;
  has_signed_file: boolean;
  signed_outdated: boolean;
  missing_category: boolean;
  is_complete: boolean;
}

export type NominativeSource = { settlementId: string; requestId?: undefined } | { requestId: string; settlementId?: undefined };

export const NOMINATIVE_REQUIRED_FIELDS: { field: keyof NominativeEntryInput; id: string; en: string }[] = [
  { field: "entry_date", id: "Tanggal", en: "Date" },
  { field: "place", id: "Tempat", en: "Place" },
  { field: "address", id: "Alamat", en: "Address" },
  { field: "entertainment_type", id: "Jenis", en: "Type" },
  { field: "amount", id: "Jumlah", en: "Amount" },
  { field: "recipient_name", id: "Nama", en: "Name" },
  { field: "recipient_position", id: "Posisi", en: "Position" },
  { field: "recipient_company", id: "Nama Perusahaan/Instansi", en: "Company/Institution" },
  { field: "recipient_business_type", id: "Jenis Usaha", en: "Business Type" },
];

export function emptyNominativeEntry(defaultDate: string): NominativeEntryInput {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entry_date: defaultDate,
    place: "",
    address: "",
    entertainment_type: "",
    amount: 0,
    recipient_name: "",
    recipient_position: "",
    recipient_company: "",
    recipient_business_type: "",
    notes: "",
  };
}

export function entryFromRow(row: NominativeEntryRow): NominativeEntryInput {
  return {
    key: row.id,
    entry_date: row.entry_date,
    place: row.place,
    address: row.address,
    entertainment_type: row.entertainment_type,
    amount: Number(row.amount),
    recipient_name: row.recipient_name,
    recipient_position: row.recipient_position,
    recipient_company: row.recipient_company,
    recipient_business_type: row.recipient_business_type,
    notes: row.notes || "",
  };
}

/** Daftar kolom wajib yang masih kosong pada satu baris. */
export function missingEntryFields(entry: NominativeEntryInput): (keyof NominativeEntryInput)[] {
  return NOMINATIVE_REQUIRED_FIELDS.filter(({ field }) => {
    if (field === "amount") return !(Number(entry.amount) > 0);
    return !String(entry[field] ?? "").trim();
  }).map(({ field }) => field);
}

export function sumEntries(entries: { amount: number }[]): number {
  return roundRupiah(entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
}

export function roundRupiah(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nominal pos Entertainment pada realisasi CA (sama dengan perhitungan database):
 * - CA hanya punya satu pos (dan pos itu Entertainment): seluruh realisasi
 * - CA punya beberapa pos: hanya baris realisasi yang dipilih pos Entertainment
 */
export function settlementNominativeRequirement(
  caCategoryIds: string[],
  nominativeCategoryIds: Set<string>,
  items: { category_id: string | null | undefined; amount: number }[],
): { required: boolean; requiredAmount: number; missingCategory: boolean } {
  const distinct = Array.from(new Set(caCategoryIds.filter(Boolean)));
  const hasEnt = distinct.some((id) => nominativeCategoryIds.has(id));
  if (!hasEnt) return { required: false, requiredAmount: 0, missingCategory: false };
  if (distinct.length === 1) {
    const amount = sumEntries(items);
    return { required: amount > 0, requiredAmount: amount, missingCategory: false };
  }
  const missingCategory = items.some((item) => !item.category_id);
  const amount = sumEntries(items.filter((item) => item.category_id && nominativeCategoryIds.has(item.category_id)));
  return { required: amount > 0, requiredAmount: amount, missingCategory };
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

/** YYYY-MM-DD -> DD/MM/YYYY */
export function formatNominativeDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** YYYY-MM-DD -> "27 November 2026" */
export function formatLongDateId(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}
