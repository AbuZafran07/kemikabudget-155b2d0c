import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AuditLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  description: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  created_at: string;
  user?: { full_name: string; email: string };
}

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
  const [search, setSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', search, eventTypeFilter, entityTypeFilter],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }

      if (entityTypeFilter !== 'all') {
        query = query.eq('entity_type', entityTypeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user names
      const userIds = [...new Set(data?.filter(l => l.user_id).map(l => l.user_id))];
      let profiles: Record<string, { full_name: string; email: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds as string[]);
        
        profiles = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = { full_name: p.full_name, email: p.email };
          return acc;
        }, {} as Record<string, { full_name: string; email: string }>);
      }

      return (data || []).map(log => ({
        ...log,
        user: log.user_id ? profiles[log.user_id] : undefined,
      })) as AuditLog[];
    },
  });

  // Filter by search
  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      log.description.toLowerCase().includes(searchLower) ||
      log.event_type.toLowerCase().includes(searchLower) ||
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.user?.full_name?.toLowerCase().includes(searchLower) ||
      log.user?.email?.toLowerCase().includes(searchLower)
    );
  });

  // Pagination
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Get unique event and entity types for filters
  const eventTypes = [...new Set(logs.map(l => l.event_type))];
  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Riwayat semua aktivitas dan perubahan sistem
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-foreground">{logs.length}</p>
            <p className="text-xs text-muted-foreground">Total Log</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-success">
              {logs.filter(l => l.event_type === 'approved').length}
            </p>
            <p className="text-xs text-muted-foreground">Approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-primary">
              {logs.filter(l => l.event_type === 'paid').length}
            </p>
            <p className="text-xs text-muted-foreground">Payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-accent-foreground">
              {logs.filter(l => l.event_type === 'notification_sent').length}
            </p>
            <p className="text-xs text-muted-foreground">Notifikasi Terkirim</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari log..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={eventTypeFilter}
          onValueChange={(v) => {
            setEventTypeFilter(v);
            handleFilterChange();
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Event</SelectItem>
            {eventTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={entityTypeFilter}
          onValueChange={(v) => {
            setEntityTypeFilter(v);
            handleFilterChange();
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Entity</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-44">Waktu</TableHead>
              <TableHead className="w-32">Event</TableHead>
              <TableHead className="w-28">Entity</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead className="w-40">User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileSearch className="h-8 w-8 opacity-50" />
                    <p>Tidak ada log ditemukan</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedLogs.map((log) => {
                const Icon = eventIcons[log.event_type] || eventIcons.default;
                const colorClass = eventColors[log.event_type] || 'bg-muted text-muted-foreground';

                return (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale: localeId })}
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
                        <span className="text-muted-foreground">System</span>
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
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Menampilkan {startIndex + 1}–{endIndex} dari {totalItems} log
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
};

export default AuditLogs;