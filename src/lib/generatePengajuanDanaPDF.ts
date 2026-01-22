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
  approver?: { full_name: string } | null;
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
  const safeDivisionCode = escapeHtml(data.division?.code) || '';
  const safeCategoryName = escapeHtml(data.category?.name) || '-';
  const safeRequesterName = escapeHtml(data.requester?.full_name) || '-';
  const safeApproverName = escapeHtml(data.approver?.full_name) || '';
  const safeFundingSourceName = escapeHtml(data.funding_source?.name) || '-';

  const docNumber = generateDocNumber(data.request_number, new Date(data.created_at));
  const neededDate = format(new Date(data.needed_date), 'dd MMM yyyy', { locale: localeId });
  const createdDate = format(new Date(data.created_at), 'dd MMM yyyy', { locale: localeId });
  const printDate = format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId });
  const approvedDate = data.approved_at ? format(new Date(data.approved_at), 'dd MMM yyyy', { locale: localeId }) : '';

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

  // Division display - code on same line
  const divisionDisplay = safeDivisionCode 
    ? `${safeDivisionName} (${safeDivisionCode})`
    : safeDivisionName;

  const logoImg = logoBase64 
    ? `<img src="${logoBase64}" alt="Kemika" style="height: 60px;" />`
    : `<img src="/lovable-uploads/cb7d852a-00a6-461a-ad8f-806dbf150cf5.png" alt="Kemika" style="height: 60px;" onerror="this.outerHTML='<div style=\\'font-size: 24px; font-weight: bold; color: #1a5f2a; font-style: italic;\\'>Kemika</div><div style=\\'font-size: 10px; color: #333; font-style: italic;\\'>SPREADING SOLUTIONS</div>'" />`;

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
    .doc-info-box {
      border: 1px solid #333;
      display: inline-block;
      text-align: left;
    }
    .doc-info-box table {
      font-size: 9pt;
    }
    .doc-info-box td {
      padding: 4px 10px;
    }
    .doc-info-box .label {
      font-weight: bold;
      text-align: left;
    }
    .doc-info-box .value {
      text-align: left;
    }
    
    .category-section {
      margin-bottom: 10px;
    }
    .category-row {
      display: flex;
      margin-bottom: 3px;
    }
    .category-label {
      width: 120px;
      font-weight: bold;
    }
    .category-colon {
      width: 15px;
    }
    .category-value { flex: 1; }

    .info-section {
      display: flex;
      border: 1px solid #666;
      margin-bottom: 10px;
      background: #fff;
    }
    .info-left, .info-right {
      width: 50%;
      padding: 8px 10px;
    }
    .info-right {
      border-left: 1px solid #666;
    }
    .info-item {
      display: flex;
      margin-bottom: 4px;
    }
    .info-label {
      width: 140px;
      font-weight: bold;
    }
    .info-colon {
      width: 15px;
    }
    .info-value { flex: 1; }
    
    table.main-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    table.main-table th {
      background: #1a5f2a;
      color: white;
      padding: 8px 10px;
      text-align: center;
      font-weight: bold;
      border: 1px solid #333;
    }
    table.main-table td {
      padding: 10px;
      border: 1px solid #333;
      vertical-align: top;
    }
    table.main-table .num { text-align: center; width: 40px; }
    table.main-table .amount { text-align: right; white-space: nowrap; min-width: 130px; }
    table.main-table .description { word-wrap: break-word; }
    
    .payment-section {
      display: flex;
      margin-bottom: 10px;
    }
    .transfer-box, .tunai-box {
      border: 1px solid #333;
    }
    .transfer-box { width: 70%; }
    .tunai-box { width: 30%; border-left: none; }
    
    .section-header {
      background: #1a5f2a;
      color: white;
      padding: 5px 8px;
      font-weight: bold;
      text-align: center;
      border-bottom: 1px solid #333;
    }
    .section-content {
      display: flex;
    }
    .section-content > div {
      flex: 1;
      padding: 8px;
      border-right: 1px solid #333;
      text-align: center;
    }
    .section-content > div:last-child {
      border-right: none;
    }
    .section-content .sub-label {
      font-size: 8pt;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .section-content .sub-value {
      min-height: 20px;
      font-size: 9pt;
    }
    
    .tunai-content {
      padding: 8px;
      text-align: center;
    }
    .tunai-content .sub-label {
      font-size: 8pt;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .tunai-content .sub-value {
      min-height: 20px;
      font-size: 9pt;
    }
    
    .signature-section {
      display: flex;
      border: 1px solid #333;
      margin-bottom: 15px;
    }
    .signature-box {
      flex: 1;
      text-align: center;
      border-right: 1px solid #333;
    }
    .signature-box:last-child { border-right: none; }
    .signature-header {
      background: #c4a000;
      color: white;
      padding: 6px;
      font-weight: bold;
      border-bottom: 1px solid #333;
    }
    .signature-content {
      padding: 10px;
      min-height: 80px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .signature-name {
      font-weight: bold;
      min-height: 20px;
    }
    .signature-line {
      border-bottom: 1px solid #333;
      width: 80%;
      margin: 0 auto;
      margin-bottom: 5px;
    }
    .signature-date {
      font-size: 8pt;
    }
    
    /* Approved signature box - full width single box */
    .approved-signature-section {
      border: 1px solid #333;
      margin-bottom: 15px;
    }
    .approved-signature-header {
      background: #c4a000;
      color: white;
      padding: 6px;
      font-weight: bold;
      text-align: center;
      border-bottom: 1px solid #333;
    }
    .approved-signature-content {
      padding: 15px;
      min-height: 80px;
    }
    .approved-check {
      color: #1a5f2a;
      font-weight: bold;
      font-size: 11pt;
      margin-bottom: 8px;
    }
    .approved-by {
      margin-bottom: 5px;
    }
    .approved-at {
      margin-bottom: 10px;
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
    .btn-download {
      background: #0066cc;
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
        <div class="doc-title">PENGAJUAN BUDGET</div>
        <div class="doc-info-box">
          <table>
            <tr>
              <td class="label">No.</td>
              <td class="value">: ${escapeHtml(docNumber)}</td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td class="value">: ${createdDate}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <div class="category-section">
      <div class="category-row">
        <span class="category-label">Kategori Biaya</span>
        <span class="category-colon">:</span>
        <span class="category-value">${safeCategoryName}</span>
      </div>
      <div class="category-row">
        <span class="category-label">Budget Division</span>
        <span class="category-colon">:</span>
        <span class="category-value">${divisionDisplay}</span>
      </div>
    </div>

    <div class="info-section">
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
          <td class="description">${safeDescription}</td>
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

    ${safeApproverName ? `
    <!-- Approved: Single wide box -->
    <div class="approved-signature-section">
      <div class="approved-signature-header">Menyetujui</div>
      <div class="approved-signature-content">
        <div class="approved-check">✓ APPROVED</div>
        <div class="approved-by"><strong>Approved by:</strong> ${safeApproverName}</div>
        <div class="approved-at"><strong>Approved at:</strong> ${approvedDate}</div>
      </div>
    </div>
    ` : `
    <!-- Not approved: Three boxes -->
    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-header">Pemohon</div>
        <div class="signature-content">
          <div class="signature-line"></div>
          <div class="signature-name">&nbsp;</div>
          <div class="signature-date">Date: ___________</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-header">Mengetahui</div>
        <div class="signature-content">
          <div class="signature-line"></div>
          <div class="signature-name">&nbsp;</div>
          <div class="signature-date">Date: ___________</div>
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-header">Menyetujui</div>
        <div class="signature-content">
          <div class="signature-line"></div>
          <div class="signature-name">&nbsp;</div>
          <div class="signature-date">Date: ___________</div>
        </div>
      </div>
    </div>
    `}

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
