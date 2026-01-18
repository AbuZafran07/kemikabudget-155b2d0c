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
  filters: { year: string; division?: string }
): void => {
  const doc = new jsPDF();
  
  const subtitle = `Tahun ${filters.year}${filters.division ? ` - ${filters.division}` : ''}`;
  addHeader(doc, 'LAPORAN REALISASI ANGGARAN', subtitle);
  
  // Summary
  const totalAllocated = data.reduce((sum, d) => sum + d.allocated, 0);
  const totalUsed = data.reduce((sum, d) => sum + d.used, 0);
  const totalRemaining = totalAllocated - totalUsed;
  const overallUtilization = totalAllocated > 0 ? ((totalUsed / totalAllocated) * 100).toFixed(1) : '0';
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  
  let y = 55;
  doc.text(`Total Alokasi: ${formatCurrency(totalAllocated)}`, 14, y);
  doc.text(`Total Terpakai: ${formatCurrency(totalUsed)}`, 100, y);
  y += 6;
  doc.text(`Total Sisa: ${formatCurrency(totalRemaining)}`, 14, y);
  doc.text(`Tingkat Utilisasi: ${overallUtilization}%`, 100, y);
  
  // Table
  autoTable(doc, {
    startY: y + 10,
    head: [['Divisi', 'Kategori', 'Alokasi', 'Terpakai', 'Sisa', 'Utilisasi']],
    body: data.map(row => [
      row.division,
      row.category,
      formatCurrency(row.allocated),
      formatCurrency(row.used),
      formatCurrency(row.remaining),
      row.utilization,
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
      0: { cellWidth: 35 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 20, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });
  
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