import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  CreditCard,
  FileText,
  Plus,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { CashAdvancePDFPreviewDialog } from "@/components/cashadvance/CashAdvancePDFPreviewDialog";
import type { CashAdvancePDFData } from "@/lib/generateCashAdvancePDF";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/common/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

import {
  useCashAdvance,
  useCashAdvanceItems,
  useCashAdvanceEvents,
  useCashAdvanceSettlements,
  useSubmitCashAdvance,
  useApproveCashAdvance,
  useRejectCashAdvance,
  usePayCashAdvance,
} from "@/hooks/useCashAdvance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const CashAdvanceDetail = () => {
  const { t, language } = useLanguage();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();


  const [activeTab, setActiveTab] = useState("items");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedFundingSource, setSelectedFundingSource] = useState("");

  const { data: ca, isLoading } = useCashAdvance(id || "");
  const { data: items } = useCashAdvanceItems(id || "");
  const { data: events } = useCashAdvanceEvents(id || "");
  const { data: settlements } = useCashAdvanceSettlements(id || "");

  const submitCashAdvance = useSubmitCashAdvance();
  const approveCashAdvance = useApproveCashAdvance();
  const rejectCashAdvance = useRejectCashAdvance();
  const payCashAdvance = usePayCashAdvance();

  // Fetch funding sources for payment
  const { data: fundingSources } = useQuery({
    queryKey: ["funding-sources-options"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_funding_source_options");
      if (error) throw error;
      return data;
    },
    enabled: role === "super_admin" || role === "finance",
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!ca) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t("cashAdvance.notFound")}</h2>
        <Button onClick={() => navigate("/cash-advance")}>{t("action.backToList")}</Button>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return format(new Date(dateString), "dd MMM yyyy HH:mm", {
      locale: language === "id" ? idLocale : undefined,
    });
  };

  const canSubmit = ca.status === "draft" && ca.requester_id === user?.id;
  const canApprove = (ca.status === "submitted" || ca.status === "under_review") && role === "super_admin";
  const canPay = ca.status === "approved" && (role === "super_admin" || role === "finance");
  const canAddSettlement = ca.status === "paid" && ca.requester_id === user?.id;

  // Calculate actual realized from settlements (including submitted/approved, not just DB field)
  const calculatedRealized = (() => {
    if (ca.total_realized && ca.total_realized > 0) return ca.total_realized;
    if (!settlements || settlements.length === 0) return 0;
    // Sum total_realized from non-rejected settlements
    return settlements
      .filter(s => s.status !== 'rejected')
      .reduce((sum, s) => sum + s.total_realized, 0);
  })();
  
  const balance = ca.total_amount - calculatedRealized;
  const commitmentLocked = ca.status !== "draft" && ca.status !== "rejected" && ca.status !== "cancelled" && ca.status !== "settled";

  const handleSubmit = async () => {
    await submitCashAdvance.mutateAsync(ca.id);
  };

  const handleApprove = async () => {
    await approveCashAdvance.mutateAsync({ caId: ca.id, note: approvalNote || undefined });
    setShowApproveDialog(false);
    setApprovalNote("");
  };

  const handleReject = async () => {
    await rejectCashAdvance.mutateAsync({ caId: ca.id, reason: rejectionReason });
    setShowRejectDialog(false);
    setRejectionReason("");
  };

  const handlePay = async () => {
    await payCashAdvance.mutateAsync({ caId: ca.id, fundingSourceId: selectedFundingSource });
    setShowPayDialog(false);
    setSelectedFundingSource("");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cash-advance")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{ca.ca_number}</h1>
              <StatusBadge status={ca.status} />
            </div>
            <p className="text-muted-foreground">{ca.purpose}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <Button onClick={handleSubmit} disabled={submitCashAdvance.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {t("action.submit")}
            </Button>
          )}
          {canApprove && (
            <>
              <Button variant="outline" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                {t("action.reject")}
              </Button>
              <Button onClick={() => setShowApproveDialog(true)}>
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
          {canAddSettlement && (
            <Button onClick={() => navigate(`/cash-advance/${ca.id}/settlement/new`)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("cashAdvance.addRealization")}
            </Button>
          )}
          {(ca.status === "approved" || ca.status === "paid" || ca.status === "partially_settled" || ca.status === "settled") && (
            <Button variant="outline" onClick={() => setShowPdfPreview(true)}>
              <FileText className="h-4 w-4 mr-2" />
              {t("action.printPdf")}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("cashAdvance.totalCA")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ca.total_amount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("cashAdvance.commitmentLocked")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {commitmentLocked ? formatCurrency(ca.total_amount) : formatCurrency(0)}
            </div>
            {commitmentLocked && (
              <Badge variant="secondary" className="mt-1">
                <Clock className="h-3 w-3 mr-1" />
                {t("cashAdvance.locked")}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("cashAdvance.realizedActual")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(calculatedRealized)}</div>
            {calculatedRealized > 0 && !ca.total_realized && (
              <Badge variant="secondary" className="mt-1">
                <Clock className="h-3 w-3 mr-1" />
                Pending Approval
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("cashAdvance.balance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance > 0 ? "text-primary" : balance < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(balance)}
            </div>
            {ca.status === "settled" && balance > 0 && (
              <Badge variant="outline" className="mt-1 text-primary">
                {t("cashAdvance.refundRequired")}
              </Badge>
            )}
            {ca.status === "settled" && balance < 0 && (
              <Badge variant="outline" className="mt-1 text-destructive">
                {t("cashAdvance.topUpRequired")}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items">{t("cashAdvance.items")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("cashAdvance.timeline")}</TabsTrigger>
          <TabsTrigger value="settlements">{t("cashAdvance.settlements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.itemDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("common.category")}</TableHead>
                    <TableHead>{t("cashAdvance.itemDescription")}</TableHead>
                    <TableHead className="text-right">{t("cashAdvance.quantity")}</TableHead>
                    <TableHead className="text-right">{t("cashAdvance.unitPrice")}</TableHead>
                    <TableHead className="text-right">{t("cashAdvance.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items?.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        {item.category ? `${item.category.code} - ${item.category.name}` : "-"}
                      </TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-semibold">
                      {t("cashAdvance.totalAmount")}
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(ca.total_amount)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Request Info */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{t("cashAdvance.requestInfo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">{t("common.division")}</dt>
                  <dd className="font-medium">{ca.division?.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t("cashAdvance.requester")}</dt>
                  <dd className="font-medium">{ca.requester?.full_name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t("cashAdvance.neededDate")}</dt>
                  <dd className="font-medium">{format(new Date(ca.needed_date), "dd MMM yyyy")}</dd>
                </div>
                {ca.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">{t("common.notes")}</dt>
                    <dd className="font-medium">{ca.notes}</dd>
                  </div>
                )}
                {ca.approved_by && (
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("cashAdvance.approvedBy")}</dt>
                    <dd className="font-medium">{ca.approver?.full_name} - {formatDate(ca.approved_at)}</dd>
                  </div>
                )}
                {ca.paid_by && (
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("cashAdvance.paidBy")}</dt>
                    <dd className="font-medium">{ca.payer?.full_name} - {formatDate(ca.paid_at)}</dd>
                  </div>
                )}
                {ca.funding_source && (
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("cashAdvance.fundingSource")}</dt>
                    <dd className="font-medium">{ca.funding_source.name}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("cashAdvance.activityTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              {events && events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                        <div className="w-px h-full bg-border" />
                      </div>
                      <div className="pb-4">
                        <p className="font-medium">{event.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {event.performer?.full_name} • {formatDate(event.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">{t("cashAdvance.noActivity")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settlements" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("cashAdvance.settlements")}</CardTitle>
              {canAddSettlement && (
                <Button onClick={() => navigate(`/cash-advance/${ca.id}/settlement/new`)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("cashAdvance.addRealization")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {settlements && settlements.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("cashAdvance.settlementNumber")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="text-right">{t("cashAdvance.totalRealized")}</TableHead>
                      <TableHead className="text-right">{t("cashAdvance.variance")}</TableHead>
                      <TableHead>{t("common.createdAt")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((settlement) => (
                      <TableRow
                        key={settlement.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/cash-advance/${ca.id}/settlement/${settlement.id}`)}
                      >
                        <TableCell className="font-medium">{settlement.settlement_number}</TableCell>
                        <TableCell>
                          <Badge variant={settlement.status === "approved" ? "default" : "secondary"}>
                            {t(`status.${settlement.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(settlement.total_realized)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(settlement.variance_amount)}
                        </TableCell>
                        <TableCell>{formatDate(settlement.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">{t("cashAdvance.noSettlements")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cashAdvance.confirmApprove")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cashAdvance.confirmApproveDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>{t("cashAdvance.approvalNote")}</Label>
            <Textarea
              placeholder={t("cashAdvance.approvalNotePlaceholder")}
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approveCashAdvance.isPending}>
              {t("action.approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cashAdvance.confirmReject")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cashAdvance.confirmRejectDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>{t("cashAdvance.rejectionReason")} *</Label>
            <Textarea
              placeholder={t("cashAdvance.rejectionReasonPlaceholder")}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectionReason.trim() || rejectCashAdvance.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("action.reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Dialog */}
      <AlertDialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cashAdvance.confirmPay")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cashAdvance.confirmPayDesc")}
              <br />
              <span className="font-semibold text-foreground">
                {t("cashAdvance.totalAmount")}: {formatCurrency(ca.total_amount)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>{t("cashAdvance.selectFundingSource")} *</Label>
            <Select value={selectedFundingSource} onValueChange={setSelectedFundingSource}>
              <SelectTrigger>
                <SelectValue placeholder={t("cashAdvance.selectFundingSourcePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {fundingSources?.map((source: { id: string; name: string; code: string }) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.code} - {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePay}
              disabled={!selectedFundingSource || payCashAdvance.isPending}
            >
              {t("action.pay")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview Dialog */}
      <CashAdvancePDFPreviewDialog
        open={showPdfPreview}
        onOpenChange={setShowPdfPreview}
        data={ca && items ? {
          ca_number: ca.ca_number,
          purpose: ca.purpose,
          total_amount: ca.total_amount,
          needed_date: ca.needed_date,
          created_at: ca.created_at,
          submitted_at: ca.submitted_at,
          approved_at: ca.approved_at,
          paid_at: ca.paid_at,
          status: ca.status,
          notes: ca.notes,
          division: ca.division ? { name: ca.division.name, code: ca.division.code } : undefined,
          requester: ca.requester ? { full_name: ca.requester.full_name, signature_url: (ca.requester as any).signature_url } : undefined,
          approver: ca.approver ? { full_name: ca.approver.full_name, signature_url: (ca.approver as any).signature_url } : null,
          payer: ca.payer ? { full_name: ca.payer.full_name, signature_url: (ca.payer as any).signature_url } : null,
          funding_source: ca.funding_source ? { name: ca.funding_source.name, type: 'petty_cash' } : null,
          items: items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
            category: item.category ? { name: item.category.name, code: item.category.code } : null,
          })),
        } as CashAdvancePDFData : null}
      />
    </div>
  );
};

export default CashAdvanceDetail;
