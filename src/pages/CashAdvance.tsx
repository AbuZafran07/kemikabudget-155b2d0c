import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/common/StatusBadge";
import { TablePagination } from "@/components/common/TablePagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCashAdvances } from "@/hooks/useCashAdvance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const CashAdvance = () => {
  const { t, language } = useLanguage();
  const { role, profile } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: cashAdvances, isLoading } = useCashAdvances({
    status: statusFilter,
    division_id: divisionFilter || undefined,
    search: search || undefined,
  });

  const { data: divisions } = useQuery({
    queryKey: ["divisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const canViewAllDivisions = role === "super_admin" || role === "finance";

  // Pagination
  const filteredData = cashAdvances || [];
  const totalItems = filteredData.length;
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return format(new Date(dateString), "dd MMM yyyy", {
      locale: language === "id" ? idLocale : undefined,
    });
  };

  const getBalance = (ca: typeof paginatedData[0]) => {
    const paid = ca.status === "paid" || ca.status === "settled" || ca.status === "partially_settled";
    if (!paid) return "-";
    return formatCurrency(ca.total_amount - (ca.total_realized || 0));
  };

  const statuses = [
    { value: "all", label: t("status.all") },
    { value: "draft", label: t("status.draft") },
    { value: "submitted", label: t("status.submitted") },
    { value: "approved", label: t("status.approved") },
    { value: "rejected", label: t("status.rejected") },
    { value: "paid", label: t("status.paid") },
    { value: "settled", label: t("status.settled") },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("cashAdvance.title")}</h1>
          <p className="text-muted-foreground">{t("cashAdvance.description")}</p>
        </div>
        <Button onClick={() => navigate("/cash-advance/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("cashAdvance.createNew")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("cashAdvance.searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("status.all")} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canViewAllDivisions && (
              <Select
                value={divisionFilter}
                onValueChange={(value) => {
                  setDivisionFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t("common.allDivisions")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("common.allDivisions")}</SelectItem>
                  {divisions?.map((division) => (
                    <SelectItem key={division.id} value={division.id}>
                      {division.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cashAdvance.caNumber")}</TableHead>
                  <TableHead>{t("common.division")}</TableHead>
                  <TableHead>{t("cashAdvance.requester")}</TableHead>
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead className="text-right">{t("cashAdvance.totalCA")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("cashAdvance.paidDate")}</TableHead>
                  <TableHead className="text-right">{t("cashAdvance.realizedAmount")}</TableHead>
                  <TableHead className="text-right">{t("cashAdvance.balance")}</TableHead>
                  <TableHead className="text-center">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {t("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((ca) => (
                    <TableRow
                      key={ca.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/cash-advance/${ca.id}`)}
                    >
                      <TableCell className="font-medium">{ca.ca_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ca.division?.code}</Badge>
                      </TableCell>
                      <TableCell>{ca.requester?.full_name || "-"}</TableCell>
                      <TableCell>{ca.category?.name}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(ca.total_amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={ca.status} />
                      </TableCell>
                      <TableCell>{formatDate(ca.paid_at)}</TableCell>
                      <TableCell className="text-right">
                        {ca.total_realized > 0 ? formatCurrency(ca.total_realized) : "-"}
                      </TableCell>
                      <TableCell className="text-right">{getBalance(ca)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/cash-advance/${ca.id}`);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalItems > 0 && (
            <TablePagination
              currentPage={page}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashAdvance;
