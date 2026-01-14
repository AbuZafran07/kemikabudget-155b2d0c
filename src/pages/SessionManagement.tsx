import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId, enUS } from 'date-fns/locale';
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
import { Card, CardContent } from '@/components/ui/card';
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
import { useSessions, UserSession } from '@/hooks/useSessions';
import { useSensitiveAction } from '@/hooks/useSensitiveAction';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { useLanguage } from '@/contexts/LanguageContext';

const PAGE_SIZES = [10, 25, 50];

const SessionManagement = () => {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const dateLocale = language === 'id' ? localeId : enUS;

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
      t('sessionManagement.revokeSession'),
      `${t('action.revoke')} ${session.user?.full_name || t('users.title')}`,
      () => {
        revokeSession.mutate({ sessionId: session.id, userId: session.user_id });
      }
    );
  };

  const handleRevokeAllSessions = (userId: string, userName: string) => {
    executeSensitiveAction(
      t('sessionManagement.revokeAllSessions'),
      `${t('action.revoke')} ${userName}`,
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
            {t('sessionManagement.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('sessionManagement.description')}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('action.refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-foreground">{sessions.length}</p>
            <p className="text-xs text-muted-foreground">{t('sessionManagement.totalSessions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-success">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground">{t('sessionManagement.activeSessions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-destructive">{revokedSessions.length}</p>
            <p className="text-xs text-muted-foreground">{t('sessionManagement.revokedSessions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-primary">
              {new Set(activeSessions.map(s => s.user_id)).size}
            </p>
            <p className="text-xs text-muted-foreground">{t('sessionManagement.onlineUsers')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('sessionManagement.searchPlaceholder')}
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
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('sessionManagement.allStatus')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="revoked">{t('status.revoked')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-48">{t('sessionManagement.user')}</TableHead>
              <TableHead className="w-32">{t('sessionManagement.device')}</TableHead>
              <TableHead className="w-32">{t('sessionManagement.ipAddress')}</TableHead>
              <TableHead className="w-40">{t('sessionManagement.lastActive')}</TableHead>
              <TableHead className="w-24">{t('common.status')}</TableHead>
              <TableHead className="w-28 text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <User className="h-8 w-8 opacity-50" />
                    <p>{t('sessionManagement.noSessions')}</p>
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
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {session.is_revoked ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {t('status.revoked')}
                      </Badge>
                    ) : (
                      <Badge variant="default" className="gap-1 bg-success">
                        <CheckCircle className="h-3 w-3" />
                        {t('status.active')}
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
                        {t('action.revoke')}
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
            {t('common.showing')} {startIndex + 1}–{endIndex} {t('common.of')} {totalItems}
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
                {t('common.previous')}
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
                {t('common.next')}
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
