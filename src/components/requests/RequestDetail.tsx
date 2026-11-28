import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveSignatureUrl } from '@/lib/signatureUrl';
import { useAuth } from '@/contexts/AuthContext';
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
  Receipt,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/common/StatusBadge';
import { PDFPreviewDialog } from '@/components/payments/PDFPreviewDialog';
import { PengajuanDanaData, generatePengajuanDanaHTML } from '@/lib/generatePengajuanDanaPDF';
import { exportStyledHtmlToPdf } from '@/lib/html2pdfExport';
import { toast } from 'sonner';
import EntertainmentNominativeSection from '@/components/entertainment/EntertainmentNominativeSection';

interface RequestDetailProps {
  requestId: string;
  onBack?: () => void;
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
  revision_requested: AlertCircle,
  resubmitted: Send,
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
  revision_requested: 'bg-orange-500/10 text-orange-600',
  resubmitted: 'bg-blue-500/10 text-blue-500',
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

export function RequestDetail({ requestId, onBack }: RequestDetailProps) {
  const { role, user } = useAuth();
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<PengajuanDanaData | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string>('');

  // Load logo as base64 on mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const response = await fetch('/lovable-uploads/cb7d852a-00a6-461a-ad8f-806dbf150cf5.png');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('Failed to load logo:', error);
      }
    };
    loadLogo();
  }, []);
  // Mask account number for non-finance/non-super_admin users
  const maskAccountNumber = (account: string | null): string => {
    if (!account) return '-';
    if (role === 'super_admin' || role === 'finance') return account;
    if (account.length < 8) return '****';
    return account.slice(0, 4) + '****' + account.slice(-4);
  };
  // Fetch request details - avoid foreign key hints since there's no explicit FK to profiles
  const { data: request, isLoading: isLoadingRequest } = useQuery({
    queryKey: ['request-detail', requestId],
    queryFn: async () => {
      // First fetch the request with its direct relationships
      const { data: requestData, error: requestError } = await supabase
        .from('requests')
        .select(`
          *,
          divisions (code, name),
          cost_categories (code, name),
          funding_source_options (code, name, type)
        `)
        .eq('id', requestId)
        .single();

      if (requestError) throw requestError;

      // Fetch requester profile separately - include signature_url from profiles table
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('full_name, email, signature_url, division_id')
        .eq('id', requestData.requester_id)
        .single();
      if (requesterProfile) {
        (requesterProfile as any).signature_url = await resolveSignatureUrl(
          requestData.requester_id,
          (requesterProfile as any).signature_url,
        );
      }

      // Fetch requester's division info
      let requesterDivision = null;
      if (requesterProfile?.division_id) {
        const { data: divData } = await supabase
          .from('divisions')
          .select('name, code')
          .eq('id', requesterProfile.division_id)
          .single();
        requesterDivision = divData;
      }

      // Fetch approver profile if exists
      let approverProfile = null;
      if (requestData.approved_by) {
        const { data: approver } = await supabase
          .from('profiles')
          .select('full_name, signature_url')
          .eq('id', requestData.approved_by)
          .single();
        if (approver) {
          (approver as any).signature_url = await resolveSignatureUrl(
            requestData.approved_by,
            (approver as any).signature_url,
          );
        }
        approverProfile = approver;
      }

      // Fetch payer profile if exists
      let payerProfile = null;
      if (requestData.paid_by) {
        const { data: payer } = await supabase
          .from('profiles')
          .select('full_name, signature_url')
          .eq('id', requestData.paid_by)
          .single();
        if (payer) {
          (payer as any).signature_url = await resolveSignatureUrl(
            requestData.paid_by,
            (payer as any).signature_url,
          );
        }
        payerProfile = payer;
      }

      return {
        ...requestData,
        requester: requesterProfile,
        requesterDivision,
        approver: approverProfile,
        payer: payerProfile,
        funding_sources: requestData.funding_source_options,
      };
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

      // Get performer names - use profiles_secure view for data masking
      const performerIds = data?.map(e => e.performed_by) || [];
      const { data: profiles } = await supabase
        .from('profiles_secure')
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

      // Use profiles_secure view for data masking
      const uploaderIds = data?.map(a => a.uploaded_by) || [];
      const { data: profiles } = await supabase
        .from('profiles_secure')
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

  const handleDownload = async (filePath: string, _fileName: string) => {
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
      {/* Back Button */}
      {onBack && (
        <Button variant="ghost" onClick={onBack} className="gap-2 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar
        </Button>
      )}
      
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
            <div>
              <p className="text-3xl font-bold text-primary">
                {formatCurrency(Number(request.amount))}
              </p>
              {request.approved_amount !== null && request.approved_amount !== Number(request.amount) && (
                <div className="mt-1">
                  <span className="text-sm text-muted-foreground">Disetujui: </span>
                  <span className="text-lg font-semibold text-warning">
                    {formatCurrency(Number(request.approved_amount))}
                  </span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Dibuat {format(new Date(request.created_at), 'dd MMM yyyy', { locale: localeId })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setPdfPreviewData({
                    request_number: request.request_number,
                    description: request.description,
                    amount: request.amount,
                    approved_amount: request.approved_amount,
                    vendor: request.vendor,
                    payment_method: request.payment_method,
                    beneficiary_name: request.beneficiary_name,
                    beneficiary_bank: request.beneficiary_bank,
                    beneficiary_account: request.beneficiary_account,
                    beneficiary_email: request.beneficiary_email,
                    needed_date: request.needed_date,
                    created_at: request.created_at,
                    approved_at: request.approved_at,
                    status: request.status,
                    notes: request.notes,
                    reference_number: request.reference_number,
                    division: request.divisions as any,
                    category: request.cost_categories as any,
                    requester: request.requester as any,
                    requesterDivision: (request as any).requesterDivision || null,
                    approver: (request as any).approver || null,
                    payer: (request as any).payer || null,
                    paid_at: request.paid_at,
                    funding_source: request.funding_sources as any,
                    attachments: attachments?.map(a => ({ attachment_type: a.attachment_type, file_name: a.file_name })),
                  });
                  setIsPDFPreviewOpen(true);
                }}
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                disabled={isDownloading}
                onClick={async () => {
                  setIsDownloading(true);
                  try {
                    const pdfData: PengajuanDanaData = {
                      request_number: request.request_number,
                      description: request.description,
                      amount: request.amount,
                      approved_amount: request.approved_amount,
                      vendor: request.vendor,
                      payment_method: request.payment_method,
                      beneficiary_name: request.beneficiary_name,
                      beneficiary_bank: request.beneficiary_bank,
                      beneficiary_account: request.beneficiary_account,
                      beneficiary_email: request.beneficiary_email,
                      needed_date: request.needed_date,
                      created_at: request.created_at,
                      approved_at: request.approved_at,
                      submitted_at: request.submitted_at,
                      status: request.status,
                      notes: request.notes,
                      reference_number: request.reference_number,
                      division: request.divisions as any,
                      category: request.cost_categories as any,
                      requester: request.requester as any,
                      requesterDivision: (request as any).requesterDivision || null,
                      approver: (request as any).approver || null,
                      payer: (request as any).payer || null,
                      paid_at: request.paid_at,
                      funding_source: request.funding_sources as any,
                      attachments: attachments?.map(a => ({ attachment_type: a.attachment_type, file_name: a.file_name })),
                    };
                    
                    const html = generatePengajuanDanaHTML(pdfData, logoBase64);
                    const cleanHtml = html.replace(
                      /<div class="preview-actions no-print">[\s\S]*?<\/div>/,
                      ''
                    );

                    const fileName = `Pengajuan_Budget_${request.request_number.replace(/\//g, '_')}.pdf`;

                    await exportStyledHtmlToPdf({
                      html: cleanHtml,
                      fileName,
                      marginMm: 10,
                      orientation: 'portrait',
                    });
                    toast.success('PDF berhasil didownload');
                  } catch (error) {
                    console.error('PDF download error:', error);
                    toast.error('Gagal mengunduh PDF');
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF
              </Button>
            </div>
            {/* Revision Button - only for submitted requests owned by user */}
            {request.status === 'submitted' && request.requester_id === user?.id && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-orange-500/30 text-orange-600 hover:bg-orange-500/10 mt-2"
                onClick={async () => {
                  if (!confirm('Apakah Anda yakin ingin meminta revisi? Status akan berubah ke "Revisi" dan Anda bisa mengedit pengajuan.')) return;
                  try {
                    const { error } = await supabase
                      .from('requests')
                      .update({ status: 'revision' })
                      .eq('id', requestId);
                    if (error) throw error;
                    
                    await supabase.from('request_events').insert({
                      request_id: requestId,
                      event_type: 'revision_requested',
                      description: 'Pemohon meminta revisi pengajuan',
                      performed_by: user!.id,
                    });
                    
                    toast.success('Pengajuan dikembalikan untuk direvisi');
                    // Refetch
                    window.location.reload();
                  } catch (err: any) {
                    toast.error(err.message || 'Gagal meminta revisi');
                  }
                }}
              >
                <AlertCircle className="h-4 w-4" />
                Minta Revisi
              </Button>
            )}
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
            {(request.beneficiary_name || request.beneficiary_email || request.beneficiary_bank || request.beneficiary_account) && (
              <>
                <Separator className="my-4" />
                <h4 className="font-medium text-foreground mb-3">Informasi Penerima</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Atas Nama</p>
                    <p className="font-medium text-foreground">{request.beneficiary_name || request.beneficiary_email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bank</p>
                    <p className="font-medium text-foreground">{request.beneficiary_bank || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">No. Rekening</p>
                    <p className="font-medium text-foreground font-mono">{maskAccountNumber(request.beneficiary_account)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{request.beneficiary_email || '-'}</p>
                  </div>
                </div>
              </>
            )}

            {/* Reference Number / Notes */}
            {request.notes && (
              <>
                <Separator className="my-4" />
                <h4 className="font-medium text-foreground mb-2">Reff No (INV/Nota/Resi)</h4>
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

          {/* Daftar Nominatif Entertainment (muncul bila pos pengajuan mewajibkannya) */}
          <EntertainmentNominativeSection
            source={{ requestId: request.id }}
            editable={
              request.requester_id === user?.id &&
              ['draft', 'submitted', 'revision', 'under_review', 'approved', 'paid'].includes(request.status)
            }
            documentRef={request.request_number}
            defaultSignerName={request.requester?.full_name || undefined}
            defaultEntryDate={request.needed_date || undefined}
          />

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
                  {events.map((event) => {
                    const Icon = eventIcons[event.event_type] || eventIcons.default;
                    const colorClass = eventColors[event.event_type] || 'bg-muted text-muted-foreground';
                    const metadata = event.metadata as Record<string, any> | null;
                    const showAmountCorrection = event.event_type === 'approved' && metadata?.original_amount && metadata?.approved_amount && metadata.original_amount !== metadata.approved_amount;

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
                          {showAmountCorrection && (
                            <div className="mt-1 p-2 bg-warning/10 rounded-md border border-warning/20">
                              <p className="text-xs font-medium text-warning">Koreksi Nilai</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="line-through">{formatCurrency(metadata.original_amount)}</span>
                                <span>→</span>
                                <span className="font-semibold text-warning">{formatCurrency(metadata.approved_amount)}</span>
                              </div>
                            </div>
                          )}
                          {event.event_type === 'approved' && metadata?.approval_note && (
                            <div className="mt-1 p-2 bg-success/10 rounded-md border border-success/20">
                              <p className="text-xs font-medium text-success">Catatan Approval</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{metadata.approval_note}</p>
                            </div>
                          )}
                          {event.event_type === 'rejected' && metadata?.rejection_reason && (
                            <div className="mt-1 p-2 bg-destructive/10 rounded-md border border-destructive/20">
                              <p className="text-xs font-medium text-destructive">Alasan Penolakan</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{metadata.rejection_reason}</p>
                            </div>
                          )}
                          {event.event_type === 'paid' && metadata?.payment_note && (
                            <div className="mt-1 p-2 bg-primary/10 rounded-md border border-primary/20">
                              <p className="text-xs font-medium text-primary">Catatan Pembayaran</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{metadata.payment_note}</p>
                            </div>
                          )}
                          {event.event_type === 'paid' && metadata?.paid_amount && metadata?.approved_amount && metadata.paid_amount !== metadata.approved_amount && (
                            <div className="mt-1 p-2 bg-warning/10 rounded-md border border-warning/20">
                              <p className="text-xs font-medium text-warning">Selisih Pembayaran</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span>Disetujui: {formatCurrency(metadata.approved_amount)}</span>
                                <span>→</span>
                                <span className="font-semibold text-warning">Dibayar: {formatCurrency(metadata.paid_amount)}</span>
                              </div>
                            </div>
                          )}
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
          {request.approved_at && (() => {
            const approvalEvent = events.find(e => e.event_type === 'approved');
            const approvalNote = (approvalEvent?.metadata as Record<string, any>)?.approval_note;
            return (
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
                {approvalNote && (
                  <div className="mt-3 pt-3 border-t border-success/20">
                    <p className="text-xs font-medium text-success mb-1">Catatan Approval</p>
                    <p className="text-sm text-muted-foreground">{approvalNote}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {request.paid_at && (() => {
            const paymentEvent = events.find(e => e.event_type === 'paid');
            const paymentNote = (paymentEvent?.metadata as Record<string, any>)?.payment_note;
            return (
              <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
                <h4 className="font-medium text-primary mb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Dibayar
                </h4>
                <p className="text-sm text-foreground">
                  Oleh {(request.payer as any)?.full_name || 'Unknown'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(request.paid_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}
                </p>
                {paymentNote && (
                  <div className="mt-3 pt-3 border-t border-primary/20">
                    <p className="text-xs font-medium text-primary mb-1">Catatan Pembayaran</p>
                    <p className="text-sm text-muted-foreground">{paymentNote}</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full mt-3"
                  onClick={() => {
                    setPdfPreviewData({
                      request_number: request.request_number,
                      description: request.description,
                      amount: request.amount,
                      approved_amount: request.approved_amount,
                      vendor: request.vendor,
                      payment_method: request.payment_method,
                      beneficiary_name: request.beneficiary_name,
                      beneficiary_bank: request.beneficiary_bank,
                      beneficiary_account: request.beneficiary_account,
                      beneficiary_email: request.beneficiary_email,
                      needed_date: request.needed_date,
                      created_at: request.created_at,
                      approved_at: request.approved_at,
                      notes: request.notes,
                      reference_number: request.reference_number,
                      division: request.divisions as any,
                      category: request.cost_categories as any,
                      requester: request.requester as any,
                      requesterDivision: (request as any).requesterDivision || null,
                      approver: request.approver as any,
                      funding_source: request.funding_sources as any,
                    });
                    setIsPDFPreviewOpen(true);
                  }}
                >
                  <Receipt className="h-4 w-4" />
                  Cetak Kwitansi
                </Button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* PDF Preview Dialog */}
      <PDFPreviewDialog
        open={isPDFPreviewOpen}
        onOpenChange={setIsPDFPreviewOpen}
        data={pdfPreviewData}
      />
    </div>
  );
}