import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as localeId, enUS } from "date-fns/locale";
import {
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

interface NotificationLog {
  id: string;
  request_id: string | null;
  event_type: string;
  recipients: string[];
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  request?: { request_number: string } | null;
}

const NotificationHistory = () => {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const dateLocale = language === 'id' ? localeId : enUS;

  const eventTypeLabels: Record<string, { label: string; color: string }> = {
    submitted: { label: t('status.submitted'), color: "bg-info/10 text-info" },
    approved: { label: t('status.approved'), color: "bg-success/10 text-success" },
    rejected: { label: t('status.rejected'), color: "bg-destructive/10 text-destructive" },
    paid: { label: t('status.paid'), color: "bg-primary/10 text-primary" },
    settled: { label: t('status.settled'), color: "bg-muted text-muted-foreground" },
  };

  const statusIcons: Record<string, { icon: React.ElementType; color: string }> = {
    sent: { icon: CheckCircle, color: "text-success" },
    failed: { icon: XCircle, color: "text-destructive" },
    pending: { icon: Clock, color: "text-warning" },
  };

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["notification-logs", statusFilter, eventFilter],
    queryFn: async () => {
      let query = supabase
        .from("notification_logs")
        .select(`
          *,
          request:requests(request_number)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (eventFilter !== "all") {
        query = query.eq("event_type", eventFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NotificationLog[];
    },
  });

  const filteredLogs = logs?.filter((log) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      log.subject.toLowerCase().includes(searchLower) ||
      log.recipients.some((r) => r.toLowerCase().includes(searchLower)) ||
      log.request?.request_number?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: logs?.length || 0,
    sent: logs?.filter((l) => l.status === "sent").length || 0,
    failed: logs?.filter((l) => l.status === "failed").length || 0,
    pending: logs?.filter((l) => l.status === "pending").length || 0,
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Mail className="h-6 w-6" />
            {t('notificationHistory.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('notificationHistory.description')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t('action.refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{t('notificationHistory.total')}</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <p className="text-sm text-muted-foreground">{t('notificationHistory.sent')}</p>
          </div>
          <p className="text-2xl font-bold text-success">{stats.sent}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-muted-foreground">{t('notificationHistory.failed')}</p>
          </div>
          <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            <p className="text-sm text-muted-foreground">{t('notificationHistory.pending')}</p>
          </div>
          <p className="text-2xl font-bold text-warning">{stats.pending}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('notificationHistory.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('common.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('notificationHistory.allStatus')}</SelectItem>
              <SelectItem value="sent">{t('notificationHistory.sent')}</SelectItem>
              <SelectItem value="failed">{t('notificationHistory.failed')}</SelectItem>
              <SelectItem value="pending">{t('notificationHistory.pending')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('notificationHistory.event')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('notificationHistory.allEvents')}</SelectItem>
              <SelectItem value="submitted">{t('status.submitted')}</SelectItem>
              <SelectItem value="approved">{t('status.approved')}</SelectItem>
              <SelectItem value="rejected">{t('status.rejected')}</SelectItem>
              <SelectItem value="paid">{t('status.paid')}</SelectItem>
              <SelectItem value="settled">{t('status.settled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('notificationHistory.date')}</TableHead>
              <TableHead>{t('notificationHistory.event')}</TableHead>
              <TableHead>{t('notificationHistory.request')}</TableHead>
              <TableHead>{t('notificationHistory.subject')}</TableHead>
              <TableHead>{t('notificationHistory.recipients')}</TableHead>
              <TableHead>{t('notificationHistory.error')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredLogs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {t('notificationHistory.noData')}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs?.map((log) => {
                const StatusIcon = statusIcons[log.status]?.icon || Clock;
                const statusColor = statusIcons[log.status]?.color || "text-muted-foreground";
                const eventConfig = eventTypeLabels[log.event_type] || {
                  label: log.event_type,
                  color: "bg-muted text-muted-foreground",
                };

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                        <span className="capitalize text-sm">{log.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), "dd MMM yyyy HH:mm", {
                        locale: dateLocale,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge className={eventConfig.color}>
                        {eventConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.request?.request_number ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.request.request_number}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate">
                      {log.subject}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {log.recipients.slice(0, 2).map((r, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {r.length > 20 ? r.slice(0, 20) + "..." : r}
                          </Badge>
                        ))}
                        {log.recipients.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{log.recipients.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-destructive text-sm">
                      {log.error_message || "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default NotificationHistory;
