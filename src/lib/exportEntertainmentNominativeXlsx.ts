import { buildXlsx, downloadXlsx, type XlsxCell, type XlsxSheet, type XlsxStyle } from "@/lib/xlsxWriter";
import { formatLongDateId, sumEntries } from "@/lib/entertainment-nominative";

export interface NominativeReportRow {
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
  source_number?: string | null;
}

export interface NominativeReportOptions {
  companyName: string;
  npwp: string;
  taxYear: number;
  signerCity: string;
  /** YYYY-MM-DD */
  signedDate: string;
  signerName?: string;
  /** tambahkan kolom L "NO. DOKUMEN" (untuk arsip internal) */
  includeSourceColumn?: boolean;
}

const title: XlsxStyle = { bold: true, size: 14 };
const head: XlsxStyle = { bold: true, size: 11, border: true, align: "center", vAlign: "center", wrap: true, fill: "EBEBEB" };
const text: XlsxStyle = { size: 10, border: true, vAlign: "top", wrap: true };
const center: XlsxStyle = { ...text, align: "center" };
const date: XlsxStyle = { ...center, numFmt: "date" };
const money: XlsxStyle = { ...text, align: "right", numFmt: "number" };
const totalLabel: XlsxStyle = { bold: true, size: 12, border: true, align: "center", fill: "EBEBEB" };
const totalMoney: XlsxStyle = { bold: true, size: 12, border: true, align: "right", numFmt: "number", fill: "EBEBEB" };
const plain: XlsxStyle = { size: 11 };

/** Susun sheet "Lampiran SPT" sesuai format Daftar Nominatif perusahaan. */
export function buildNominativeReportSheet(rows: NominativeReportRow[], opt: NominativeReportOptions): XlsxSheet {
  const lastCol = opt.includeSourceColumn ? 11 : 10; // indeks kolom terakhir (K=10, L=11)
  const blankBordered = (): XlsxCell => ({ value: "", style: head });
  const sheetRows: (XlsxCell | null)[][] = [];

  sheetRows[0] = [{ value: opt.companyName.toUpperCase(), style: title }];
  sheetRows[1] = [{ value: "DAFTAR NOMINATIF BIAYA ENTERTAINMENT DAN SEJENISNYA", style: title }];
  sheetRows[2] = [{ value: "NPWP", style: { bold: true, size: 12 } }, null, { value: `: ${opt.npwp}`, style: { bold: true, size: 12 } }];
  sheetRows[3] = [{ value: "Tahun Pajak", style: { bold: true, size: 12 } }, null, { value: `: ${opt.taxYear}`, style: { bold: true, size: 12 } }];

  // Baris 5-6: judul kolom bertingkat
  const r5: (XlsxCell | null)[] = [];
  const r6: (XlsxCell | null)[] = [];
  for (let c = 0; c <= lastCol; c++) {
    r5[c] = blankBordered();
    r6[c] = blankBordered();
  }
  r5[0] = { value: "NO.", style: head };
  r5[1] = { value: "PEMBERI ENTERTAINMENT DAN SEJENISNYA", style: head };
  r5[6] = { value: "RELASI USAHA YANG DIBERIKAN ENTERTAINMENT", style: head };
  r5[10] = { value: "KETERANGAN", style: head };
  ["TANGGAL", "TEMPAT", "ALAMAT", "JENIS", "JUMLAH (Rp)", "NAMA", "POSISI", "NAMA PERUSAHAAN/INSTANSI", "JENIS USAHA"].forEach((h, i) => {
    r6[i + 1] = { value: h, style: head };
  });
  if (opt.includeSourceColumn) r5[11] = { value: "NO. DOKUMEN", style: head };
  sheetRows[4] = r5;
  sheetRows[5] = r6;

  const firstData = 6; // indeks baris 0-based (= baris Excel 7)
  rows.forEach((row, i) => {
    const cells: XlsxCell[] = [
      { value: i + 1, style: center },
      { value: { date: row.entry_date }, style: date },
      { value: row.place, style: text },
      { value: row.address, style: text },
      { value: row.entertainment_type, style: text },
      { value: Number(row.amount), style: money },
      { value: row.recipient_name, style: text },
      { value: row.recipient_position, style: text },
      { value: row.recipient_company, style: text },
      { value: row.recipient_business_type, style: text },
      { value: row.notes || "", style: text },
    ];
    if (opt.includeSourceColumn) cells.push({ value: row.source_number || "", style: text });
    sheetRows[firstData + i] = cells;
  });

  const totalIdx = firstData + Math.max(rows.length, 1);
  if (rows.length === 0) {
    const empty: XlsxCell[] = [];
    for (let c = 0; c <= lastCol; c++) empty[c] = { value: "", style: text };
    empty[2] = { value: "Tidak ada data", style: text };
    sheetRows[firstData] = empty;
  }
  const totalRow: XlsxCell[] = [];
  for (let c = 0; c <= lastCol; c++) totalRow[c] = { value: "", style: totalLabel };
  totalRow[0] = { value: "TOTAL", style: totalLabel };
  totalRow[5] = {
    value: { formula: `SUM(F${firstData + 1}:F${totalIdx})`, cached: sumEntries(rows) },
    style: totalMoney,
  };
  sheetRows[totalIdx] = totalRow;

  const signIdx = totalIdx + 2;
  const signCol = 8; // kolom I
  sheetRows[signIdx] = [];
  sheetRows[signIdx][signCol] = { value: `${opt.signerCity || "Jakarta"}, ${formatLongDateId(opt.signedDate)}`, style: plain };
  sheetRows[signIdx + 6] = [];
  sheetRows[signIdx + 6][signCol] = {
    value: `( ${opt.signerName?.trim() || "....................................."} )`,
    style: plain,
  };

  // isi lubang array agar setiap baris terdefinisi
  for (let r = 0; r < sheetRows.length; r++) if (!sheetRows[r]) sheetRows[r] = [];

  const merges = ["B5:F5", "G5:J5", "A5:A6", "K5:K6", `A${totalIdx + 1}:E${totalIdx + 1}`];
  if (opt.includeSourceColumn) merges.push("L5:L6");

  return {
    name: "Lampiran SPT",
    rows: sheetRows,
    merges,
    columnWidths: [5.5, 13, 24, 34, 34, 16, 22, 22, 28, 22, 30, ...(opt.includeSourceColumn ? [26] : [])],
    rowHeights: { 4: 22, 5: 32, [totalIdx]: 24 },
    landscape: true,
    fontName: "Tahoma",
  };
}

export function buildNominativeReportXlsx(rows: NominativeReportRow[], opt: NominativeReportOptions): Uint8Array {
  return buildXlsx(buildNominativeReportSheet(rows, opt));
}

export function downloadNominativeReportXlsx(rows: NominativeReportRow[], opt: NominativeReportOptions): void {
  downloadXlsx(buildNominativeReportSheet(rows, opt), `Daftar_Nominatif_Entertainment_${opt.taxYear}.xlsx`);
}
