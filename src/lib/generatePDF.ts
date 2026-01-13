import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface RequestData {
  request_number: string;
  description: string;
  amount: number;
  needed_date: string;
  created_at: string;
  status: string;
  vendor?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  beneficiary_name?: string | null;
  beneficiary_bank?: string | null;
  beneficiary_account?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  division?: { name: string; code: string };
  category?: { name: string; code: string };
  requester?: { full_name: string; email: string };
  approver?: { full_name: string };
  funding_source?: { name: string; type: string };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const terbilang = (amount: number): string => {
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  if (amount < 12) return satuan[amount];
  if (amount < 20) return terbilang(amount - 10) + ' Belas';
  if (amount < 100) return terbilang(Math.floor(amount / 10)) + ' Puluh' + (amount % 10 > 0 ? ' ' + terbilang(amount % 10) : '');
  if (amount < 200) return 'Seratus' + (amount % 100 > 0 ? ' ' + terbilang(amount % 100) : '');
  if (amount < 1000) return terbilang(Math.floor(amount / 100)) + ' Ratus' + (amount % 100 > 0 ? ' ' + terbilang(amount % 100) : '');
  if (amount < 2000) return 'Seribu' + (amount % 1000 > 0 ? ' ' + terbilang(amount % 1000) : '');
  if (amount < 1000000) return terbilang(Math.floor(amount / 1000)) + ' Ribu' + (amount % 1000 > 0 ? ' ' + terbilang(amount % 1000) : '');
  if (amount < 1000000000) return terbilang(Math.floor(amount / 1000000)) + ' Juta' + (amount % 1000000 > 0 ? ' ' + terbilang(amount % 1000000) : '');
  if (amount < 1000000000000) return terbilang(Math.floor(amount / 1000000000)) + ' Miliar' + (amount % 1000000000 > 0 ? ' ' + terbilang(amount % 1000000000) : '');
  return terbilang(Math.floor(amount / 1000000000000)) + ' Triliun' + (amount % 1000000000000 > 0 ? ' ' + terbilang(amount % 1000000000000) : '');
};

export const generateRequestPDF = (request: RequestData): void => {
  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Diajukan',
    under_review: 'Dalam Review',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    paid: 'Dibayar',
    settled: 'Selesai',
    cancelled: 'Dibatalkan',
  };

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Pengajuan ${request.request_number}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      background: #fff;
    }
    .container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 10mm;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #000;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .company-name {
      font-size: 18pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .company-address {
      font-size: 10pt;
      color: #333;
      margin-top: 5px;
    }
    .document-title {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 20px 0;
      text-decoration: underline;
    }
    .document-number {
      text-align: center;
      font-size: 12pt;
      margin-bottom: 20px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .info-table td {
      padding: 8px 10px;
      vertical-align: top;
    }
    .info-table .label {
      width: 160px;
      font-weight: bold;
    }
    .info-table .colon {
      width: 20px;
      text-align: center;
    }
    .section-title {
      font-weight: bold;
      font-size: 12pt;
      margin: 20px 0 10px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid #ccc;
    }
    .amount-box {
      border: 2px solid #000;
      padding: 15px;
      margin: 20px 0;
      text-align: center;
    }
    .amount-value {
      font-size: 18pt;
      font-weight: bold;
    }
    .amount-words {
      font-size: 10pt;
      font-style: italic;
      margin-top: 5px;
      color: #333;
    }
    .signature-section {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 45%;
      text-align: center;
    }
    .signature-title {
      font-weight: bold;
      margin-bottom: 60px;
    }
    .signature-line {
      border-top: 1px solid #000;
      padding-top: 5px;
    }
    .signature-name {
      font-weight: bold;
    }
    .footer {
      margin-top: 40px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 10pt;
      text-transform: uppercase;
    }
    .status-approved { background: #d4edda; color: #155724; }
    .status-paid { background: #cce5ff; color: #004085; }
    .status-settled { background: #d4edda; color: #155724; }
    .status-rejected { background: #f8d7da; color: #721c24; }
    .status-default { background: #e9ecef; color: #495057; }
    .beneficiary-box {
      border: 1px solid #ccc;
      padding: 15px;
      margin: 15px 0;
      background: #f9f9f9;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-name">PT. KEMIKA KARYA PRATAMA</div>
      <div class="company-address">
        Jl. Industri Raya No. 123, Jakarta 12345 | Tel: (021) 1234567 | Email: info@kemika.co.id
      </div>
    </div>

    <div class="document-title">Formulir Pengajuan Biaya</div>
    <div class="document-number">
      Nomor: <strong>${request.request_number}</strong>
      <span class="status-badge status-${['approved', 'paid', 'settled'].includes(request.status) ? request.status : 'default'}">
        ${statusLabels[request.status] || request.status}
      </span>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">Tanggal Pengajuan</td>
        <td class="colon">:</td>
        <td>${format(new Date(request.created_at), 'dd MMMM yyyy', { locale: localeId })}</td>
      </tr>
      <tr>
        <td class="label">Divisi</td>
        <td class="colon">:</td>
        <td>${request.division?.name || '-'} (${request.division?.code || '-'})</td>
      </tr>
      <tr>
        <td class="label">Pemohon</td>
        <td class="colon">:</td>
        <td>${request.requester?.full_name || '-'}</td>
      </tr>
      <tr>
        <td class="label">Kategori</td>
        <td class="colon">:</td>
        <td>${request.category?.name || '-'}</td>
      </tr>
      <tr>
        <td class="label">Tanggal Dibutuhkan</td>
        <td class="colon">:</td>
        <td>${format(new Date(request.needed_date), 'dd MMMM yyyy', { locale: localeId })}</td>
      </tr>
      <tr>
        <td class="label">Vendor</td>
        <td class="colon">:</td>
        <td>${request.vendor || '-'}</td>
      </tr>
      <tr>
        <td class="label">Sumber Dana</td>
        <td class="colon">:</td>
        <td>${request.funding_source?.name || '-'}</td>
      </tr>
      <tr>
        <td class="label">Metode Pembayaran</td>
        <td class="colon">:</td>
        <td style="text-transform: capitalize;">${request.payment_method || '-'}</td>
      </tr>
    </table>

    <div class="section-title">Deskripsi Pengajuan</div>
    <p style="padding: 10px; background: #f9f9f9; border: 1px solid #eee;">
      ${request.description}
    </p>

    ${request.notes ? `
    <div class="section-title">Catatan</div>
    <p style="padding: 10px; background: #f9f9f9; border: 1px solid #eee;">
      ${request.notes}
    </p>
    ` : ''}

    <div class="amount-box">
      <div class="amount-value">${formatCurrency(request.amount)}</div>
      <div class="amount-words">Terbilang: ${terbilang(request.amount)} Rupiah</div>
    </div>

    ${request.beneficiary_name ? `
    <div class="section-title">Informasi Penerima</div>
    <div class="beneficiary-box">
      <table class="info-table" style="margin: 0;">
        <tr>
          <td class="label" style="width: 140px;">Nama Penerima</td>
          <td class="colon">:</td>
          <td>${request.beneficiary_name}</td>
        </tr>
        <tr>
          <td class="label">Bank</td>
          <td class="colon">:</td>
          <td>${request.beneficiary_bank || '-'}</td>
        </tr>
        <tr>
          <td class="label">No. Rekening</td>
          <td class="colon">:</td>
          <td>${request.beneficiary_account || '-'}</td>
        </tr>
      </table>
    </div>
    ` : ''}

    ${request.approved_at ? `
    <div class="section-title">Informasi Persetujuan</div>
    <table class="info-table">
      <tr>
        <td class="label">Disetujui Oleh</td>
        <td class="colon">:</td>
        <td>${request.approver?.full_name || '-'}</td>
      </tr>
      <tr>
        <td class="label">Tanggal Persetujuan</td>
        <td class="colon">:</td>
        <td>${format(new Date(request.approved_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}</td>
      </tr>
      ${request.paid_at ? `
      <tr>
        <td class="label">Tanggal Pembayaran</td>
        <td class="colon">:</td>
        <td>${format(new Date(request.paid_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}</td>
      </tr>
      ` : ''}
    </table>
    ` : ''}

    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-title">Pemohon</div>
        <div class="signature-line">
          <div class="signature-name">${request.requester?.full_name || '-'}</div>
          <div>${request.division?.name || '-'}</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Menyetujui</div>
        <div class="signature-line">
          <div class="signature-name">${request.approver?.full_name || '___________________'}</div>
          <div>Super Admin</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Dokumen ini dicetak pada ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId })} | 
      PT. Kemika Karya Pratama - Expense Budget & Approval System
    </div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};