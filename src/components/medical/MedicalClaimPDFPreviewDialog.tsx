import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MedicalClaim } from "@/hooks/useMedicalReimbursement";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { exportStyledHtmlToPdf } from "@/lib/html2pdfExport";
import logoKemika from "@/assets/logo-kemika.png";

interface MedicalClaimPDFPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: MedicalClaim | null;
}

const MedicalClaimPDFPreviewDialog = ({ open, onOpenChange, claim }: MedicalClaimPDFPreviewDialogProps) => {
  const { t, language } = useLanguage();
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch approver names
  const { data: approvers } = useQuery({
    queryKey: ["medical-claim-approvers", claim?.id],
    queryFn: async () => {
      if (!claim) return null;

      const approverIds = [claim.reviewed_hrga_by, claim.reviewed_finance_by, claim.approved_by, claim.paid_by].filter(
        Boolean,
      );

      if (approverIds.length === 0) return {};

      const { data } = await supabase.from("profiles_secure").select("id, full_name").in("id", approverIds);

      const map: Record<string, string> = {};
      data?.forEach((p) => {
        if (p.id) map[p.id] = p.full_name || "";
      });
      return map;
    },
    enabled: !!claim,
  });

  if (!claim) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMMM yyyy", {
      locale: language === "id" ? idLocale : enUS,
    });
  };

  const isApproved = ["approved", "paid", "closed"].includes(claim.status);

  const getClaimTypeLabel = (type: string) => {
    const types: Record<string, { id: string; en: string }> = {
      outpatient: { id: "Rawat Jalan", en: "Outpatient" },
      inpatient: { id: "Rawat Inap", en: "Inpatient" },
      dental: { id: "Gigi", en: "Dental" },
      optical: { id: "Mata", en: "Optical" },
      maternity: { id: "Persalinan", en: "Maternity" },
      other: { id: "Lainnya", en: "Other" },
    };
    return types[type]?.[language] || type;
  };

  const getRelationshipLabel = (rel: string) => {
    const rels: Record<string, { id: string; en: string }> = {
      self: { id: "Sendiri", en: "Self" },
      spouse: { id: "Pasangan", en: "Spouse" },
      child: { id: "Anak", en: "Child" },
    };
    return rels[rel]?.[language] || rel;
  };

  const generatePdfHtml = () => {
    const hrgaApprover = claim.reviewed_hrga_by && approvers ? approvers[claim.reviewed_hrga_by] : "";
    const financeApprover = claim.approved_by && approvers ? approvers[claim.approved_by] : "";
    
    // Format print date like budget submission: "09 Februari 2026 14:31"
    const printDate = format(new Date(), "dd MMMM yyyy HH:mm", {
      locale: language === "id" ? idLocale : enUS,
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; line-height: 1.4; color: #1a1a1a; background: white; }
          .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; background: white; }
          
          .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #1a365d; }
          .header img { height: 60px; }
          .header-text h1 { font-size: 18pt; font-weight: bold; color: #1a365d; margin-bottom: 4px; }
          .header-text p { font-size: 9pt; color: #666; }
          
          .doc-title { text-align: center; margin-bottom: 25px; }
          .doc-title h2 { font-size: 14pt; font-weight: bold; color: #1a365d; text-transform: uppercase; letter-spacing: 1px; }
          .doc-title .doc-number { font-size: 11pt; color: #666; margin-top: 5px; }
          
          .section { margin-bottom: 20px; }
          .section-title { font-size: 11pt; font-weight: bold; color: #1a365d; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
          
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .info-item { display: flex; }
          .info-label { width: 140px; font-weight: 500; color: #666; }
          .info-value { flex: 1; font-weight: 500; }
          
          .amount-box { background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
          .amount-box .label { font-size: 10pt; color: #0369a1; margin-bottom: 5px; }
          .amount-box .value { font-size: 18pt; font-weight: bold; color: #0369a1; }
          
          .approved-box { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
          .approved-box .label { font-size: 10pt; color: #15803d; margin-bottom: 5px; }
          .approved-box .value { font-size: 18pt; font-weight: bold; color: #15803d; }
          
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
          .signature-box { text-align: center; }
          .signature-box .title { font-size: 10pt; color: #666; margin-bottom: 60px; }
          .signature-box .name { font-weight: bold; border-top: 1px solid #333; padding-top: 5px; min-width: 150px; display: inline-block; }
          .signature-box .role { font-size: 9pt; color: #666; }
          
          .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9pt; color: #666; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <img src="${logoKemika}" alt="Logo" />
            <div class="header-text">
              <h1>PT. KEMIKA KARYA PRATAMA</h1>
              <p>Jl. Puri Beta Selatan Raya No. 78 Larangan Utara, Kota Tangerang 15154</p>
            </div>
          </div>
          
          <div class="doc-title">
            <h2>${language === "id" ? "FORMULIR KLAIM MEDICAL" : "MEDICAL CLAIM FORM"}</h2>
            <div class="doc-number">${claim.claim_number}</div>
          </div>
          
          <div class="section">
            <div class="section-title">${language === "id" ? "Informasi Karyawan" : "Employee Information"}</div>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Nama Karyawan" : "Employee Name"}</span>
                <span class="info-value">: ${claim.employee?.full_name || "-"}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Tanggal Klaim" : "Claim Date"}</span>
                <span class="info-value">: ${formatDate(claim.claim_date)}</span>
              </div>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">${language === "id" ? "Detail Klaim" : "Claim Details"}</div>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Tanggal Perawatan" : "Treatment Date"}</span>
                <span class="info-value">: ${formatDate(claim.treatment_date)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Jenis Klaim" : "Claim Type"}</span>
                <span class="info-value">: ${getClaimTypeLabel(claim.claim_type)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Nama Pasien" : "Patient Name"}</span>
                <span class="info-value">: ${claim.patient_name}</span>
              </div>
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Hubungan" : "Relationship"}</span>
                <span class="info-value">: ${getRelationshipLabel(claim.patient_relationship)}</span>
              </div>
              ${
                claim.hospital_clinic
                  ? `
              <div class="info-item">
                <span class="info-label">${language === "id" ? "RS / Klinik" : "Hospital / Clinic"}</span>
                <span class="info-value">: ${claim.hospital_clinic}</span>
              </div>
              `
                  : ""
              }
              ${
                claim.doctor_name
                  ? `
              <div class="info-item">
                <span class="info-label">${language === "id" ? "Nama Dokter" : "Doctor Name"}</span>
                <span class="info-value">: ${claim.doctor_name}</span>
              </div>
              `
                  : ""
              }
              ${
                claim.diagnosis
                  ? `
              <div class="info-item" style="grid-column: span 2;">
                <span class="info-label">${language === "id" ? "Diagnosa" : "Diagnosis"}</span>
                <span class="info-value">: ${claim.diagnosis}</span>
              </div>
              `
                  : ""
              }
            </div>
          </div>
          
          <div class="amount-box">
            <div class="label">${language === "id" ? "JUMLAH KLAIM" : "CLAIM AMOUNT"}</div>
            <div class="value">${formatCurrency(claim.claim_amount)}</div>
          </div>
          
          ${
            isApproved && claim.approved_amount
              ? `
          <div class="approved-box">
            <div class="label">✓ ${language === "id" ? "JUMLAH DISETUJUI" : "APPROVED AMOUNT"}</div>
            <div class="value">${formatCurrency(claim.approved_amount)}</div>
          </div>
          `
              : ""
          }
          
          ${
            claim.notes
              ? `
          <div class="section">
            <div class="section-title">${language === "id" ? "Catatan" : "Notes"}</div>
            <p>${claim.notes}</p>
          </div>
          `
              : ""
          }
          
          <div class="signatures">
            <div class="signature-box">
              <div class="title">${language === "id" ? "Diverifikasi oleh HRGA" : "Verified by HRGA"}</div>
              <div class="name">${hrgaApprover || "____________________"}</div>
              <div class="role">HRGA</div>
            </div>
            <div class="signature-box">
              <div class="title">${language === "id" ? "Disetujui oleh Finance" : "Approved by Finance"}</div>
              <div class="name">${financeApprover || "____________________"}</div>
              <div class="role">Finance</div>
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

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(generatePdfHtml());
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const html = generatePdfHtml();
      await exportStyledHtmlToPdf({
        html,
        fileName: `${claim.claim_number.replace(/\//g, "-")}.pdf`,
        marginMm: 0,
      });
    } catch (error) {
      console.error("PDF download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("medical.pdfPreview")}</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              {t("action.print")}
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={isDownloading}>
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? t("common.processing") : t("action.download")}
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/50 p-4 rounded-lg">
          <iframe
            srcDoc={generatePdfHtml()}
            className="w-full h-[70vh] bg-white rounded shadow-lg"
            title="PDF Preview"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalClaimPDFPreviewDialog;
