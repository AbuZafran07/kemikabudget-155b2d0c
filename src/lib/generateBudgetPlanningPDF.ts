import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { DivisionBudget } from '@/hooks/useBudgetPlanning';

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const addHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PT. KEMIKA KARYA PRATAMA', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Expense Budget & Approval System', pageWidth / 2, 26, { align: 'center' });

  doc.setLineWidth(0.5);
  doc.line(14, 30, pageWidth - 14, 30);

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

export const generateBudgetPlanningPDF = (
  budgets: DivisionBudget[],
  meta: { periodLabel: string; divisionLabel?: string }
): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const subtitle = `Periode: ${meta.periodLabel}${meta.divisionLabel ? ` | Divisi: ${meta.divisionLabel}` : ''}`;
  addHeader(doc, 'RINGKASAN ANGGARAN PER DIVISI', subtitle);

  // Group by division
  const groupMap = new Map<string, DivisionBudget[]>();
  budgets.forEach((b) => {
    const key = b.divisions?.name || 'Unknown';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(b);
  });

  const head = [[
    'Kategori',
    'Alokasi (IDR)',
    'Terpakai (IDR)',
    'Sisa (IDR)',
    'Utilisasi',
  ]];

  const body: (string | { content: string; colSpan?: number; styles?: object })[][] = [];

  groupMap.forEach((items, divisionName) => {
    // Division header row
    body.push([
      { content: `Divisi: ${divisionName}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } },
    ]);

    let subAllocated = 0;
    let subUsed = 0;

    items.forEach((b) => {
      const remaining = b.allocated_amount - b.used_amount;
      const util = b.allocated_amount > 0 ? ((b.used_amount / b.allocated_amount) * 100).toFixed(1) : '0';
      subAllocated += b.allocated_amount;
      subUsed += b.used_amount;
      body.push([
        b.cost_categories?.name || '-',
        formatCurrency(b.allocated_amount),
        formatCurrency(b.used_amount),
        formatCurrency(remaining),
        `${util}%`,
      ]);
    });

    // Subtotal row
    body.push([
      { content: `Subtotal ${divisionName}`, styles: { fontStyle: 'bold' } },
      { content: formatCurrency(subAllocated), styles: { fontStyle: 'bold' } },
      { content: formatCurrency(subUsed), styles: { fontStyle: 'bold' } },
      { content: formatCurrency(subAllocated - subUsed), styles: { fontStyle: 'bold' } },
      { content: `${subAllocated > 0 ? ((subUsed / subAllocated) * 100).toFixed(1) : '0'}%`, styles: { fontStyle: 'bold' } },
    ]);
  });

  // Grand total
  const totalAllocated = budgets.reduce((s, b) => s + b.allocated_amount, 0);
  const totalUsed = budgets.reduce((s, b) => s + b.used_amount, 0);
  body.push([
    { content: 'TOTAL KESELURUHAN', styles: { fontStyle: 'bold', fillColor: [200, 215, 255] } },
    { content: formatCurrency(totalAllocated), styles: { fontStyle: 'bold', fillColor: [200, 215, 255] } },
    { content: formatCurrency(totalUsed), styles: { fontStyle: 'bold', fillColor: [200, 215, 255] } },
    { content: formatCurrency(totalAllocated - totalUsed), styles: { fontStyle: 'bold', fillColor: [200, 215, 255] } },
    { content: `${totalAllocated > 0 ? ((totalUsed / totalAllocated) * 100).toFixed(1) : '0'}%`, styles: { fontStyle: 'bold', fillColor: [200, 215, 255] } },
  ]);

  autoTable(doc, {
    startY: 52,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 98, 65], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`anggaran_per_divisi_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};
