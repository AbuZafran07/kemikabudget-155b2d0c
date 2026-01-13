import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Upload, X, FileText, Loader2, Save, Send } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRequests, RequestFormData } from '@/hooks/useRequests';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const requestSchema = z.object({
  category_id: z.string().min(1, 'Kategori harus dipilih'),
  description: z.string().min(10, 'Deskripsi minimal 10 karakter'),
  vendor: z.string().optional(),
  amount: z.number().min(1, 'Jumlah harus lebih dari 0'),
  needed_date: z.string().min(1, 'Tanggal dibutuhkan harus diisi'),
  funding_source_id: z.string().min(1, 'Sumber dana harus dipilih'),
  payment_method: z.string().optional(),
  beneficiary_name: z.string().optional(),
  beneficiary_bank: z.string().optional(),
  beneficiary_account: z.string().optional(),
  beneficiary_email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});

interface RequestFormProps {
  requestId?: string;
  initialData?: Partial<RequestFormData> | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface Attachment {
  id?: string;
  file: File | null;
  name: string;
  type: 'quotation' | 'invoice' | 'receipt' | 'other';
  size: number;
  url?: string;
}

export function RequestForm({ requestId, initialData, onSuccess, onCancel }: RequestFormProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
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
      // Priority: initialData (from duplicate) > draft
      if (initialData) {
        Object.entries(initialData).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            setValue(key as keyof RequestFormData, value as any);
          }
        });
        toast({
          title: 'Pengajuan Diduplikasi',
          description: 'Data dari pengajuan sebelumnya telah dimuat. Isi tanggal yang dibutuhkan.',
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
    if (requestId) return; // Don't autosave when editing

    const interval = setInterval(() => {
      const values = form.getValues();
      if (values.description || values.amount > 0) {
        saveDraft(values);
        setLastSaved(new Date());
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [form, saveDraft, requestId, AUTOSAVE_INTERVAL]);

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

      newAttachments.push({
        file,
        name: file.name,
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isBank = selectedFundingSource?.type === 'bank';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {requestId ? 'Edit Pengajuan' : 'Pengajuan Baru'}
          </h2>
          <p className="text-muted-foreground">
            Isi formulir di bawah untuk membuat pengajuan biaya
          </p>
        </div>
        {lastSaved && (
          <Badge variant="secondary" className="text-xs">
            Autosaved {format(lastSaved, 'HH:mm:ss')}
          </Badge>
        )}
      </div>

      <form className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informasi Pengajuan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Kategori Biaya *</Label>
                <Select
                  value={watch('category_id')}
                  onValueChange={(value) => setValue('category_id', value)}
                >
                  <SelectTrigger className={errors.category_id ? 'border-destructive' : ''}>
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

              {/* Needed Date */}
              <div className="space-y-2">
                <Label>Tanggal Dibutuhkan *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !watch('needed_date') && 'text-muted-foreground',
                        errors.needed_date && 'border-destructive'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {watch('needed_date')
                        ? format(new Date(watch('needed_date')), 'dd MMMM yyyy')
                        : 'Pilih tanggal'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={watch('needed_date') ? new Date(watch('needed_date')) : undefined}
                      onSelect={(date) =>
                        setValue('needed_date', date ? format(date, 'yyyy-MM-dd') : '')
                      }
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {errors.needed_date && (
                  <p className="text-sm text-destructive">{errors.needed_date.message}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi *</Label>
              <Textarea
                id="description"
                placeholder="Jelaskan keperluan pengajuan ini..."
                className={cn('min-h-[100px]', errors.description && 'border-destructive')}
                {...form.register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vendor */}
              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor / Supplier</Label>
                <Input
                  id="vendor"
                  placeholder="Nama vendor atau supplier"
                  {...form.register('vendor')}
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Jumlah (IDR) *</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  className={errors.amount ? 'border-destructive' : ''}
                  {...form.register('amount', { valueAsNumber: true })}
                />
                {watchedAmount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(watchedAmount)}
                  </p>
                )}
                {errors.amount && (
                  <p className="text-sm text-destructive">{errors.amount.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Funding Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sumber Dana & Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Funding Source */}
              <div className="space-y-2">
                <Label>Sumber Dana *</Label>
                <Select
                  value={watch('funding_source_id')}
                  onValueChange={(value) => setValue('funding_source_id', value)}
                >
                  <SelectTrigger className={errors.funding_source_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Pilih sumber dana" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundingSources?.map((source: any) => (
                      <SelectItem key={source.id} value={source.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {source.type === 'petty_cash' ? 'Kas' : 'Bank'}
                          </Badge>
                          {source.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.funding_source_id && (
                  <p className="text-sm text-destructive">{errors.funding_source_id.message}</p>
                )}
              </div>

              {/* Payment Method */}
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

            {/* Beneficiary (Bank Only) */}
            {isBank && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-4">Informasi Penerima (Bank Transfer)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nama Penerima</Label>
                      <Input
                        placeholder="Nama sesuai rekening"
                        {...form.register('beneficiary_name')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nama Bank</Label>
                      <Input
                        placeholder="Contoh: BCA, Mandiri, BNI"
                        {...form.register('beneficiary_bank')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nomor Rekening</Label>
                      <Input
                        placeholder="Nomor rekening tujuan"
                        {...form.register('beneficiary_account')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Penerima</Label>
                      <Input
                        type="email"
                        placeholder="email@contoh.com"
                        {...form.register('beneficiary_email')}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lampiran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
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
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Klik untuk upload atau drag & drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPG, PNG, DOC, XLS (maks. 10MB per file)
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
                      <SelectTrigger className="w-32">
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
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Catatan Tambahan</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Catatan atau informasi tambahan..."
              className="min-h-[80px]"
              {...form.register('notes')}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
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
            Kirim Pengajuan
          </Button>
        </div>
      </form>
    </div>
  );
}
