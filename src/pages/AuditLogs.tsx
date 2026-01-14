import { useState } from 'react';
import { format } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
import {
  FileSearch,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  CreditCard,
  Send,
  FileCheck,
  AlertCircle,
  User,
  Settings,
  RefreshCw,
  Mail,
  Download,
  Calendar,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useAuditLogs } from '@/hooks/useAuditLogsQuery';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const eventIcons: Record<string, React.ElementType> = {
  created: FileText,
  submitted: Send,
  approved: CheckCircle,
  rejected: XCircle,
  paid: CreditCard,
  settled: FileCheck,
  cancelled: AlertCircle,
  updated: RefreshCw,
  notification_sent: Mail,
  login: User,
  logout: User,
  default: Settings,
};

const eventColors: Record<string, string> = {
  created: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/10 text-blue-600',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  paid: 'bg-primary/10 text-primary',
  settled: 'bg-success/10 text-success',
  cancelled: 'bg-muted text-muted-foreground',
  notification_sent: 'bg-accent/20 text-accent-foreground',
  updated: 'bg-muted text-muted-foreground',
};

const PAGE_SIZES = [10, 25, 50, 100];

const AuditLogs = () => {
  const { t, language } = useLanguage();
  const [pageSize, setPageSize] = useState(25);
  const dateLocale = language === 'id' ? localeId : enUS;
  
  const {
    logs,
    totalCount,
    totalPages,
    currentPage,
    filters,
    filterOptions,
    isLoading,
    setCurrentPage,
    updateFilters,
    resetFilters,
    refetch,
    exportToCSV,
  } = useAuditLogs({ pageSize });

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + logs.length, totalCount);

  // Check if any filters are active
  const hasActiveFilters = 
    filters.search !== '' ||
    filters.eventType !== 'all' ||
    filters.entityType !== 'all' ||
    filters.userId !== 'all' ||
    filters.startDate !== undefined ||
    filters.endDate !== undefined;

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-primary" />
            {t('auditLogs.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('auditLogs.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('action.refresh')}
          </Button>
          <Button onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-foreground">{totalCount}</p>
            <p className="text-xs text-muted-foreground">{t('auditLogs.totalLogs')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-success">
              {filterOptions.eventTypes.filter(e => e === 'approved').length > 0 ? '✓' : '-'}
            </p>
            <p className="text-xs text-muted-foreground">{t('auditLogs.eventTypes')}: {filterOptions.eventTypes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-primary">
              {filterOptions.entityTypes.length}
            </p>
            <p className="text-xs text-muted-foreground">{t('auditLogs.entityTypes')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-accent-foreground">
              {filterOptions.users.length}
            </p>
            <p className="text-xs text-muted-foreground">{t('auditLogs.users')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('auditLogs.searchLogs')}
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              className="pl-9"
            />
          </div>

          {/* Event Type Filter */}
          <Select
            value={filters.eventType}
            onValueChange={(v) => updateFilters({ eventType: v })}
          >
            <SelectTrigger className="w-full lg:w-40">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t('auditLogs.event')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auditLogs.allEvents')}</SelectItem>
              {filterOptions.eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Entity Type Filter */}
          <Select
            value={filters.entityType}
            onValueChange={(v) => updateFilters({ entityType: v })}
          >
            <SelectTrigger className="w-full lg:w-40">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t('auditLogs.entity')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auditLogs.allEntities')}</SelectItem>
              {filterOptions.entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* User Filter */}
          <Select
            value={filters.userId}
            onValueChange={(v) => updateFilters({ userId: v })}
          >
            <SelectTrigger className="w-full lg:w-48">
              <User className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t('auditLogs.user')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auditLogs.allUsers')}</SelectItem>
              {filterOptions.users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Start Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-48 justify-start text-left font-normal",
                  !filters.startDate && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {filters.startDate ? (
                  format(filters.startDate, "dd MMM yyyy", { locale: dateLocale })
                ) : (
                  t('auditLogs.startDate')
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.startDate}
                onSelect={(date) => updateFilters({ startDate: date })}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground hidden sm:block">—</span>

          {/* End Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-48 justify-start text-left font-normal",
                  !filters.endDate && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {filters.endDate ? (
                  format(filters.endDate, "dd MMM yyyy", { locale: dateLocale })
                ) : (
                  t('auditLogs.endDate')
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.endDate}
                onSelect={(date) => updateFilters({ endDate: date })}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" onClick={resetFilters} className="gap-2">
              <X className="h-4 w-4" />
              {t('auditLogs.resetFilter')}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-44">{t('auditLogs.time')}</TableHead>
              <TableHead className="w-32">{t('auditLogs.event')}</TableHead>
              <TableHead className="w-28">{t('auditLogs.entity')}</TableHead>
              <TableHead>{t('common.description')}</TableHead>
              <TableHead className="w-40">{t('auditLogs.user')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileSearch className="h-8 w-8 opacity-50" />
                    <p>{t('auditLogs.noLogs')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const Icon = eventIcons[log.event_type] || eventIcons.default;
                const colorClass = eventColors[log.event_type] || 'bg-muted text-muted-foreground';

                return (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale: dateLocale })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${colorClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {log.event_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {log.entity_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {log.description}
                    </TableCell>
                    <TableCell>
                      {log.user ? (
                        <div>
                          <p className="font-medium text-sm">{log.user.full_name}</p>
                          <p className="text-xs text-muted-foreground">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('auditLogs.system')}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t('auditLogs.showingLogs')} {startIndex + 1}–{endIndex} {t('common.of')} {totalCount} {t('auditLogs.logsCount')}
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => {
              setPageSize(Number(v));
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                  }
                  if (currentPage > totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  }
                }
                if (pageNum > totalPages || pageNum < 1) return null;
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;