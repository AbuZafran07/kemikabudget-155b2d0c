import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface BudgetReportData {
  division: string;
  category: string;
  allocated: number;
  used: number;
  remaining: number;
  utilization: string;
}

interface ExpenseReportData {
  request_number: string;
  division: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  requester: string;
  date: string;
}

interface OverBudgetData {
  division: string;
  category: string;
  allocated: number;
  used: number;
  over: number;
  percentage: string;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const addHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Company header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PT. KEMIKA KARYA PRATAMA', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Expense Budget & Approval System', pageWidth / 2, 26, { align: 'center' });
  
  // Line separator
  doc.setLineWidth(0.5);
  doc.line(14, 30, pageWidth - 14, 30);
  
  // Report title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 40, { align: 'center' });
  
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, 46, { align: 'center' });
  }
};

const addFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128);
    
    const printDate = format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId });
    doc.text(`Dicetak: ${printDate}`, 14, pageHeight - 10);
    doc.text(`Halaman ${i} dari ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
};

export const generateBudgetReportPDF = (
  data: BudgetReportData[],
  filters: { year: string; division?: string; periodFrom?: Date; periodTo?: Date }
): void => {
  const doc = new jsPDF();

  // Build subtitle with period
  let periodLabel = `Tahun ${filters.year}`;
  if (filters.periodFrom && filters.periodTo) {
    const from = format(filters.periodFrom, 'd MMMM yyyy', { locale: localeId });
    const to = format(filters.periodTo, 'd MMMM yyyy', { locale: localeId });
    periodLabel = `Periode ${from} - ${to}`;
  }
  const subtitle = `${periodLabel}${filters.division ? ` | ${filters.division}` : ''}`;
  addHeader(doc, 'LAPORAN REALISASI ANGGARAN', subtitle);

  // Group by division (preserve order of first occurrence)
  const groupMap = new Map<string, BudgetReportData[]>();
  data.forEach(row => {
    if (!groupMap.has(row.division)) groupMap.set(row.division, []);
    groupMap.get(row.division)!.push(row);
  });

  // Grand totals
  const totalAllocated = data.reduce((sum, d) => sum + d.allocated, 0);
  const totalUsed = data.reduce((sum, d) => sum + d.used, 0);
  const totalRemaining = totalAllocated - totalUsed;
  const overallUtilization = totalAllocated > 0 ? ((totalUsed / totalAllocated) * 100).toFixed(1) : '0';

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);

  let y = 55;
  doc.text(`Total Alokasi: ${formatCurrency(totalAllocated)}`, 14, y);
  doc.text(`Total Terpakai: ${formatCurrency(totalUsed)}`, 110, y);
  y += 6;
  doc.text(`Total Sisa: ${formatCurrency(totalRemaining)}`, 14, y);
  doc.text(`Tingkat Utilisasi: ${overallUtilization}%`, 110, y);

  // Build table body with grouping & subtotal separators
  type Row = (string | { content: string; colSpan?: number; styles?: any })[];
  const body: Row[] = [];
  const divisionTotals: Array<{ division: string; allocated: number; used: number; remaining: number; util: number }> = [];

  const utilColor = (pct: number): [number, number, number] => {
    if (pct > 100) return [220, 53, 69];
    if (pct >= 80) return [217, 119, 6];
    return [34, 139, 34];
  };

  Array.from(groupMap.entries()).forEach(([division, rows], idx) => {
    if (idx > 0) {
      // Spacer row separator
      body.push([{ content: '', colSpan: 6, styles: { fillColor: [255, 255, 255], minCellHeight: 2, lineWidth: 0 } }]);
    }
    rows.forEach(row => {
      body.push([
        row.division,
        row.category,
        formatCurrency(row.allocated),
        formatCurrency(row.used),
        formatCurrency(row.remaining),
        row.utilization,
      ]);
    });
    const sumA = rows.reduce((s, r) => s + r.allocated, 0);
    const sumU = rows.reduce((s, r) => s + r.used, 0);
    const sumR = sumA - sumU;
    const util = sumA > 0 ? (sumU / sumA) * 100 : 0;
    divisionTotals.push({ division, allocated: sumA, used: sumU, remaining: sumR, util });
    body.push([
      { content: `Subtotal ${division}`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [230, 240, 230] } },
      { content: formatCurrency(sumA), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 240, 230] } },
      { content: formatCurrency(sumU), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 240, 230] } },
      { content: formatCurrency(sumR), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 240, 230] } },
      { content: `${util.toFixed(1)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [230, 240, 230], textColor: utilColor(util) } },
    ]);
  });

  // Grand total row
  body.push([
    { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [34, 139, 34], textColor: 255 } },
    { content: formatCurrency(totalAllocated), styles: { fontStyle: 'bold', halign: 'right', fillColor: [34, 139, 34], textColor: 255 } },
    { content: formatCurrency(totalUsed), styles: { fontStyle: 'bold', halign: 'right', fillColor: [34, 139, 34], textColor: 255 } },
    { content: formatCurrency(totalRemaining), styles: { fontStyle: 'bold', halign: 'right', fillColor: [34, 139, 34], textColor: 255 } },
    { content: `${overallUtilization}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [34, 139, 34], textColor: 255 } },
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [['Divisi', 'Kategori', 'Alokasi', 'Terpakai', 'Sisa', 'Utilisasi']],
    body: body as any,
    theme: 'grid',
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 20, halign: 'center' },
    },
  });

  // === Page 2: Division Summary ===
  if (divisionTotals.length > 1) {
    doc.addPage();
    addHeader(doc, 'RINGKASAN TOTAL PER DIVISI', subtitle);

    const sorted = [...divisionTotals].sort((a, b) => b.used - a.used);
    autoTable(doc, {
      startY: 55,
      head: [['#', 'Divisi', 'Alokasi', 'Terpakai', 'Sisa', 'Utilisasi', 'Status']],
      body: sorted.map((d, i) => [
        (i + 1).toString(),
        d.division,
        formatCurrency(d.allocated),
        formatCurrency(d.used),
        formatCurrency(d.remaining),
        `${d.util.toFixed(1)}%`,
        d.util > 100 ? 'OVER BUDGET' : d.util >= 80 ? 'Mendekati Limit' : 'Sehat',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 40 },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 30, halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const row = sorted[hookData.row.index];
          hookData.cell.styles.textColor = utilColor(row.util);
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
      foot: [[
        { content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', halign: 'left' } },
        { content: formatCurrency(totalAllocated), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(totalUsed), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(totalRemaining), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `${overallUtilization}%`, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: '', styles: {} },
      ]],
      footStyles: { fillColor: [34, 139, 34], textColor: 255 },
    });

    // Insight summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Insight & Catatan', 14, finalY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const overCount = sorted.filter(d => d.util > 100).length;
    const warnCount = sorted.filter(d => d.util >= 80 && d.util <= 100).length;
    const healthyCount = sorted.filter(d => d.util < 80).length;
    const topSpender = sorted[0];
    let iy = finalY + 6;
    doc.text(`• Divisi dengan pemakaian tertinggi: ${topSpender.division} (${formatCurrency(topSpender.used)} / ${topSpender.util.toFixed(1)}%)`, 14, iy);
    iy += 5;
    doc.text(`• Divisi sehat (<80%): ${healthyCount}  |  Mendekati limit (80-100%): ${warnCount}  |  Over budget (>100%): ${overCount}`, 14, iy);
    iy += 5;
    doc.text(`• Total realisasi keseluruhan: ${formatCurrency(totalUsed)} dari alokasi ${formatCurrency(totalAllocated)} (${overallUtilization}%).`, 14, iy);
  }

  addFooter(doc);
  doc.save(`Laporan_Anggaran_${filters.year}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

export const generateExpenseReportPDF = (
  data: ExpenseReportData[],
  filters: { dateFrom?: string; dateTo?: string; division?: string; category?: string }
): void => {
  const doc = new jsPDF();
  
  let subtitle = '';
  if (filters.dateFrom && filters.dateTo) {
    subtitle = `${filters.dateFrom} - ${filters.dateTo}`;
  }
  if (filters.division) {
    subtitle += subtitle ? ` | ${filters.division}` : filters.division;
  }
  
  addHeader(doc, 'LAPORAN DETAIL PENGELUARAN', subtitle || undefined);
  
  // Summary
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  
  let y = 55;
  doc.text(`Total Transaksi: ${data.length}`, 14, y);
  doc.text(`Total Nilai: ${formatCurrency(totalAmount)}`, 100, y);
  
  // Table
  autoTable(doc, {
    startY: y + 10,
    head: [['No. Request', 'Divisi', 'Kategori', 'Deskripsi', 'Jumlah', 'Status', 'Tanggal']],
    body: data.map(row => [
      row.request_number,
      row.division,
      row.category,
      row.description.length > 30 ? row.description.substring(0, 30) + '...' : row.description,
      formatCurrency(row.amount),
      row.status,
      row.date,
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [34, 139, 34],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 40 },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 22 },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });
  
  addFooter(doc);
  doc.save(`Laporan_Pengeluaran_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

export const generateOverBudgetReportPDF = (
  data: OverBudgetData[],
  filters: { year: string; division?: string }
): void => {
  const doc = new jsPDF();
  
  const subtitle = `Tahun ${filters.year}${filters.division ? ` - ${filters.division}` : ''}`;
  addHeader(doc, 'LAPORAN BUDGET MELEBIHI ALOKASI', subtitle);
  
  if (data.length === 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Tidak ada budget yang melebihi alokasi.', 14, 55);
  } else {
    // Summary
    const totalOver = data.reduce((sum, d) => sum + d.over, 0);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    
    let y = 55;
    doc.text(`Jumlah Item Over Budget: ${data.length}`, 14, y);
    doc.text(`Total Kelebihan: ${formatCurrency(totalOver)}`, 100, y);
    
    // Table
    autoTable(doc, {
      startY: y + 10,
      head: [['Divisi', 'Kategori', 'Alokasi', 'Terpakai', 'Kelebihan', '%']],
      body: data.map(row => [
        row.division,
        row.category,
        formatCurrency(row.allocated),
        formatCurrency(row.used),
        formatCurrency(row.over),
        row.percentage,
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', textColor: [220, 53, 69] },
        5: { cellWidth: 20, halign: 'center', textColor: [220, 53, 69] },
      },
      alternateRowStyles: {
        fillColor: [255, 245, 245],
      },
    });
  }
  
  addFooter(doc);
  doc.save(`Laporan_Over_Budget_${filters.year}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

export const generateCategoryAnalysisPDF = (
  data: Array<{
    name: string;
    code: string;
    allocated: number;
    used: number;
    remaining: number;
    utilization: number;
  }>,
  filters: { year: string; division?: string }
): void => {
  const doc = new jsPDF();
  
  const subtitle = `Tahun ${filters.year}${filters.division ? ` - ${filters.division}` : ''}`;
  addHeader(doc, 'LAPORAN ANALISIS PER KATEGORI', subtitle);
  
  // Summary
  const totalAllocated = data.reduce((sum, d) => sum + d.allocated, 0);
  const totalUsed = data.reduce((sum, d) => sum + d.used, 0);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  
  let y = 55;
  doc.text(`Total Kategori: ${data.length}`, 14, y);
  doc.text(`Total Anggaran: ${formatCurrency(totalAllocated)}`, 80, y);
  doc.text(`Total Terpakai: ${formatCurrency(totalUsed)}`, 150, y);
  
  // Table
  autoTable(doc, {
    startY: y + 10,
    head: [['Kode', 'Kategori', 'Alokasi', 'Terpakai', 'Sisa', 'Utilisasi']],
    body: data.map(row => [
      row.code,
      row.name,
      formatCurrency(row.allocated),
      formatCurrency(row.used),
      formatCurrency(row.remaining),
      `${row.utilization.toFixed(1)}%`,
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [34, 139, 34],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 45 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 25, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });
  
  addFooter(doc);
  doc.save(`Laporan_Kategori_${filters.year}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

// ========== MEDICAL REIMBURSEMENT REPORT ==========

interface MedicalEmployeeData {
  employee: string;
  entitlement: number;
  used: number;
  remaining: number;
  claims: number;
  utilization: number;
}

interface MedicalMonthlyData {
  name: string;
  claimed: number;
  approved: number;
  paid: number;
  count: number;
}

interface MedicalKPI {
  totalEntitlement: number;
  totalUsed: number;
  totalRemaining: number;
  totalClaimCount: number;
  pendingCount: number;
  paidCount: number;
}

export const generateMedicalReportPDF = (
  employeeData: MedicalEmployeeData[],
  monthlyData: MedicalMonthlyData[],
  kpi: MedicalKPI,
  filters: { year: string }
): void => {
  const doc = new jsPDF();

  addHeader(doc, 'LAPORAN MEDICAL REIMBURSEMENT', `Tahun ${filters.year}`);

  // KPI Summary
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);

  let y = 55;
  doc.text(`Total Hak Medis: ${formatCurrency(kpi.totalEntitlement)}`, 14, y);
  doc.text(`Terpakai: ${formatCurrency(kpi.totalUsed)}`, 110, y);
  y += 6;
  doc.text(`Sisa: ${formatCurrency(kpi.totalRemaining)}`, 14, y);
  doc.text(`Total Klaim: ${kpi.totalClaimCount} (Pending: ${kpi.pendingCount}, Dibayar: ${kpi.paidCount})`, 110, y);
  y += 4;

  // Monthly summary table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  y += 6;
  doc.text('Ringkasan Bulanan', 14, y);

  autoTable(doc, {
    startY: y + 4,
    head: [['Bulan', 'Jumlah Klaim', 'Diajukan', 'Disetujui', 'Dibayar']],
    body: monthlyData.map(m => [
      m.name,
      m.count.toString(),
      formatCurrency(m.claimed),
      formatCurrency(m.approved),
      formatCurrency(m.paid),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [255, 245, 245] },
  });

  // Employee detail table - new page
  doc.addPage();
  addHeader(doc, 'DETAIL PER KARYAWAN', `Tahun ${filters.year}`);

  autoTable(doc, {
    startY: 55,
    head: [['Karyawan', 'Hak Medis', 'Terpakai', 'Sisa', 'Klaim', 'Utilisasi']],
    body: employeeData.map(row => [
      row.employee,
      formatCurrency(row.entitlement),
      formatCurrency(row.used),
      formatCurrency(row.remaining),
      row.claims.toString(),
      `${row.utilization.toFixed(1)}%`,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' },
    },
    alternateRowStyles: { fillColor: [255, 245, 245] },
  });

  addFooter(doc);
  doc.save(`Laporan_Medical_${filters.year}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};