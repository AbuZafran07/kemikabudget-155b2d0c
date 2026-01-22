import { useState, useEffect, useRef } from "react";
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
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
      setIsPreviewReady(false);
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
      // Use the already-generated preview HTML (keeps content consistent)
      const htmlForExport = previewHtml;
      if (!htmlForExport) {
        throw new Error('Preview HTML is empty');
      }

      // Parse full HTML document then export only the styled body content.
      // This avoids blank PDFs caused by injecting <html>/<head> fragments into a <div>.
      const doc = new DOMParser().parseFromString(htmlForExport, 'text/html');
      const styleEl = doc.querySelector('style');
      const containerEl = doc.querySelector('.container');
      if (!containerEl) {
        throw new Error('Could not find .container element in PDF HTML');
      }

      const wrapper = document.createElement('div');
      // Keep it offscreen (not opacity:0) so html2canvas can still render it
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-10000px';
      wrapper.style.top = '0';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '-1';

      if (styleEl) wrapper.appendChild(styleEl.cloneNode(true));
      wrapper.appendChild(containerEl.cloneNode(true));
      document.body.appendChild(wrapper);
      
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

      // Give the browser a tick to layout the hidden content before rendering.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      
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
            ref={iframeRef}
            srcDoc={previewHtml}
            className="w-full h-[600px] border-0"
            title="PDF Preview"
            onLoad={() => setIsPreviewReady(true)}
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
            disabled={isDownloading || !isPreviewReady || !previewHtml}
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
