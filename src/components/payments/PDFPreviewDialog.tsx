import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Eye, Download, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  generatePengajuanDanaHTML, 
  previewPengajuanDanaPDF,
  type PengajuanDanaData 
} from "@/lib/generatePengajuanDanaPDF";
import logoKemika from "@/assets/logo-kemika.png";
import html2pdf from "html2pdf.js";

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
  logoBase64: externalLogo 
}: PDFPreviewDialogProps) {
  const { language } = useLanguage();
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [logoBase64, setLogoBase64] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Load logo as base64 on mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const response = await fetch(logoKemika);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setLogoBase64(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('Failed to load logo:', error);
      }
    };
    loadLogo();
  }, []);

  useEffect(() => {
    if (data && open) {
      const logo = externalLogo || logoBase64;
      const html = generatePengajuanDanaHTML(data, logo);
      // Remove preview actions for embedded preview
      const cleanHtml = html.replace(
        /<div class="preview-actions no-print">[\s\S]*?<\/div>/,
        ''
      );
      setPreviewHtml(cleanHtml);
    }
  }, [data, open, logoBase64, externalLogo]);

  const handlePrint = () => {
    if (data) {
      const logo = externalLogo || logoBase64;
      previewPengajuanDanaPDF(data, logo);
    }
  };

  const handleDownload = async () => {
    if (!data) return;
    
    setIsDownloading(true);
    try {
      const logo = externalLogo || logoBase64;
      const html = generatePengajuanDanaHTML(data, logo);
      // Remove preview actions from download
      const cleanHtml = html.replace(
        /<div class="preview-actions no-print">[\s\S]*?<\/div>/,
        ''
      );
      
      // Create a temporary container
      const container = document.createElement('div');
      container.innerHTML = cleanHtml;
      
      // Extract just the body content
      const bodyContent = container.querySelector('.container');
      if (!bodyContent) {
        throw new Error('Could not find container element');
      }
      
      // Create wrapper with styles
      const wrapper = document.createElement('div');
      wrapper.innerHTML = cleanHtml;
      document.body.appendChild(wrapper);
      wrapper.style.position = 'absolute';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0';
      
      const fileName = `Pengajuan_Budget_${data.request_number.replace(/\//g, '_')}.pdf`;
      
      const opt = {
        margin: 10,
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' 
        }
      };
      
      await html2pdf().set(opt).from(wrapper).save();
      
      // Cleanup
      document.body.removeChild(wrapper);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setIsDownloading(false);
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
          <Button 
            variant="outline" 
            onClick={handleDownload} 
            className="gap-2"
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {language === 'id' ? 'Download PDF' : 'Download PDF'}
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
