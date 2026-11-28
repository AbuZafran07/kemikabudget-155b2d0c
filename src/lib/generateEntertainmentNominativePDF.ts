import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatLongDateId, formatNominativeDate, formatRupiah, sumEntries } from "@/lib/entertainment-nominative";

export interface NominativePdfEntry {
  entry_date: string;
  place: string;
  address: string;
  entertainment_type: string;
  amount: number;
  recipient_name: string;
  recipient_position: string;
  recipient_company: string;
  recipient_business_type: string;
  notes?: string | null;
}

export interface NominativePdfData {
  companyName: string;
  npwp: string;
  taxYear: number | string;
  /** contoh: "CA/2026/0012 / STL/2026/0003" atau nomor pengajuan dana */
  documentRef?: string;
  entries: NominativePdfEntry[];
  signerCity: string;
  /** YYYY-MM-DD */
  signedDate: string;
  signerName: string;
}

/** Membuat PDF Daftar Nominatif (A4 landscape) sesuai format Lampiran SPT. */
export function buildEntertainmentNominativePDF(data: NominativePdfData): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.companyName.toUpperCase(), marginX, 14);
  doc.text("DAFTAR NOMINATIF BIAYA ENTERTAINMENT DAN SEJENISNYA", marginX, 20);
  doc.setFontSize(10);
  doc.text("NPWP", marginX, 27);
  doc.text(`: ${data.npwp}`, marginX + 28, 27);
  doc.text("Tahun Pajak", marginX, 32);
  doc.text(`: ${data.taxYear}`, marginX + 28, 32);
  if (data.documentRef) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Dokumen sumber: ${data.documentRef}`, pageWidth - marginX, 32, { align: "right" });
  }

  const total = sumEntries(data.entries);
  const body = data.entries.map((e, i) => [
    String(i + 1),
    formatNominativeDate(e.entry_date),
    e.place,
    e.address,
    e.entertainment_type,
    formatRupiah(e.amount),
    e.recipient_name,
    e.recipient_position,
    e.recipient_company,
    e.recipient_business_type,
    e.notes || "",
  ]);

  autoTable(doc, {
    startY: 36,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [
      [
        { content: "NO.", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        { content: "PEMBERI ENTERTAINMENT DAN SEJENISNYA", colSpan: 5, styles: { halign: "center" } },
        { content: "RELASI USAHA YANG DIBERIKAN ENTERTAINMENT", colSpan: 4, styles: { halign: "center" } },
        { content: "KETERANGAN", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      ],
      ["TANGGAL", "TEMPAT", "ALAMAT", "JENIS", "JUMLAH (Rp)", "NAMA", "POSISI", "NAMA PERUSAHAAN/INSTANSI", "JENIS USAHA"],
    ],
    body,
    foot: [
      [
        { content: "TOTAL", colSpan: 5, styles: { halign: "center" } },
        { content: formatRupiah(total), styles: { halign: "right" } },
        { content: "", colSpan: 5 },
      ],
    ],
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 7.5, halign: "center", lineColor: 60, lineWidth: 0.2 },
    bodyStyles: { fontSize: 7.5, textColor: 20, valign: "top", lineColor: 60, lineWidth: 0.2 },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 8.5, lineColor: 60, lineWidth: 0.2 },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 19, halign: "center" },
      2: { cellWidth: 24 },
      3: { cellWidth: 32 },
      4: { cellWidth: 36 },
      5: { cellWidth: 23, halign: "right" },
      6: { cellWidth: 22 },
      7: { cellWidth: 24 },
      8: { cellWidth: 26 },
      9: { cellWidth: 24 },
      10: { cellWidth: 38 },
    },
  });

  // Blok tanda tangan (kanan bawah)
  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = lastY + 10;
  if (y + 35 > pageHeight - 8) {
    doc.addPage();
    y = 20;
  }
  const signX = pageWidth - marginX - 70;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${data.signerCity || "Jakarta"}, ${formatLongDateId(data.signedDate)}`, signX, y);
  doc.text("Pemberi Entertainment,", signX, y + 5);
  doc.text(`( ${data.signerName || "...................................."} )`, signX, y + 30);

  return doc;
}

export function downloadEntertainmentNominativePDF(data: NominativePdfData, fileName: string): void {
  buildEntertainmentNominativePDF(data).save(fileName);
}
