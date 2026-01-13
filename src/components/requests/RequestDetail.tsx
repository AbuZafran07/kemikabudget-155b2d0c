import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  FileText,
  User,
  Calendar,
  Building,
  Tag,
  Banknote,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard,
  Send,
  FileCheck,
  AlertCircle,
  Loader2,
  Paperclip,
  Printer,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/common/StatusBadge';
import { generateRequestPDF } from '@/lib/generatePDF';

interface RequestDetailProps {
  requestId: string;
}

interface RequestEvent {
  id: string;
  event_type: string;
  description: string;
  performed_by: string;
  created_at: string;
  metadata: Record<string, any> | null;
  performer?: { full_name: string };
}

interface RequestAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  attachment_type: string;
  created_at: string;
  uploader?: { full_name: string };
}

const eventIcons: Record<string, React.ElementType> = {
  created: FileText,
  submitted: Send,
  approved: CheckCircle,
  rejected: XCircle,
  paid: CreditCard,
  settled: FileCheck,
  cancelled: AlertCircle,
  attachment_added: Paperclip,
  default: Clock,
};

const eventColors: Record<string, string> = {
  created: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/10 text-blue-500',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  paid: 'bg-primary/10 text-primary',
  settled: 'bg-success/10 text-success',
  cancelled: 'bg-muted text-muted-foreground',
  attachment_added: 'bg-accent/20 text-accent-foreground',
};

const attachmentTypeLabels: Record<string, string> = {
  quotation: 'Quotation',
  invoice: 'Invoice',
  receipt: 'Receipt',
  other: 'Dokumen Lain',
};

export function RequestDetail({ requestId }: RequestDetailProps) {
  // Fetch request details
  const { data: request, isLoading: isLoadingRequest } = useQuery({
    queryKey: ['request-detail', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_sources (code, name, type, bank_name),
          requester:profiles!requests_requester_id_fkey (full_name, email),
          approver:profiles!requests_approved_by_fkey (full_name)
        `)
        .eq('id', requestId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!requestId,
  });

  // Fetch request events/timeline
  const { data: events = [] } = useQuery({
    queryKey: ['request-events', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_events')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get performer names
      const performerIds = data?.map(e => e.performed_by) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', performerIds);

      return data?.map(event => ({
        ...event,
        performer: profiles?.find(p => p.id === event.performed_by),
      })) as RequestEvent[];
    },
    enabled: !!requestId,
  });

  // Fetch attachments
  const { data: attachments = [] } = useQuery({
    queryKey: ['request-attachments', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_attachments')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const uploaderIds = data?.map(a => a.uploaded_by) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', uploaderIds);

      return data?.map(attachment => ({
        ...attachment,
        uploader: profiles?.find(p => p.id === attachment.uploaded_by),
      })) as RequestAttachment[];
    },
    enabled: !!requestId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage
      .from('request-attachments')
      .createSignedUrl(filePath, 60);

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  if (isLoadingRequest) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Pengajuan tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <code className="text-lg font-mono font-bold text-foreground">
                {request.request_number}
              </code>
              <StatusBadge status={request.status} />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">
              {request.description}
            </h2>
            <p className="text-muted-foreground">
              Diajukan oleh {(request.requester as any)?.full_name || 'Unknown'}
            </p>
          </div>
          <div className="text-right space-y-2">
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(Number(request.amount))}
            </p>
            <p className="text-sm text-muted-foreground">
              Dibuat {format(new Date(request.created_at), 'dd MMM yyyy', { locale: localeId })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => generateRequestPDF({
                ...request,
                division: request.divisions as any,
                category: request.cost_categories as any,
                requester: request.requester as any,
                approver: request.approver as any,
                funding_source: request.funding_sources as any,
              })}
            >
              <Printer className="h-4 w-4" />
              Cetak PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Information */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Informasi Pengajuan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Building className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Divisi</p>
                  <p className="font-medium text-foreground">
                    {(request.divisions as any)?.name || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Kategori</p>
                  <p className="font-medium text-foreground">
                    {(request.cost_categories as any)?.name || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Dibutuhkan</p>
                  <p className="font-medium text-foreground">
                    {format(new Date(request.needed_date), 'dd MMMM yyyy', { locale: localeId })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">
                    {request.vendor || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sumber Dana</p>
                  <p className="font-medium text-foreground">
                    {(request.funding_sources as any)?.name || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Metode Pembayaran</p>
                  <p className="font-medium text-foreground capitalize">
                    {request.payment_method || '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Beneficiary Info */}
            {request.beneficiary_name && (
              <>
                <Separator className="my-4" />
                <h4 className="font-medium text-foreground mb-3">Informasi Penerima</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nama</p>
                    <p className="font-medium text-foreground">{request.beneficiary_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bank</p>
                    <p className="font-medium text-foreground">{request.beneficiary_bank || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">No. Rekening</p>
                    <p className="font-medium text-foreground font-mono">{request.beneficiary_account || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{request.beneficiary_email || '-'}</p>
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            {request.notes && (
              <>
                <Separator className="my-4" />
                <h4 className="font-medium text-foreground mb-2">Catatan</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{request.notes}</p>
              </>
            )}

            {/* Rejection Reason */}
            {request.rejection_reason && (
              <>
                <Separator className="my-4" />
                <div className="bg-destructive/10 rounded-lg p-4">
                  <h4 className="font-medium text-destructive mb-2">Alasan Penolakan</h4>
                  <p className="text-foreground">{request.rejection_reason}</p>
                </div>
              </>
            )}
          </div>

          {/* Attachments */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">
              Lampiran ({attachments.length})
            </h3>
            {attachments.length === 0 ? (
              <div className="text-center py-8">
                <Paperclip className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Tidak ada lampiran</p>
              </div>
            ) : (
              <div className="space-y-3">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">
                          {attachment.file_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {attachmentTypeLabels[attachment.attachment_type] || attachment.attachment_type}
                          </Badge>
                          <span>{formatFileSize(attachment.file_size)}</span>
                          <span>•</span>
                          <span>{attachment.uploader?.full_name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(attachment.file_path, attachment.file_name)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Timeline */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Timeline</h3>
            {events.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Belum ada aktivitas</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />

                <div className="space-y-4">
                  {events.map((event, index) => {
                    const Icon = eventIcons[event.event_type] || eventIcons.default;
                    const colorClass = eventColors[event.event_type] || 'bg-muted text-muted-foreground';

                    return (
                      <div key={event.id} className="relative flex gap-3">
                        <div
                          className={`relative z-10 p-2 rounded-full ${colorClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pt-0.5">
                          <p className="font-medium text-foreground text-sm">
                            {event.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{event.performer?.full_name || 'System'}</span>
                            <span>•</span>
                            <span>
                              {format(new Date(event.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Approval Info */}
          {request.approved_at && (
            <div className="bg-success/5 rounded-xl border border-success/20 p-6">
              <h4 className="font-medium text-success mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Disetujui
              </h4>
              <p className="text-sm text-foreground">
                Oleh {(request.approver as any)?.full_name || 'Unknown'}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(request.approved_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}
              </p>
            </div>
          )}

          {request.paid_at && (
            <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
              <h4 className="font-medium text-primary mb-2 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Dibayar
              </h4>
              <p className="text-sm text-muted-foreground">
                {format(new Date(request.paid_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}