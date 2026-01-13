import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

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
    row.request_number,
    `"${row.description.replace(/"/g, '""')}"`,
    row.division_name,
    row.category_name,
    row.amount.toString(),
    row.vendor || '-',
    row.funding_source,
    row.beneficiary_name || '-',
    row.beneficiary_bank || '-',
    row.beneficiary_account || '-',
    row.requester_name,
    row.approved_at ? format(new Date(row.approved_at), 'dd MMM yyyy HH:mm', { locale: localeId }) : '-',
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
