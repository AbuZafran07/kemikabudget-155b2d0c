import { useState } from 'react';
import { format } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';
import {
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Copy,
  XCircle,
  ListFilter,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/common/StatusBadge';
import { useRequests, Request } from '@/hooks/useRequests';
import { useLanguage } from '@/contexts/LanguageContext';

interface RequestListProps {
  onCreateNew: () => void;
  onEdit: (request: Request) => void;
  onView: (request: Request) => void;
  onDuplicate: (request: Request) => void;
}

const PAGE_SIZES = [10, 25, 50];

// Active statuses: draft, submitted, under_review
const ACTIVE_STATUSES = ['draft', 'submitted', 'under_review'];
// Archived statuses: approved, rejected, paid, settled, cancelled
const ARCHIVED_STATUSES = ['approved', 'rejected', 'paid', 'settled', 'cancelled'];

type TabType = 'active' | 'archived';

export function RequestList({ onCreateNew, onEdit, onView, onDuplicate }: RequestListProps) {
  const { requests, isLoading, cancelRequest } = useRequests();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Get available statuses based on active tab
  const availableStatuses = activeTab === 'active' ? ACTIVE_STATUSES : ARCHIVED_STATUSES;

  // Filter requests based on tab and filters
  const filteredRequests = requests?.filter((req) => {
    // First filter by tab
    const matchesTab = activeTab === 'active' 
      ? ACTIVE_STATUSES.includes(req.status)
      : ARCHIVED_STATUSES.includes(req.status);

    const matchesSearch =
      search === '' ||
      req.description.toLowerCase().includes(search.toLowerCase()) ||
      req.request_number.toLowerCase().includes(search.toLowerCase()) ||
      req.vendor?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    return matchesTab && matchesSearch && matchesStatus;
  }) || [];

  // Pagination
  const totalItems = filteredRequests.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleCancel = async (id: string) => {
    if (confirm(t('requests.confirmCancel'))) {
      await cancelRequest.mutateAsync(id);
    }
  };

  // Get status label based on status value
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return t('status.draft');
      case 'submitted': return t('status.submitted');
      case 'under_review': return t('status.underReview');
      case 'approved': return t('status.approved');
      case 'rejected': return t('status.rejected');
      case 'paid': return t('status.paid');
      case 'settled': return t('status.settled');
      case 'cancelled': return t('status.cancelled');
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="border rounded-lg bg-card">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 p-4 border-b last:border-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-fit grid-cols-2 bg-muted/50">
          <TabsTrigger value="active" className="flex items-center gap-2 px-6">
            <ListFilter className="h-4 w-4" />
            {t('requests.active')}
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex items-center gap-2 px-6">
            <Archive className="h-4 w-4" />
            {t('requests.archived')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('requests.searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-full sm:w-40 bg-background">
              <SelectValue placeholder={t('status.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('status.all')}</SelectItem>
              {availableStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {getStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-foreground">No. Request</TableHead>
              <TableHead className="font-semibold text-foreground">Deskripsi</TableHead>
              <TableHead className="font-semibold text-foreground">Divisi</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Nominal</TableHead>
              <TableHead className="font-semibold text-foreground text-right">{language === 'id' ? 'Disetujui' : 'Approved'}</TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">Tanggal</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <p className="text-muted-foreground">{t('requests.noData')}</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedRequests.map((request) => {
                const hasCorrection = request.approved_amount !== null && request.approved_amount !== request.amount;
                return (
                <TableRow key={request.id} className="hover:bg-muted/20">
                  <TableCell className="font-mono text-sm">
                    {request.request_number}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium truncate max-w-xs">
                      {request.description}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {request.divisions?.name || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(request.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {request.approved_amount !== null ? (
                      <div className="flex flex-col items-end">
                        <span className={`font-medium ${hasCorrection ? 'text-warning' : 'text-foreground'}`}>
                          {formatCurrency(request.approved_amount)}
                        </span>
                        {hasCorrection && (
                          <span className="text-xs text-muted-foreground">
                            ({language === 'id' ? 'koreksi' : 'adjusted'})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(request.created_at), 'dd MMM yyyy', { locale: language === 'id' ? idLocale : enUS })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(request)}>
                          <Eye className="mr-2 h-4 w-4" />
                          {t('action.viewDetail')}
                        </DropdownMenuItem>
                        {request.status === 'draft' && (
                          <DropdownMenuItem onClick={() => onEdit(request)}>
                            <Edit className="mr-2 h-4 w-4" />
                            {t('action.edit')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onDuplicate(request)}>
                          <Copy className="mr-2 h-4 w-4" />
                          {t('action.duplicate')}
                        </DropdownMenuItem>
                        {['draft', 'submitted'].includes(request.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleCancel(request.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {t('action.cancel')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t('common.showing')} {startIndex + 1}–{endIndex} {t('common.of')} {totalItems} {t('common.data')}
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
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
                onClick={() => handlePageChange(currentPage - 1)}
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
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(currentPage + 1)}
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
}
