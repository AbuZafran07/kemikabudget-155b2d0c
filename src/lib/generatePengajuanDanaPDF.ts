import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { escapeHtml } from './htmlEscape';

export interface PengajuanDanaData {
  request_number: string;
  description: string;
  amount: number;
  approved_amount?: number | null;
  vendor?: string | null;
  payment_method?: string | null;
  beneficiary_name?: string | null;
  beneficiary_bank?: string | null;
  beneficiary_account?: string | null;
  needed_date: string;
  created_at: string;
  approved_at?: string | null;
  division?: { name: string; code: string };
  category?: { name: string; code: string };
  requester?: { full_name: string; email: string };
  funding_source?: { name: string; type: string };
  attachments?: { attachment_type: string; file_name: string }[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
  }).format(amount);
};

const generateDocNumber = (requestNumber: string, date: Date): string => {
  const dateStr = format(date, 'yyyyMMdd');
  const seq = requestNumber.split('/').pop() || '01';
  return `PD/${dateStr}.${seq}`;
};

export const generatePengajuanDanaHTML = (data: PengajuanDanaData, logoBase64?: string): string => {
  const safeRequestNumber = escapeHtml(data.request_number);
  const safeDescription = escapeHtml(data.description);
  const safeVendor = escapeHtml(data.vendor) || '-';
  const safePaymentMethod = data.payment_method || 'Cash';
  const safeBeneficiaryName = escapeHtml(data.beneficiary_name) || '-';
  const safeBeneficiaryBank = escapeHtml(data.beneficiary_bank) || '-';
  const safeBeneficiaryAccount = escapeHtml(data.beneficiary_account) || '-';
  const safeDivisionName = escapeHtml(data.division?.name) || '-';
  const safeDivisionCode = escapeHtml(data.division?.code) || '-';
  const safeCategoryName = escapeHtml(data.category?.name) || '-';
  const safeRequesterName = escapeHtml(data.requester?.full_name) || '-';
  const safeFundingSourceName = escapeHtml(data.funding_source?.name) || '-';

  const docNumber = generateDocNumber(data.request_number, new Date(data.created_at));
  const neededDate = format(new Date(data.needed_date), 'dd MMM yyyy', { locale: localeId });
  const createdDate = format(new Date(data.created_at), 'dd MMM yyyy', { locale: localeId });
  const printDate = format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId });

  const nilaiPengajuan = data.amount;
  const nilaiApproved = data.approved_amount ?? data.amount;
  
  const isTransfer = data.payment_method?.toLowerCase() === 'transfer' || 
                     data.funding_source?.type === 'bank';
  const isCash = !isTransfer;

  // Find attachment references
  const invoiceReff = data.attachments?.find(a => a.attachment_type === 'invoice')?.file_name || '';
  const quotationReff = data.attachments?.find(a => a.attachment_type === 'quotation')?.file_name || '';
  const receiptReff = data.attachments?.find(a => a.attachment_type === 'receipt')?.file_name || '';
  const reffNo = invoiceReff || quotationReff || receiptReff || '-';

  const logoImg = logoBase64 
    ? `<img src="${logoBase64}" alt="Kemika" style="height: 50px;" />`
    : `<div style="font-size: 24px; font-weight: bold; color: #1a5f2a; font-style: italic;">Kemika</div>
       <div style="font-size: 10px; color: #333; font-style: italic;">SPREADING SOLUTIONS</div>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Pengajuan Dana ${safeRequestNumber}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 9pt; 
      line-height: 1.3; 
      color: #000; 
      background: #fff;
    }
    .container { 
      max-width: 210mm; 
      margin: 0 auto; 
      padding: 5mm; 
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
    }
    .logo { }
    .doc-info {
      text-align: right;
    }
    .doc-title {
      font-size: 16pt;
      font-weight: bold;
      color: #1a5f2a;
      margin-bottom: 5px;
    }
    .doc-info-table {
      font-size: 9pt;
    }
    .doc-info-table td {
      padding: 2px 0;
    }
    .doc-info-table .label {
      text-align: right;
      padding-right: 10px;
      font-weight: bold;
    }
    
    .info-section {
      display: flex;
      margin-bottom: 8px;
    }
    .info-left, .info-right {
      width: 50%;
    }
    .info-item {
      display: flex;
      margin-bottom: 3px;
    }
    .info-label {
      width: 130px;
      font-weight: bold;
    }
    .info-colon {
      width: 15px;
    }
    .info-value { flex: 1; }

    .green-section {
      background: #1a5f2a;
      color: white;
      padding: 6px 10px;
      margin-bottom: 0;
    }
    .green-section .info-label { color: white; }
    
    table.main-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    table.main-table th {
      background: #1a5f2a;
      color: white;
      padding: 6px 8px;
      text-align: center;
      font-weight: bold;
      border: 1px solid #1a5f2a;
    }
    table.main-table td {
      padding: 8px;
      border: 1px solid #1a5f2a;
      vertical-align: top;
    }
    table.main-table .num { text-align: center; width: 30px; }
    table.main-table .amount { text-align: right; width: 100px; }
    
    .payment-section {
      display: flex;
      margin-bottom: 10px;
    }
    .transfer-box, .tunai-box {
      border: 1px solid #1a5f2a;
    }
    .transfer-box { width: 70%; }
    .tunai-box { width: 30%; }
    
    .section-header {
      background: #1a5f2a;
      color: white;
      padding: 5px 8px;
      font-weight: bold;
      text-align: center;
    }
    .section-content {
      display: flex;
    }
    .section-content > div {
      flex: 1;
      padding: 6px;
      border-right: 1px solid #1a5f2a;
      text-align: center;
    }
    .section-content > div:last-child {
      border-right: none;
    }
    .section-content .sub-label {
      font-size: 8pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .section-content .sub-value {
      min-height: 20px;
      font-size: 9pt;
    }
    
    .tunai-content {
      padding: 6px;
      text-align: center;
    }
    .tunai-content .sub-label {
      font-size: 8pt;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .tunai-content .sub-value {
      min-height: 20px;
      font-size: 9pt;
    }
    
    .signature-section {
      display: flex;
      border: 1px solid #1a5f2a;
      margin-bottom: 15px;
    }
    .signature-box {
      flex: 1;
      text-align: center;
      padding: 8px;
      border-right: 1px solid #1a5f2a;
    }
    .signature-box:last-child { border-right: none; }
    .signature-header {
      background: #c4a000;
      color: white;
      padding: 5px;
      font-weight: bold;
      margin: -8px -8px 0 -8px;
    }
    .signature-space {
      height: 50px;
    }
    .signature-date {
      font-size: 8pt;
      margin-top: 5px;
    }
    
    .footer {
      text-align: center;
      font-size: 8pt;
      color: #666;
      padding-top: 10px;
      border-top: 1px solid #ddd;
    }
    
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    
    .preview-actions {
      position: fixed;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 10px;
      z-index: 1000;
    }
    .preview-actions button {
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
      border: none;
      border-radius: 4px;
    }
    .btn-print {
      background: #1a5f2a;
      color: white;
    }
    .btn-close {
      background: #666;
      color: white;
    }
  </style>
</head>
<body>
  <div class="preview-actions no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak</button>
    <button class="btn-close" onclick="window.close()">✕ Tutup</button>
  </div>

  <div class="container">
    <div class="header">
      <div class="logo">
        ${logoImg}
      </div>
      <div class="doc-info">
        <div class="doc-title">PENGAJUAN DANA</div>
        <table class="doc-info-table">
          <tr>
            <td class="label">No.</td>
            <td>: ${escapeHtml(docNumber)}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td>: ${createdDate}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="info-section" style="margin-bottom: 5px;">
      <div class="info-left">
        <div class="info-item">
          <span class="info-label">Kategori Biaya</span>
          <span class="info-colon">:</span>
          <span class="info-value">${safeCategoryName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Budget Division</span>
          <span class="info-colon">:</span>
          <span class="info-value">${safeDivisionName} (${safeDivisionCode})</span>
        </div>
      </div>
    </div>

    <div class="green-section">
      <div class="info-section" style="margin: 0;">
        <div class="info-left">
          <div class="info-item">
            <span class="info-label">Pemohon</span>
            <span class="info-colon">:</span>
            <span class="info-value">${safeRequesterName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Vendor/Penerima</span>
            <span class="info-colon">:</span>
            <span class="info-value">${safeVendor}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Reff No (INV/Nota/Resi)</span>
            <span class="info-colon">:</span>
            <span class="info-value">${escapeHtml(reffNo)}</span>
          </div>
        </div>
        <div class="info-right">
          <div class="info-item">
            <span class="info-label">Payment Due Date</span>
            <span class="info-colon">:</span>
            <span class="info-value">${neededDate}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Sumber Dana</span>
            <span class="info-colon">:</span>
            <span class="info-value">${safeFundingSourceName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Metode Pembayaran</span>
            <span class="info-colon">:</span>
            <span class="info-value" style="text-transform: capitalize;">${safePaymentMethod}</span>
          </div>
        </div>
      </div>
    </div>

    <table class="main-table">
      <thead>
        <tr>
          <th class="num">No.</th>
          <th>Keterangan Biaya</th>
          <th class="amount">Nilai Pengajuan</th>
          <th class="amount">Nilai Approved</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="num">1</td>
          <td>${safeDescription}</td>
          <td class="amount">Rp. ${formatCurrency(nilaiPengajuan)}</td>
          <td class="amount">Rp. ${formatCurrency(nilaiApproved)}</td>
        </tr>
      </tbody>
    </table>

    <div class="payment-section">
      <div class="transfer-box">
        <div class="section-header">Transfer Bank</div>
        <div class="section-content">
          <div>
            <div class="sub-label">Nama Bank</div>
            <div class="sub-value">${isTransfer ? safeBeneficiaryBank : '-'}</div>
          </div>
          <div>
            <div class="sub-label">No. Rekening</div>
            <div class="sub-value">${isTransfer ? safeBeneficiaryAccount : '-'}</div>
          </div>
          <div>
            <div class="sub-label">Nilai Transfer</div>
            <div class="sub-value">${isTransfer ? 'Rp. ' + formatCurrency(nilaiApproved) : '-'}</div>
          </div>
        </div>
      </div>
      <div class="tunai-box">
        <div class="section-header">Tunai</div>
        <div class="tunai-content">
          <div class="sub-label">Nilai Cash</div>
          <div class="sub-value">${isCash ? 'Rp. ' + formatCurrency(nilaiApproved) : '-'}</div>
        </div>
      </div>
    </div>

    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-header">Pemohon</div>
        <div class="signature-space"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
      <div class="signature-box">
        <div class="signature-header">Mengetahui</div>
        <div class="signature-space"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
      <div class="signature-box">
        <div class="signature-header">Menyetujui</div>
        <div class="signature-space"></div>
        <div class="signature-date">Date: ___________</div>
      </div>
    </div>

    <div class="footer">
      Dokumen ini dicetak pada ${printDate} | PT. Kemika Karya Pratama - Expense Budget & Approval System
    </div>
  </div>
</body>
</html>
  `;
};

export const previewPengajuanDanaPDF = (data: PengajuanDanaData, logoBase64?: string): void => {
  const html = generatePengajuanDanaHTML(data, logoBase64);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  printWindow.document.write(html);
  printWindow.document.close();
};

export const printPengajuanDanaPDF = (data: PengajuanDanaData, logoBase64?: string): void => {
  const html = generatePengajuanDanaHTML(data, logoBase64);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  const htmlWithAutoPrint = html.replace('</body>', `
    <script>
      window.onload = function() { 
        setTimeout(function() { window.print(); }, 300);
      }
    </script>
  </body>`);
  
  printWindow.document.write(htmlWithAutoPrint);
  printWindow.document.close();
};
