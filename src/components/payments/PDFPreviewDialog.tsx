import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Eye } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  generatePengajuanDanaHTML, 
  previewPengajuanDanaPDF,
  type PengajuanDanaData 
} from "@/lib/generatePengajuanDanaPDF";

interface PDFPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PengajuanDanaData | null;
  logoBase64?: string;
}

export function PDFPreviewDialog({ 
  open, 
  onOpenChange, 
  data,
  logoBase64 
}: PDFPreviewDialogProps) {
  const { language } = useLanguage();
  const [previewHtml, setPreviewHtml] = useState<string>("");

  useEffect(() => {
    if (data && open) {
      const html = generatePengajuanDanaHTML(data, logoBase64);
      // Remove preview actions for embedded preview
      const cleanHtml = html.replace(
        /<div class="preview-actions no-print">[\s\S]*?<\/div>/,
        ''
      );
      setPreviewHtml(cleanHtml);
    }
  }, [data, open, logoBase64]);

  const handlePrint = () => {
    if (data) {
      previewPengajuanDanaPDF(data, logoBase64);
    }
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {language === 'id' ? 'Preview Dokumen' : 'Document Preview'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-lg bg-white">
          <iframe
            srcDoc={previewHtml}
            className="w-full h-[600px] border-0"
            title="PDF Preview"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            {language === 'id' ? 'Tutup' : 'Close'}
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            {language === 'id' ? 'Cetak PDF' : 'Print PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
