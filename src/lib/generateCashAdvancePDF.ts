import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { escapeHtml } from './htmlEscape';

export interface CashAdvanceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  category?: { name: string; code: string } | null;
}

export interface CashAdvancePDFData {
  ca_number: string;
  purpose: string;
  total_amount: number;
  needed_date: string;
  created_at: string;
  approved_at?: string | null;
  status: string;
  notes?: string | null;
  division?: { name: string; code: string };
  requester?: { full_name: string };
  approver?: { full_name: string } | null;
  funding_source?: { name: string; type: string } | null;
  items: CashAdvanceItem[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
  }).format(amount);
};

export const generateCashAdvanceHTML = (data: CashAdvancePDFData, logoBase64?: string): string => {
  const safeCaNumber = escapeHtml(data.ca_number);
  const safePurpose = escapeHtml(data.purpose);
  const safeDivisionName = escapeHtml(data.division?.name) || '-';
  const safeDivisionCode = escapeHtml(data.division?.code) || '';
  const safeRequesterName = escapeHtml(data.requester?.full_name) || '-';
  const safeApproverName = escapeHtml(data.approver?.full_name) || '';
  const safeFundingSourceName = escapeHtml(data.funding_source?.name) || '-';
  const safeNotes = escapeHtml(data.notes) || '-';

  const neededDate = format(new Date(data.needed_date), 'dd MMM yyyy', { locale: localeId });
  const createdDate = format(new Date(data.created_at), 'dd MMM yyyy', { locale: localeId });
  const printDate = format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId });
  const approvedDate = data.approved_at ? format(new Date(data.approved_at), 'dd MMM yyyy', { locale: localeId }) : '';

  const isApproved = ['approved', 'paid', 'partially_settled', 'settled'].includes(data.status);

  const divisionDisplay = safeDivisionCode 
    ? `${safeDivisionName} (${safeDivisionCode})`
    : safeDivisionName;

  const logoImg = logoBase64 
    ? `<img src="${logoBase64}" alt="Kemika" style="height: 60px;" />`
    : `<img src="/lovable-uploads/cb7d852a-00a6-461a-ad8f-806dbf150cf5.png" alt="Kemika" style="height: 60px;" onerror="this.outerHTML='<div style=\\'font-size: 24px; font-weight: bold; color: #1a5f2a; font-style: italic;\\'>Kemika</div><div style=\\'font-size: 10px; color: #333; font-style: italic;\\'>SPREADING SOLUTIONS</div>'" />`;

  // Generate items rows
  const itemsRows = data.items.map((item, index) => {
    const categoryDisplay = item.category 
      ? `${escapeHtml(item.category.code)} - ${escapeHtml(item.category.name)}`
      : '-';
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="category">${categoryDisplay}</td>
        <td class="description">${escapeHtml(item.description)}</td>
        <td class="qty">${item.quantity}</td>
        <td class="amount">Rp. ${formatCurrency(item.unit_price)}</td>
        <td class="amount">Rp. ${formatCurrency(item.amount)}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Cash Advance ${safeCaNumber}</title>
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
      padding: 8px 10px;
      border: 1px solid #333;
      vertical-align: top;
    }
    table.main-table .num { text-align: center; width: 35px; }
    table.main-table .category { width: 120px; }
    table.main-table .qty { text-align: center; width: 50px; }
    table.main-table .amount { text-align: right; white-space: nowrap; min-width: 100px; }
    table.main-table .description { word-wrap: break-word; }
    table.main-table tfoot td {
      font-weight: bold;
      background: #f5f5f5;
    }
    
    .notes-section {
      border: 1px solid #666;
      margin-bottom: 10px;
      padding: 10px;
    }
    .notes-section .label {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .signature-section {
      display: table;
      width: 100%;
      margin-bottom: 15px;
      margin-top: 50px;
      border-collapse: collapse;
      border: 1px solid #333;
    }
    .signature-row {
      display: table-row;
    }
    .signature-box {
      display: table-cell;
      text-align: center;
      border-right: 1px solid #333;
      width: 33.33%;
      vertical-align: top;
    }
    .signature-box:last-child { border-right: none; }
    .signature-header {
      background-color: #c4a000;
      color: #ffffff;
      padding: 8px 6px;
      font-weight: bold;
      border-bottom: 1px solid #333;
      font-size: 10pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .signature-content {
      padding: 15px 10px;
      min-height: 90px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      background: #ffffff;
    }
    .signature-name {
      font-weight: bold;
      min-height: 22px;
      font-size: 10pt;
      color: #000;
    }
    .signature-line {
      border-bottom: 1px solid #333;
      width: 85%;
      margin: 0 auto;
      margin-bottom: 8px;
    }
    .signature-date {
      font-size: 9pt;
      color: #555;
      margin-top: 2px;
    }
    
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
        <div class="doc-title">CASH ADVANCE</div>
        <div class="doc-info-box">
          <table>
            <tr>
              <td class="label">No.</td>
              <td class="value">: ${safeCaNumber}</td>
            </tr>
            <tr>
              <td class="label">Date</td>
              <td class="value">: ${createdDate}</td>
            </tr>
          </table>
        </div>
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
          <span class="info-label">Divisi</span>
          <span class="info-colon">:</span>
          <span class="info-value">${divisionDisplay}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Keperluan</span>
          <span class="info-colon">:</span>
          <span class="info-value">${safePurpose}</span>
        </div>
      </div>
      <div class="info-right">
        <div class="info-item">
          <span class="info-label">Tanggal Dibutuhkan</span>
          <span class="info-colon">:</span>
          <span class="info-value">${neededDate}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Sumber Dana</span>
          <span class="info-colon">:</span>
          <span class="info-value">${safeFundingSourceName}</span>
        </div>
      </div>
    </div>

    <table class="main-table">
      <thead>
        <tr>
          <th class="num">No.</th>
          <th class="category">Kategori</th>
          <th>Keterangan</th>
          <th class="qty">Qty</th>
          <th class="amount">Harga Satuan</th>
          <th class="amount">Jumlah</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align: right;">Total</td>
          <td class="amount">Rp. ${formatCurrency(data.total_amount)}</td>
        </tr>
      </tfoot>
    </table>

    ${safeNotes !== '-' ? `
    <div class="notes-section">
      <div class="label">Catatan:</div>
      <div>${safeNotes}</div>
    </div>
    ` : ''}

    ${isApproved && safeApproverName ? `
    <!-- Approved: Single wide box -->
    <div class="approved-signature-section">
      <div class="approved-signature-header">Menyetujui</div>
      <div class="approved-signature-content">
        <div class="approved-check">&#10004; APPROVED</div>
        <div class="approved-by"><strong>Approved by:</strong> ${safeApproverName}</div>
        <div class="approved-at"><strong>Approved at:</strong> ${approvedDate}</div>
      </div>
    </div>
    ` : `
    <!-- Not yet approved: 3-column signature layout -->
    <table class="signature-section">
      <tr class="signature-row">
        <td class="signature-box">
          <div class="signature-header">Pemohon</div>
          <div class="signature-content">
            <div class="signature-line"></div>
            <div class="signature-name">${safeRequesterName}</div>
            <div class="signature-date">${createdDate}</div>
          </div>
        </td>
        <td class="signature-box">
          <div class="signature-header">Mengetahui</div>
          <div class="signature-content">
            <div class="signature-line"></div>
            <div class="signature-name">&nbsp;</div>
            <div class="signature-date">&nbsp;</div>
          </div>
        </td>
        <td class="signature-box">
          <div class="signature-header">Menyetujui</div>
          <div class="signature-content">
            <div class="signature-line"></div>
            <div class="signature-name">&nbsp;</div>
            <div class="signature-date">&nbsp;</div>
          </div>
        </td>
      </tr>
    </table>
    `}

    <div class="footer">
      <p>Dokumen ini digenerate secara otomatis oleh sistem | Dicetak: ${printDate}</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const previewCashAdvancePDF = (data: CashAdvancePDFData, logoBase64?: string): void => {
  const html = generateCashAdvanceHTML(data, logoBase64);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
};
