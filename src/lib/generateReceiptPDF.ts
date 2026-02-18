import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { escapeHtml } from './htmlEscape';

interface PaymentReceiptData {
  request_number: string;
  description: string;
  amount: number;
  vendor?: string | null;
  payment_method?: string | null;
  beneficiary_name?: string | null;
  beneficiary_bank?: string | null;
  beneficiary_account?: string | null;
  paid_at: string;
  approved_at?: string | null;
  division?: { name: string; code: string };
  category?: { name: string; code: string };
  requester?: { full_name: string; email: string };
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

export const generatePaymentReceiptPDF = (payment: PaymentReceiptData): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  // Escape all user-controlled data to prevent XSS
  const safeRequestNumber = escapeHtml(payment.request_number);
  const safeDescription = escapeHtml(payment.description);
  const safeVendor = escapeHtml(payment.vendor);
  const safePaymentMethod = escapeHtml(payment.payment_method);
  const safeBeneficiaryName = escapeHtml(payment.beneficiary_name);
  const safeBeneficiaryBank = escapeHtml(payment.beneficiary_bank);
  const safeBeneficiaryAccount = escapeHtml(payment.beneficiary_account);
  const safeDivisionName = escapeHtml(payment.division?.name);
  const safeDivisionCode = escapeHtml(payment.division?.code);
  const safeCategoryName = escapeHtml(payment.category?.name);
  const safeRequesterName = escapeHtml(payment.requester?.full_name);
  const safeFundingSourceName = escapeHtml(payment.funding_source?.name);
  const safeFundingSourceType = payment.funding_source?.type === 'bank' ? 'Transfer Bank' : 'Kas Kecil';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Kwitansi Pembayaran ${safeRequestNumber}</title>
  <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'">
  <style>
    @page {
      size: A4;
      margin: 15mm;
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
      margin-bottom: 25px;
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
    .receipt-title {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 25px 0;
      padding: 10px;
      background: #f0f0f0;
      border: 2px solid #000;
    }
    .receipt-number {
      text-align: center;
      font-size: 12pt;
      margin-bottom: 25px;
    }
    .receipt-number strong {
      font-size: 14pt;
      color: #1a5f2a;
    }
    .info-section {
      margin-bottom: 20px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 8px 10px;
      vertical-align: top;
    }
    .info-table .label {
      width: 180px;
      font-weight: bold;
    }
    .info-table .colon {
      width: 20px;
      text-align: center;
    }
    .amount-box {
      border: 3px solid #000;
      padding: 20px;
      margin: 25px 0;
      text-align: center;
      background: #fffde7;
    }
    .amount-label {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .amount-value {
      font-size: 24pt;
      font-weight: bold;
      color: #1a5f2a;
    }
    .amount-words {
      font-size: 11pt;
      font-style: italic;
      margin-top: 10px;
      padding: 10px;
      background: #f9f9f9;
      border: 1px dashed #ccc;
    }
    .beneficiary-box {
      border: 1px solid #ccc;
      padding: 15px;
      margin: 20px 0;
      background: #f9f9f9;
    }
    .section-title {
      font-weight: bold;
      font-size: 12pt;
      margin: 20px 0 10px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid #ccc;
    }
    .signature-section {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 35%;
      text-align: center;
    }
    .signature-title {
      font-weight: bold;
      margin-bottom: 70px;
    }
    .signature-line {
      border-top: 1px solid #000;
      padding-top: 5px;
    }
    .signature-name {
      font-weight: bold;
    }
    .footer {
      margin-top: 50px;
      padding-top: 15px;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
    .status-paid {
      display: inline-block;
      padding: 8px 20px;
      background: #22c55e;
      color: white;
      font-weight: bold;
      font-size: 14pt;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80pt;
      color: rgba(34, 197, 94, 0.1);
      font-weight: bold;
      text-transform: uppercase;
      pointer-events: none;
      z-index: -1;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="watermark">LUNAS</div>
  <div class="container">
    <div class="header">
      <div class="company-name">PT. KEMIKA KARYA PRATAMA</div>
      <div class="company-address">
        Jl. Industri Raya No. 123, Jakarta 12345 | Tel: (021) 1234567 | Email: info@kemika.co.id
      </div>
    </div>

    <div class="receipt-title">
      KWITANSI PEMBAYARAN
    </div>
    
    <div class="receipt-number">
      No. Referensi: <strong>${safeRequestNumber}</strong>
      <br>
      <span class="status-paid">✓ DIBAYAR</span>
    </div>

    <div class="info-section">
      <table class="info-table">
        <tr>
          <td class="label">Tanggal Pembayaran</td>
          <td class="colon">:</td>
          <td><strong>${format(new Date(payment.paid_at), 'dd MMMM yyyy, HH:mm', { locale: localeId })} WIB</strong></td>
        </tr>
        <tr>
          <td class="label">Divisi</td>
          <td class="colon">:</td>
          <td>${safeDivisionName} (${safeDivisionCode})</td>
        </tr>
        <tr>
          <td class="label">Pemohon</td>
          <td class="colon">:</td>
          <td>${safeRequesterName}</td>
        </tr>
        <tr>
          <td class="label">Kategori</td>
          <td class="colon">:</td>
          <td>${safeCategoryName}</td>
        </tr>
        <tr>
          <td class="label">Vendor</td>
          <td class="colon">:</td>
          <td>${safeVendor}</td>
        </tr>
        <tr>
          <td class="label">Sumber Dana</td>
          <td class="colon">:</td>
          <td>${safeFundingSourceName} (${safeFundingSourceType})</td>
        </tr>
        <tr>
          <td class="label">Metode Pembayaran</td>
          <td class="colon">:</td>
          <td style="text-transform: capitalize;">${safePaymentMethod}</td>
        </tr>
      </table>
    </div>

    <div class="section-title">Deskripsi Pembayaran</div>
    <p style="padding: 12px; background: #f9f9f9; border: 1px solid #eee; font-size: 11pt;">
      ${safeDescription}
    </p>

    <div class="amount-box">
      <div class="amount-label">JUMLAH PEMBAYARAN</div>
      <div class="amount-value">${formatCurrency(payment.amount)}</div>
      <div class="amount-words">Terbilang: ${terbilang(payment.amount)} Rupiah</div>
    </div>

    ${payment.beneficiary_name ? `
    <div class="section-title">Informasi Penerima</div>
    <div class="beneficiary-box">
      <table class="info-table" style="margin: 0;">
        <tr>
          <td class="label" style="width: 140px;">Nama Penerima</td>
          <td class="colon">:</td>
          <td><strong>${safeBeneficiaryName}</strong></td>
        </tr>
        <tr>
          <td class="label">Bank</td>
          <td class="colon">:</td>
          <td>${safeBeneficiaryBank}</td>
        </tr>
        <tr>
          <td class="label">No. Rekening</td>
          <td class="colon">:</td>
          <td>${safeBeneficiaryAccount}</td>
        </tr>
      </table>
    </div>
    ` : ''}

    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-title">Penerima</div>
        <div class="signature-line">
          <div class="signature-name">${payment.beneficiary_name ? safeBeneficiaryName : safeRequesterName}</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Kasir / Finance</div>
        <div class="signature-line">
          <div class="signature-name">___________________</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-title">Mengetahui</div>
        <div class="signature-line">
          <div class="signature-name">___________________</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Dokumen ini dicetak pada ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId })} WIB | 
      PT. Kemika Karya Pratama - Expense Budget &amp; Approval System
      <br>
      <em>Kwitansi ini sah sebagai bukti pembayaran yang telah diproses melalui sistem.</em>
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
