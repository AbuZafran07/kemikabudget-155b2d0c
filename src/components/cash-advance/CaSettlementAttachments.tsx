import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { File, FileText, Image, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_LABEL } from "@/lib/imageCompression";
import { CA_SETTLEMENT_ATTACHMENT_BUCKET, CA_SETTLEMENT_ATTACHMENT_TYPES } from "@/lib/ca-policy";
import {
  caSettlementAttachmentsKey,
  useCaSettlementAttachments,
  type CaSettlementAttachment,
} from "@/hooks/useCaSettlementAttachments";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

interface CaSettlementAttachmentsProps {
  settlementId: string;
  cashAdvanceId: string;
  /** true = hanya lihat (tanpa unggah/hapus) */
  readOnly?: boolean;
  /** tampilkan penanda wajib */
  required?: boolean;
}

const CaSettlementAttachments = ({ settlementId, cashAdvanceId, readOnly = false, required = false }: CaSettlementAttachmentsProps) => {
  const { language } = useLanguage();
  const en = language === "en";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("receipt");
  const { data: attachments = [], isLoading } = useCaSettlementAttachments(settlementId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: caSettlementAttachmentsKey(settlementId) });

  const typeLabel = (value: string) => {
    const found = CA_SETTLEMENT_ATTACHMENT_TYPES.find((type) => type.value === value);
    return found ? (en ? found.en : found.id) : value;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    let file: File = files[0];

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(en ? "Only JPG, PNG, WEBP or PDF files are allowed" : "Hanya file JPG, PNG, WEBP, atau PDF yang diizinkan");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.type.startsWith("image/")) {
      file = await compressImage(file, 0.7, MAX_FILE_SIZE_BYTES);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(en ? `File exceeds ${MAX_FILE_SIZE_LABEL} after compression` : `File melebihi batas ${MAX_FILE_SIZE_LABEL} setelah kompresi`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${user.id}/${settlementId}/${Date.now()}_${sanitizedName}`;
    try {
      const { error: uploadError } = await supabase.storage.from(CA_SETTLEMENT_ATTACHMENT_BUCKET).upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("cash_advance_settlement_attachments").insert({
        settlement_id: settlementId,
        // trigger database tetap menyamakan cash_advance_id dengan data realisasi
        cash_advance_id: cashAdvanceId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        attachment_type: selectedType,
        uploaded_by: user.id,
      });
      if (insertError) {
        await supabase.storage.from(CA_SETTLEMENT_ATTACHMENT_BUCKET).remove([filePath]);
        throw insertError;
      }
      toast.success(en ? "Attachment uploaded" : "Bukti berhasil diunggah");
      refresh();
    } catch (error) {
      console.error("CA settlement attachment upload error:", error);
      toast.error(error instanceof Error ? error.message : en ? "Upload failed" : "Gagal mengunggah bukti");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (attachment: CaSettlementAttachment) => {
    try {
      const { error } = await supabase.from("cash_advance_settlement_attachments").delete().eq("id", attachment.id);
      if (error) throw error;
      // File yang sama bisa dipakai riwayat realisasi lama (hasil revisi): hapus file hanya bila tidak dirujuk lagi.
      const { count } = await supabase
        .from("cash_advance_settlement_attachments")
        .select("id", { count: "exact", head: true })
        .eq("file_path", attachment.file_path);
      if (!count) {
        await supabase.storage.from(CA_SETTLEMENT_ATTACHMENT_BUCKET).remove([attachment.file_path]);
      }
      toast.success(en ? "Attachment removed" : "Bukti dihapus");
      refresh();
    } catch (error) {
      console.error("CA settlement attachment delete error:", error);
      toast.error(error instanceof Error ? error.message : en ? "Delete failed" : "Gagal menghapus bukti");
    }
  };

  const handleView = async (attachment: CaSettlementAttachment) => {
    const { data, error } = await supabase.storage
      .from(CA_SETTLEMENT_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(en ? "Unable to open file" : "File tidak dapat dibuka");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const fileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (fileType === "application/pdf") return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <Label>
        {en ? "Realization Proof" : "Bukti Realisasi"} {required && !readOnly && <span className="text-destructive">*</span>}
      </Label>

      {!readOnly && (
        <Card className="p-4 border-dashed">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 space-y-2">
              <Label className="text-sm">{en ? "Proof type" : "Jenis bukti"}</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CA_SETTLEMENT_ATTACHMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {en ? type.en : type.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {uploading ? (en ? "Uploading..." : "Mengunggah...") : en ? "Upload proof" : "Unggah bukti"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {en
              ? `JPG, PNG, WEBP or PDF, max ${MAX_FILE_SIZE_LABEL} (photos are compressed automatically). Upload receipts, transfer/QRIS proof, or a stamped receipt where required.`
              : `JPG, PNG, WEBP, atau PDF, maks. ${MAX_FILE_SIZE_LABEL} (foto dikompres otomatis). Unggah nota/kuitansi, bukti transfer/QRIS, atau tanda terima bermeterai bila diwajibkan.`}
          </p>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{en ? "Loading..." : "Memuat..."}</p>
      ) : attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <Card key={attachment.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 text-muted-foreground">{fileIcon(attachment.file_type)}</div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleView(attachment)}
                    className="text-sm font-medium text-primary hover:underline truncate block text-left w-full"
                  >
                    {attachment.file_name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(attachment.attachment_type)} • {formatFileSize(attachment.file_size)}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(attachment)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className={`text-sm text-center py-3 ${required && !readOnly ? "text-destructive" : "text-muted-foreground"}`}>
          {en ? "No proof uploaded yet" : "Belum ada bukti yang diunggah"}
        </p>
      )}
    </div>
  );
};

export default CaSettlementAttachments;
