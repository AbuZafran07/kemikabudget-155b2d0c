import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, FileText, Send, CheckCircle, XCircle, CreditCard, Lock, Printer, Image, File, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  useMedicalClaim,
  useMedicalClaimEvents,
  useMedicalClaimAttachments,
  useSubmitMedicalClaim,
  useReviewMedicalClaimHRGA,
  useReviewMedicalClaimFinance,
  usePayMedicalClaim,
  useCloseMedicalClaim,
} from "@/hooks/useMedicalReimbursement";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import MedicalClaimPDFPreviewDialog from "@/components/medical/MedicalClaimPDFPreviewDialog";

const MedicalStatusBadge = ({ status }: { status: string }) => {
  const { t } = useLanguage();
  
  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: t("status.draft"), className: "bg-muted text-muted-foreground border-muted" },
    submitted: { label: t("status.submitted"), className: "bg-info/10 text-info border-info/20" },
    review_hrga: { label: t("medical.statusReviewHRGA"), className: "bg-warning/10 text-warning border-warning/20" },
    review_finance: { label: t("medical.statusReviewFinance"), className: "bg-warning/10 text-warning border-warning/20" },
    approved: { label: t("status.approved"), className: "bg-success/10 text-success border-success/20" },
    rejected: { label: t("status.rejected"), className: "bg-destructive/10 text-destructive border-destructive/20" },
    paid: { label: t("status.paid"), className: "bg-primary/10 text-primary border-primary/20" },
    closed: { label: t("medical.statusClosed"), className: "bg-accent/20 text-accent-foreground border-accent/30" },
    cancelled: { label: t("status.cancelled"), className: "bg-muted text-muted-foreground border-muted" },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge variant="outline" className={`font-medium border ${config.className}`}>
      {config.label}
    </Badge>
  );
};

const MedicalReimbursementDetail = () => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams();
  const { t, language } = useLanguage();
  const { user, role, hasRoleOrHigher } = useAuth();


  const { data: claim, isLoading } = useMedicalClaim(id);
  const { data: events } = useMedicalClaimEvents(id);
  const { data: attachments } = useMedicalClaimAttachments(id);

  const submitMutation = useSubmitMedicalClaim();
  const hrgaReviewMutation = useReviewMedicalClaimHRGA();
  const financeReviewMutation = useReviewMedicalClaimFinance();
  const payMutation = usePayMedicalClaim();
  const closeMutation = useCloseMedicalClaim();

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showHRGAApproveDialog, setShowHRGAApproveDialog] = useState(false);
  const [showHRGARejectDialog, setShowHRGARejectDialog] = useState(false);
  const [showFinanceApproveDialog, setShowFinanceApproveDialog] = useState(false);
  const [showFinanceRejectDialog, setShowFinanceRejectDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const [approvalNote, setApprovalNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM yyyy", {
      locale: language === "id" ? idLocale : enUS,
    });
  };

  const formatDateTime = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM yyyy, HH:mm", {
      locale: language === "id" ? idLocale : enUS,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">{t("medical.notFound")}</h3>
        <Button variant="link" onClick={() => navigate("/medical-reimbursement")}>
          {t("action.backToList")}
        </Button>
      </div>
    );
  }

  const isOwner = claim.employee_id === user?.id;
  const isHRGA = role === "admin" || role === "super_admin";
  const isFinance = role === "finance" || role === "super_admin";
  const canEdit = isOwner && ["draft", "submitted", "review_hrga"].includes(claim.status) && !claim.is_locked;
  const canSubmit = isOwner && claim.status === "draft";
  const canDelete = claim.status === "draft" && (isOwner || role === "super_admin");
  const handleDelete = async () => {
    setIsDeleting(true);
    const { data, error } = await supabase.rpc("delete_medical_claim" as any, { p_claim_id: claim.id });
    setIsDeleting(false);
    const res = data as { success?: boolean; error?: string } | null;
    if (error || !res?.success) {
      toast.error(res?.error || "Gagal menghapus draft klaim");
      return;
    }
    toast.success("Draft klaim berhasil dihapus");
    navigate("/medical-reimbursement");
  };
  // HRGA now directly approves/rejects (no finance review step)
  const canHRGAReview = isHRGA && (claim.status === "submitted" || claim.status === "review_hrga");
  // Finance step removed - HRGA directly approves
  const canFinanceReview = false; // Disabled - no longer needed
  const canPay = isFinance && claim.status === "approved";
  const canClose = isFinance && claim.status === "paid";
  const canPrintPDF = claim.status !== "draft" && claim.status !== "cancelled";

  const handleSubmit = async () => {
    await submitMutation.mutateAsync(claim.id);
    setShowSubmitDialog(false);
  };

  const handleHRGAApprove = async () => {
    await hrgaReviewMutation.mutateAsync({
      claimId: claim.id,
      action: "approve",
      note: approvalNote || undefined,
    });
    setShowHRGAApproveDialog(false);
    setApprovalNote("");
  };

  const handleHRGAReject = async () => {
    await hrgaReviewMutation.mutateAsync({
      claimId: claim.id,
      action: "reject",
      note: rejectionReason,
    });
    setShowHRGARejectDialog(false);
    setRejectionReason("");
  };

  const handleFinanceApprove = async () => {
    await financeReviewMutation.mutateAsync({
      claimId: claim.id,
      action: "approve",
      approvedAmount: approvedAmount ? parseFloat(approvedAmount) : undefined,
      note: approvalNote || undefined,
    });
    setShowFinanceApproveDialog(false);
    setApprovalNote("");
    setApprovedAmount("");
  };

  const handleFinanceReject = async () => {
    await financeReviewMutation.mutateAsync({
      claimId: claim.id,
      action: "reject",
      note: rejectionReason,
    });
    setShowFinanceRejectDialog(false);
    setRejectionReason("");
  };

  const handlePay = async () => {
    await payMutation.mutateAsync(claim.id);
    setShowPayDialog(false);
  };

  const handleClose = async () => {
    await closeMutation.mutateAsync(claim.id);
    setShowCloseDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/medical-reimbursement")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{claim.claim_number}</h1>
            <MedicalStatusBadge status={claim.status} />
          </div>
          <p className="text-muted-foreground">
            {t("medical.submittedBy")}: {claim.employee?.full_name || "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/medical-reimbursement/${claim.id}/edit`)}>
              {t("action.edit")}
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" className="text-destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Hapus Draft
            </Button>
          )}
          {canSubmit && (
            <Button onClick={() => setShowSubmitDialog(true)}>
              <Send className="h-4 w-4 mr-2" />
              {t("action.submit")}
            </Button>
          )}
          {canHRGAReview && (
            <>
              <Button variant="destructive" onClick={() => setShowHRGARejectDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                {t("action.reject")}
              </Button>
              <Button onClick={() => setShowHRGAApproveDialog(true)}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("action.approve")}
              </Button>
            </>
          )}
          {canFinanceReview && (
            <>
              <Button variant="destructive" onClick={() => setShowFinanceRejectDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                {t("action.reject")}
              </Button>
              <Button onClick={() => {
                setApprovedAmount(claim.claim_amount.toString());
                setShowFinanceApproveDialog(true);
              }}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("action.approve")}
              </Button>
            </>
          )}
          {canPay && (
            <Button onClick={() => setShowPayDialog(true)}>
              <CreditCard className="h-4 w-4 mr-2" />
              {t("action.pay")}
            </Button>
          )}
          {canClose && (
            <Button onClick={() => setShowCloseDialog(true)}>
              <Lock className="h-4 w-4 mr-2" />
              {t("medical.close")}
            </Button>
          )}
          {canPrintPDF && (
            <Button variant="outline" onClick={() => setShowPdfPreview(true)}>
              <Printer className="h-4 w-4 mr-2" />
              {t("action.printPdf")}
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("medical.claimDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.treatmentDate")}</p>
                  <p className="font-medium">{formatDate(claim.treatment_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.claimType")}</p>
                  <Badge variant="outline">{t(`medical.type.${claim.claim_type}`)}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.patientName")}</p>
                  <p className="font-medium">{claim.patient_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.patientRelationship")}</p>
                  <p className="font-medium">{t(`medical.relationship.${claim.patient_relationship}`)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.claimAmount")}</p>
                  <p className="text-xl font-bold">{formatCurrency(claim.claim_amount)}</p>
                </div>
                {claim.approved_amount && (
                  <div>
                    <p className="text-sm text-muted-foreground">{t("medical.approvedAmount")}</p>
                    <p className="text-xl font-bold text-success">{formatCurrency(claim.approved_amount)}</p>
                  </div>
                )}
              </div>

              {(claim.hospital_clinic || claim.doctor_name || claim.diagnosis) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    {claim.hospital_clinic && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("medical.hospitalClinic")}</p>
                        <p className="font-medium">{claim.hospital_clinic}</p>
                      </div>
                    )}
                    {claim.doctor_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("medical.doctorName")}</p>
                        <p className="font-medium">{claim.doctor_name}</p>
                      </div>
                    )}
                    {claim.diagnosis && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">{t("medical.diagnosis")}</p>
                        <p className="font-medium">{claim.diagnosis}</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {claim.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("common.notes")}</p>
                    <p className="font-medium">{claim.notes}</p>
                  </div>
                </>
              )}

              {claim.rejection_reason && (
                <>
                  <Separator />
                  <div className="p-4 bg-destructive/10 rounded-lg">
                    <p className="text-sm font-medium text-destructive">{t("medical.rejectionReason")}</p>
                    <p className="text-destructive">{claim.rejection_reason}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tabs for Timeline & Attachments */}
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">{t("medical.timeline")}</TabsTrigger>
              <TabsTrigger value="attachments">{t("medical.attachments")}</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {events && events.length > 0 ? (
                    <div className="space-y-4">
                      {events.map((event, index) => (
                        <div key={event.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            {index < events.length - 1 && (
                              <div className="w-0.5 h-full bg-border mt-2" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="font-medium">{event.description}</p>
                            <p className="text-sm text-muted-foreground">
                              {event.performer?.full_name} • {formatDateTime(event.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      {t("medical.noActivity")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="attachments" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {attachments && attachments.length > 0 ? (
                    <div className="space-y-2">
                        {attachments.map((att) => {
                          const getFileIcon = (fileType: string) => {
                            if (fileType.startsWith("image/")) return <Image className="h-5 w-5 text-muted-foreground" />;
                            if (fileType === "application/pdf") return <FileText className="h-5 w-5 text-muted-foreground" />;
                            return <File className="h-5 w-5 text-muted-foreground" />;
                          };

                          const getAttachmentTypeLabel = (type: string) => {
                            const labels: Record<string, { id: string; en: string }> = {
                              receipt: { id: "Kwitansi", en: "Receipt" },
                              prescription: { id: "Resep Obat", en: "Prescription" },
                              referral: { id: "Surat Rujukan", en: "Referral Letter" },
                              lab_result: { id: "Hasil Lab", en: "Lab Result" },
                              medical_report: { id: "Laporan Medis", en: "Medical Report" },
                              other: { id: "Lainnya", en: "Other" },
                            };
                            return labels[type]?.[language] || type;
                          };

                          const handleViewAttachment = async () => {
                            try {
                              const { data, error } = await supabase.storage
                                .from("medical-attachments")
                                .createSignedUrl(att.file_path, 60);
                              if (error) throw error;
                              window.open(data.signedUrl, "_blank");
                            } catch (error: any) {
                              toast.error(t("medical.attachment.viewError"));
                            }
                          };

                          return (
                            <div key={att.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                              {getFileIcon(att.file_type)}
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={handleViewAttachment}
                                  className="font-medium text-primary hover:underline truncate block text-left w-full"
                                >
                                  {att.file_name}
                                </button>
                                <p className="text-sm text-muted-foreground">
                                  {getAttachmentTypeLabel(att.attachment_type)} • {(att.file_size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleViewAttachment}
                                className="flex-shrink-0"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        {t("medical.noAttachments")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

        {/* Right Column - Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("medical.claimInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                <MedicalStatusBadge status={claim.status} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("medical.claimDate")}</p>
                <p className="font-medium">{formatDate(claim.claim_date)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("common.createdAt")}</p>
                <p className="font-medium">{formatDateTime(claim.created_at)}</p>
              </div>
              {claim.submitted_at && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.submittedAt")}</p>
                  <p className="font-medium">{formatDateTime(claim.submitted_at)}</p>
                </div>
              )}
              {claim.approved_at && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.approvedAt")}</p>
                  <p className="font-medium">{formatDateTime(claim.approved_at)}</p>
                </div>
              )}
              {claim.paid_at && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.paidAt")}</p>
                  <p className="font-medium">{formatDateTime(claim.paid_at)}</p>
                </div>
              )}
              {claim.closed_at && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("medical.closedAt")}</p>
                  <p className="font-medium">{formatDateTime(claim.closed_at)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmSubmit")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmSubmitDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? t("common.processing") : t("action.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showHRGAApproveDialog} onOpenChange={setShowHRGAApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmHRGAApprove")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmHRGAApproveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>{t("medical.approvalNote")}</Label>
            <Textarea
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder={t("medical.approvalNotePlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleHRGAApprove} disabled={hrgaReviewMutation.isPending}>
              {hrgaReviewMutation.isPending ? t("common.processing") : t("medical.forwardToFinance")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showHRGARejectDialog} onOpenChange={setShowHRGARejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmReject")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmRejectDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>{t("medical.rejectionReason")} *</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t("medical.rejectionReasonPlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHRGAReject}
              disabled={!rejectionReason.trim() || hrgaReviewMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hrgaReviewMutation.isPending ? t("common.processing") : t("action.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFinanceApproveDialog} onOpenChange={setShowFinanceApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmFinanceApprove")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmFinanceApproveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>{t("medical.approvedAmount")}</Label>
              <Input
                type="number"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t("medical.originalAmount")}: {formatCurrency(claim.claim_amount)}
              </p>
            </div>
            <div>
              <Label>{t("medical.approvalNote")}</Label>
              <Textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder={t("medical.approvalNotePlaceholder")}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinanceApprove} disabled={financeReviewMutation.isPending}>
              {financeReviewMutation.isPending ? t("common.processing") : t("action.approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFinanceRejectDialog} onOpenChange={setShowFinanceRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmReject")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmRejectDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>{t("medical.rejectionReason")} *</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t("medical.rejectionReasonPlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinanceReject}
              disabled={!rejectionReason.trim() || financeReviewMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {financeReviewMutation.isPending ? t("common.processing") : t("action.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmPay")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmPayDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-lg font-semibold">
              {formatCurrency(claim.approved_amount || claim.claim_amount)}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handlePay} disabled={payMutation.isPending}>
              {payMutation.isPending ? t("common.processing") : t("action.pay")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("medical.confirmClose")}</AlertDialogTitle>
            <AlertDialogDescription>{t("medical.confirmCloseDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? t("common.processing") : t("medical.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview */}
      <MedicalClaimPDFPreviewDialog
        open={showPdfPreview}
        onOpenChange={setShowPdfPreview}
        claim={claim}
      />
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Draft Klaim?</AlertDialogTitle>
            <AlertDialogDescription>Draft {claim.claim_number} beserta lampirannya akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MedicalReimbursementDetail;
