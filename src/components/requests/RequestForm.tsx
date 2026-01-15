import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Upload, X, FileText, Loader2, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useRequests, RequestFormData } from '@/hooks/useRequests';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

const requestSchema = z.object({
  category_id: z.string().min(1, 'Kategori harus dipilih'),
  description: z.string().min(10, 'Deskripsi minimal 10 karakter'),
  vendor: z.string().optional(),
  amount: z.number().min(1, 'Jumlah harus lebih dari 0'),
  needed_date: z.string().optional(),
  funding_source_id: z.string().optional(),
  payment_method: z.string().optional(),
  beneficiary_name: z.string().optional(),
  beneficiary_bank: z.string().optional(),
  beneficiary_account: z.string().optional(),
  beneficiary_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  // Additional fields from reference
  reference_number: z.string().optional(),
  po_number: z.string().optional(),
  project_number: z.string().optional(),
});

interface RequestFormProps {
  requestId?: string;
  initialData?: Partial<RequestFormData> | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  isSheet?: boolean;
}

interface Attachment {
  id?: string;
  file: File | null;
  name: string;
  type: 'quotation' | 'invoice' | 'receipt' | 'other';
  size: number;
  url?: string;
}

export function RequestForm({ requestId, initialData, onSuccess, onCancel, isSheet = false }: RequestFormProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const {
    categories,
    fundingSources,
    createRequest,
    updateRequest,
    submitRequest,
    saveDraft,
    loadDraft,
    clearDraft,
    AUTOSAVE_INTERVAL,
  } = useRequests();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedFundingSource, setSelectedFundingSource] = useState<any>(null);

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      category_id: '',
      description: '',
      vendor: '',
      amount: 0,
      needed_date: '',
      funding_source_id: '',
      payment_method: '',
      beneficiary_name: '',
      beneficiary_bank: '',
      beneficiary_account: '',
      beneficiary_email: '',
      notes: '',
    },
  });

  const { watch, setValue, handleSubmit, formState: { errors, isDirty } } = form;
  const watchedFundingSource = watch('funding_source_id');
  const watchedAmount = watch('amount');

  // Load draft or initial data on mount
  useEffect(() => {
    if (!requestId) {
      if (initialData) {
        Object.entries(initialData).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            setValue(key as keyof RequestFormData, value as any);
          }
        });
        toast({
          title: 'Pengajuan Diduplikasi',
          description: 'Data dari pengajuan sebelumnya telah dimuat.',
        });
      } else {
        const draft = loadDraft();
        if (draft) {
          Object.entries(draft).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              setValue(key as keyof RequestFormData, value as any);
            }
          });
          toast({
            title: 'Draft Dipulihkan',
            description: 'Draft sebelumnya telah dimuat',
          });
        }
      }
    }
  }, [requestId, initialData, loadDraft, setValue, toast]);

  // Update selected funding source
  useEffect(() => {
    if (watchedFundingSource && fundingSources) {
      const source = fundingSources.find((s: any) => s.id === watchedFundingSource);
      setSelectedFundingSource(source);
    } else {
      setSelectedFundingSource(null);
    }
  }, [watchedFundingSource, fundingSources]);

  // Autosave draft
  useEffect(() => {
    if (requestId) return;

    const interval = setInterval(() => {
      const values = form.getValues();
      if (values.description || values.amount > 0) {
        saveDraft(values);
        setLastSaved(new Date());
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [form, saveDraft, requestId, AUTOSAVE_INTERVAL]);

  // Allowed file types for security validation
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'text/plain',
  ];
  
  const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.txt'];
  
  const sanitizeFileName = (filename: string): string => {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return sanitized.replace(/^\.+/, '').replace(/\.{2,}/g, '.');
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Terlalu Besar',
          description: `${file.name} melebihi batas 10MB`,
          variant: 'destructive',
        });
        continue;
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        toast({
          title: 'Tipe File Tidak Diizinkan',
          description: `${file.name}: Hanya file PDF, gambar, dan dokumen Office yang diperbolehkan`,
          variant: 'destructive',
        });
        continue;
      }

      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        toast({
          title: 'Ekstensi File Tidak Valid',
          description: `${file.name}: Ekstensi file tidak diperbolehkan`,
          variant: 'destructive',
        });
        continue;
      }

      const sanitizedName = sanitizeFileName(file.name);

      newAttachments.push({
        file,
        name: sanitizedName,
        type: 'other',
        size: file.size,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    event.target.value = '';
  }, [toast]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAttachmentType = (index: number, type: Attachment['type']) => {
    setAttachments((prev) =>
      prev.map((att, i) => (i === index ? { ...att, type } : att))
    );
  };

  const uploadAttachments = async (requestId: string) => {
    const pendingUploads = attachments.filter((att) => att.file);
    if (pendingUploads.length === 0) return;

    setIsUploading(true);
    try {
      for (const attachment of pendingUploads) {
        if (!attachment.file) continue;

        const filePath = `${profile?.id}/${requestId}/${Date.now()}_${attachment.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('request-attachments')
          .upload(filePath, attachment.file);

        if (uploadError) throw uploadError;

        await supabase.from('request_attachments').insert({
          request_id: requestId,
          file_name: attachment.name,
          file_path: filePath,
          file_size: attachment.size,
          file_type: attachment.file.type,
          attachment_type: attachment.type,
          uploaded_by: profile?.id,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Upload Gagal',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onSaveDraft = async (data: RequestFormData) => {
    try {
      const result = await createRequest.mutateAsync(data);
      if (attachments.length > 0) {
        await uploadAttachments(result.id);
      }
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const onSubmitRequest = async (data: RequestFormData) => {
    try {
      const result = await createRequest.mutateAsync(data);
      if (attachments.length > 0) {
        await uploadAttachments(result.id);
      }
      await submitRequest.mutateAsync(result.id);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isBank = selectedFundingSource?.type === 'bank';

  return (
    <div className={cn("space-y-6", isSheet && "pb-6")}>
      {/* Autosave indicator */}
      {lastSaved && (
        <Badge variant="secondary" className="text-xs">
          Autosaved {format(lastSaved, 'HH:mm:ss')}
        </Badge>
      )}

      <form className="space-y-5">
        {/* Category */}
        <div className="space-y-2">
          <Label>Kategori Biaya *</Label>
          <Select
            value={watch('category_id')}
            onValueChange={(value) => setValue('category_id', value)}
          >
            <SelectTrigger className={cn(errors.category_id && 'border-destructive')}>
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((cat: any) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category_id && (
            <p className="text-sm text-destructive">{errors.category_id.message}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label>Deskripsi *</Label>
          <Textarea
            placeholder="Jelaskan keperluan biaya..."
            className={cn('min-h-[100px] resize-none', errors.description && 'border-destructive')}
            {...form.register('description')}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </div>

        {/* Amount & Payment Method - Side by Side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nominal (Rp) *</Label>
            <Input
              type="number"
              placeholder="0"
              className={cn(errors.amount && 'border-destructive')}
              {...form.register('amount', { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Metode Pembayaran</Label>
            <Select
              value={watch('payment_method')}
              onValueChange={(value) => setValue('payment_method', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih metode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Tunai</SelectItem>
                <SelectItem value="transfer">Transfer Bank</SelectItem>
                <SelectItem value="check">Cek/Giro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Vendor & Beneficiary Name - Side by Side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Vendor/Penerima</Label>
            <Input
              placeholder="Nama vendor"
              {...form.register('vendor')}
            />
          </div>

          <div className="space-y-2">
            <Label>Nama Penerima Dana</Label>
            <Input
              placeholder="Nama penerima transfer"
              {...form.register('beneficiary_name')}
            />
          </div>
        </div>

        {/* Reference Number & PO Number - Side by Side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Reff No (INV/Nota/Resi)</Label>
            <Input
              placeholder="Nomor referensi"
              {...form.register('notes')}
            />
          </div>

          <div className="space-y-2">
            <Label>No. PO Customer</Label>
            <Input
              placeholder="Nomor PO"
            />
          </div>
        </div>

        {/* Project Number - Full Width */}
        <div className="space-y-2">
          <Label>Nomor Project</Label>
          <Input
            placeholder="Nomor project"
          />
        </div>

        {/* Attachments */}
        <div className="space-y-3">
          <Label>Lampiran (PDF/Gambar)</Label>
          
          {/* Upload Area */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Klik atau drag file ke sini
              </p>
            </label>
          </div>

          {/* Attachment List */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((att, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                >
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(att.size)}
                    </p>
                  </div>
                  <Select
                    value={att.type}
                    onValueChange={(value) =>
                      updateAttachmentType(index, value as Attachment['type'])
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quotation">Quotation</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="other">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAttachment(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleSubmit(onSaveDraft)}
            disabled={createRequest.isPending || isUploading}
          >
            {createRequest.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Simpan Draft
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmitRequest)}
            disabled={createRequest.isPending || submitRequest.isPending || isUploading}
          >
            {submitRequest.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Kirim
          </Button>
        </div>
      </form>
    </div>
  );
}
