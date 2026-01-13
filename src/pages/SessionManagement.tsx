import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Shield,
  Monitor,
  Smartphone,
  Globe,
  RefreshCw,
  Loader2,
  Search,
  Ban,
  CheckCircle,
  XCircle,
  User,
  Clock,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useSessions, UserSession } from '@/hooks/useSessions';
import { useSensitiveAction } from '@/hooks/useSensitiveAction';
import { ReauthDialog } from '@/components/auth/ReauthDialog';

const PAGE_SIZES = [10, 25, 50];

const SessionManagement = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    sessions,
    activeSessions,
    revokedSessions,
    isLoading,
    refetch,
    revokeSession,
    revokeAllUserSessions,
  } = useSessions();

  const {
    isDialogOpen,
    actionName,
    actionDescription,
    executeSensitiveAction,
    handleReauthSuccess,
    handleDialogClose,
  } = useSensitiveAction();

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      !search ||
      session.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      session.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
      session.ip_address?.includes(search);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !session.is_revoked) ||
      (statusFilter === 'revoked' && session.is_revoked);

    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalItems = filteredSessions.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedSessions = filteredSessions.slice(startIndex, endIndex);

  const handleRevokeSession = (session: UserSession) => {
    executeSensitiveAction(
      'Cabut Sesi Pengguna',
      `Mencabut sesi ${session.user?.full_name || 'pengguna'}`,
      () => {
        revokeSession.mutate({ sessionId: session.id, userId: session.user_id });
      }
    );
  };

  const handleRevokeAllSessions = (userId: string, userName: string) => {
    executeSensitiveAction(
      'Cabut Semua Sesi',
      `Mencabut semua sesi ${userName}`,
      () => {
        revokeAllUserSessions.mutate(userId);
      }
    );
  };

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Globe className="h-4 w-4" />;
    const info = deviceInfo.toLowerCase();
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Manajemen Sesi
          </h1>
          <p className="text-muted-foreground mt-1">
            Pantau dan kelola sesi aktif semua pengguna
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
            <p className="text-2xl font-bold text-foreground">{sessions.length}</p>
            <p className="text-xs text-muted-foreground">Total Sesi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-success">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground">Sesi Aktif</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-destructive">{revokedSessions.length}</p>
            <p className="text-xs text-muted-foreground">Sesi Dicabut</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-primary">
              {new Set(activeSessions.map(s => s.user_id)).size}
            </p>
            <p className="text-xs text-muted-foreground">Pengguna Online</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari pengguna atau IP..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v: 'all' | 'active' | 'revoked') => {
            setStatusFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="revoked">Dicabut</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-48">Pengguna</TableHead>
              <TableHead className="w-32">Perangkat</TableHead>
              <TableHead className="w-32">IP Address</TableHead>
              <TableHead className="w-40">Terakhir Aktif</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-28 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <User className="h-8 w-8 opacity-50" />
                    <p>Tidak ada sesi ditemukan</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedSessions.map((session) => (
                <TableRow key={session.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {session.user?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.user?.email || session.user_id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {getDeviceIcon(session.device_info)}
                      <span className="text-sm truncate max-w-24">
                        {session.device_info || 'Unknown'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm font-mono">
                        {session.ip_address || 'N/A'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">
                        {formatDistanceToNow(new Date(session.last_active_at), {
                          addSuffix: true,
                          locale: localeId,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {session.is_revoked ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Dicabut
                      </Badge>
                    ) : (
                      <Badge variant="default" className="gap-1 bg-success">
                        <CheckCircle className="h-3 w-3" />
                        Aktif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!session.is_revoked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeSession(session)}
                        disabled={revokeSession.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Cabut
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Menampilkan {startIndex + 1}–{endIndex} dari {totalItems} sesi
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
            >
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
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reauth Dialog */}
      <ReauthDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        onSuccess={handleReauthSuccess}
        actionName={actionName}
        actionDescription={actionDescription}
      />
    </div>
  );
};

export default SessionManagement;
