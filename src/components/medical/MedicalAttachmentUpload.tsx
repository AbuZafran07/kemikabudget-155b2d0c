import { useState, useRef } from "react";
import { Upload, X, File, Image, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  attachment_type: string;
}

interface MedicalAttachmentUploadProps {
  claimId: string;
  attachments: Attachment[];
  onAttachmentsChange: () => void;
  disabled?: boolean;
}

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MedicalAttachmentUpload = ({
  claimId,
  attachments,
  onAttachmentsChange,
  disabled = false,
}: MedicalAttachmentUploadProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("receipt");

  const attachmentTypes = [
    { value: "receipt", label: t("medical.attachment.receipt") },
    { value: "prescription", label: t("medical.attachment.prescription") },
    { value: "referral", label: t("medical.attachment.referral") },
    { value: "lab_result", label: t("medical.attachment.labResult") },
    { value: "medical_report", label: t("medical.attachment.medicalReport") },
    { value: "other", label: t("medical.attachment.other") },
  ];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    const file = files[0];

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t("medical.attachment.invalidType"));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("medical.attachment.fileTooLarge"));
      return;
    }

    setUploading(true);

    try {
      // Generate unique file path: user_id/claim_id/timestamp_filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${user.id}/${claimId}/${timestamp}_${sanitizedName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("medical-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save attachment record
      const { error: insertError } = await supabase
        .from("medical_claim_attachments")
        .insert({
          claim_id: claimId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          attachment_type: selectedType,
          uploaded_by: user.id,
        });

      if (insertError) throw insertError;

      toast.success(t("medical.attachment.uploadSuccess"));
      onAttachmentsChange();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || t("medical.attachment.uploadError"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    try {
      // Delete from storage
      await supabase.storage
        .from("medical-attachments")
        .remove([attachment.file_path]);

      // Delete record
      const { error } = await supabase
        .from("medical_claim_attachments")
        .delete()
        .eq("id", attachment.id);

      if (error) throw error;

      toast.success(t("medical.attachment.deleteSuccess"));
      onAttachmentsChange();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || t("medical.attachment.deleteError"));
    }
  };

  const handleView = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from("medical-attachments")
        .createSignedUrl(attachment.file_path, 60);

      if (error) throw error;

      window.open(data.signedUrl, "_blank");
    } catch (error: any) {
      console.error("View error:", error);
      toast.error(t("medical.attachment.viewError"));
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <Image className="h-4 w-4" />;
    }
    if (fileType === "application/pdf") {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentTypeLabel = (type: string) => {
    const found = attachmentTypes.find((t) => t.value === type);
    return found ? found.label : type;
  };

  return (
    <div className="space-y-4">
      <Label>{t("medical.attachments")}</Label>

      {/* Upload Section */}
      {!disabled && (
        <Card className="p-4 border-dashed">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 space-y-2">
              <Label className="text-sm">{t("medical.attachment.type")}</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {attachmentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? t("common.uploading") : t("medical.attachment.upload")}
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
            {t("medical.attachment.hint")}
          </p>
        </Card>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <Card key={attachment.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 text-muted-foreground">
                  {getFileIcon(attachment.file_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleView(attachment)}
                    className="text-sm font-medium text-primary hover:underline truncate block text-left w-full"
                  >
                    {attachment.file_name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {getAttachmentTypeLabel(attachment.attachment_type)} •{" "}
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>
                {!disabled && (
                  <Button
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
      )}

      {attachments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("medical.attachment.noAttachments")}
        </p>
      )}
    </div>
  );
};

export default MedicalAttachmentUpload;
