import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FileText, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMedicalClaims, useMedicalBudget } from "@/hooks/useMedicalReimbursement";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { TablePagination } from "@/components/common/TablePagination";

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

const MedicalReimbursement = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { hasRoleOrHigher } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const canViewAll = hasRoleOrHigher("admin");
  const { data: claims, isLoading } = useMedicalClaims({ status: statusFilter });
  const { data: budget, isLoading: budgetLoading } = useMedicalBudget();

  const filteredClaims = claims?.filter((claim) =>
    claim.claim_number.toLowerCase().includes(search.toLowerCase()) ||
    claim.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    (claim.employee?.full_name || "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  const paginatedClaims = filteredClaims.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredClaims.length / pageSize);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            {t("medical.title")}
          </h1>
          <p className="text-muted-foreground">{t("medical.description")}</p>
        </div>
        <Button onClick={() => navigate("/medical-reimbursement/new")}>
          <Plus className="h-4 w-4 mr-2" />
          {t("medical.createNew")}
        </Button>
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medical.annualEntitlement")}</CardDescription>
            <CardTitle className="text-2xl">
              {budgetLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                formatCurrency(budget?.total_entitlement || 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{t("medical.yearLabel")} {new Date().getFullYear()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medical.usedAmount")}</CardDescription>
            <CardTitle className="text-2xl text-warning">
              {budgetLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                formatCurrency(budget?.used_amount || 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {budget ? Math.round((budget.used_amount / budget.total_entitlement) * 100) : 0}% {t("medical.utilized")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("medical.remainingBalance")}</CardDescription>
            <CardTitle className="text-2xl text-success">
              {budgetLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                formatCurrency(budget?.remaining_amount || 0)
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{t("medical.availableForClaims")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t("medical.claimsList")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("medical.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t("status.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("status.all")}</SelectItem>
                <SelectItem value="draft">{t("status.draft")}</SelectItem>
                <SelectItem value="submitted">{t("status.submitted")}</SelectItem>
                <SelectItem value="review_hrga">{t("medical.statusReviewHRGA")}</SelectItem>
                <SelectItem value="review_finance">{t("medical.statusReviewFinance")}</SelectItem>
                <SelectItem value="approved">{t("status.approved")}</SelectItem>
                <SelectItem value="paid">{t("status.paid")}</SelectItem>
                <SelectItem value="closed">{t("medical.statusClosed")}</SelectItem>
                <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : paginatedClaims.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("medical.noData")}</h3>
              <p className="text-muted-foreground mb-4">{t("medical.noDataDesc")}</p>
              <Button onClick={() => navigate("/medical-reimbursement/new")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("medical.createFirst")}
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("medical.claimNumber")}</TableHead>
                      {canViewAll && <TableHead>{t("medical.employee")}</TableHead>}
                      <TableHead>{t("medical.patientName")}</TableHead>
                      <TableHead>{t("medical.claimType")}</TableHead>
                      <TableHead className="text-right">{t("medical.claimAmount")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedClaims.map((claim) => (
                      <TableRow
                        key={claim.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/medical-reimbursement/${claim.id}`)}
                      >
                        <TableCell className="font-medium">{claim.claim_number}</TableCell>
                        {canViewAll && (
                          <TableCell>{claim.employee?.full_name || "-"}</TableCell>
                        )}
                        <TableCell>{claim.patient_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t(`medical.type.${claim.claim_type}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(claim.claim_amount)}
                        </TableCell>
                        <TableCell>
                          <MedicalStatusBadge status={claim.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(claim.created_at), {
                            addSuffix: true,
                            locale: language === "id" ? idLocale : enUS,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            {t("action.view")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={page}
                pageSize={pageSize}
                totalItems={filteredClaims.length}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicalReimbursement;
