import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

/**
 * Sanitize a value for safe inclusion in a CSV cell.
 * - Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) with a leading apostrophe
 * - Always quotes and escapes embedded quotes
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export interface PaymentExportRow {
  request_number: string;
  description: string;
  division_name: string;
  category_name: string;
  amount: number;
  vendor: string | null;
  funding_source: string;
  beneficiary_name: string | null;
  beneficiary_bank: string | null;
  beneficiary_account: string | null;
  requester_name: string;
  approved_at: string | null;
}

export function generatePaymentCSV(data: PaymentExportRow[]): string {
  const headers = [
    'No. Pengajuan',
    'Deskripsi',
    'Divisi',
    'Kategori',
    'Jumlah (IDR)',
    'Vendor',
    'Sumber Dana',
    'Nama Penerima',
    'Bank Penerima',
    'No. Rekening',
    'Pengaju',
    'Tanggal Approve',
  ];

  const rows = data.map((row) => [
    csvCell(row.request_number),
    csvCell(row.description),
    csvCell(row.division_name),
    csvCell(row.category_name),
    csvCell(row.amount.toString()),
    csvCell(row.vendor || '-'),
    csvCell(row.funding_source),
    csvCell(row.beneficiary_name || '-'),
    csvCell(row.beneficiary_bank || '-'),
    csvCell(row.beneficiary_account || '-'),
    csvCell(row.requester_name),
    csvCell(row.approved_at ? format(new Date(row.approved_at), 'dd MMM yyyy HH:mm', { locale: localeId }) : '-'),
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  return csvContent;
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateBatchPaymentFilename(selectedCount: number): string {
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  return `batch_payment_${selectedCount}_items_${timestamp}.csv`;
}

export function formatCurrencyForExport(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Audit Log Export Types
export interface AuditLogExportRow {
  created_at: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  user_name: string | null;
  user_email: string | null;
  ip_address: string | null;
}

export function generateAuditLogCSV(data: AuditLogExportRow[]): string {
  const headers = [
    'Waktu',
    'Event',
    'Entity',
    'Entity ID',
    'Deskripsi',
    'Nama User',
    'Email User',
    'IP Address',
  ];

  const rows = data.map((row) => [
    format(new Date(row.created_at), 'dd MMM yyyy HH:mm:ss', { locale: localeId }),
    row.event_type,
    row.entity_type,
    row.entity_id || '-',
    `"${row.description.replace(/"/g, '""')}"`,
    row.user_name || 'System',
    row.user_email || '-',
    row.ip_address || '-',
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  return csvContent;
}

export function generateAuditLogFilename(startDate?: Date, endDate?: Date): string {
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  if (startDate && endDate) {
    const start = format(startDate, 'yyyyMMdd');
    const end = format(endDate, 'yyyyMMdd');
    return `audit_log_${start}_${end}_${timestamp}.csv`;
  }
  return `audit_log_${timestamp}.csv`;
}
