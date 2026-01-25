// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralized PDF export helper using html2pdf.js
 * Uses @ts-nocheck because html2pdf.js typings are incomplete/inconsistent
 */
import html2pdf from "html2pdf.js";

function waitForImages(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();

  const loadPromise = Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const onDone = () => {
            img.removeEventListener("load", onDone);
            img.removeEventListener("error", onDone);
            resolve();
          };
          img.addEventListener("load", onDone);
          img.addEventListener("error", onDone);
        })
    )
  ).then(() => {});

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });

  return Promise.race([loadPromise, timeout]);
}

function waitForFonts(doc: Document): Promise<void> {
  const anyDoc = doc as any;
  const fonts = anyDoc?.fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.catch(() => {});
}

function raf(win: Window): Promise<void> {
  return new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
}

export async function exportStyledHtmlToPdf(params: {
  html: string;
  fileName: string;
  marginMm?: number;
  orientation?: "portrait" | "landscape";
}): Promise<void> {
  const { html, fileName, marginMm = 10, orientation = "portrait" } = params;

  if (!html || !html.trim()) {
    throw new Error("PDF HTML is empty");
  }

  // Create visible container for rendering (html2canvas needs visible elements)
  const wrapper = document.createElement("div");
  wrapper.id = "pdf-export-wrapper";
  wrapper.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 210mm;
    min-height: 297mm;
    background: #fff;
    z-index: 99999;
    overflow: visible;
    padding: 0;
    margin: 0;
  `;
  
  // Parse and inject the HTML body content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  // Extract styles and body
  const styles = doc.querySelectorAll("style");
  const bodyContent = doc.body.innerHTML;
  
  // Create style element with all styles
  let combinedStyles = "";
  styles.forEach((style) => {
    combinedStyles += style.textContent || "";
  });
  
  // Add critical fixes for PDF rendering
  combinedStyles += `
    * { box-sizing: border-box !important; }
    body, html { margin: 0 !important; padding: 0 !important; }
    .container { 
      width: 190mm !important; 
      margin: 0 auto !important; 
      padding: 5mm !important;
      background: #fff !important;
    }
    .preview-actions { display: none !important; }
    
    /* Force table layouts to render properly */
    table { border-collapse: collapse !important; }
    td, th { padding: 8px !important; }
    
    /* Force flexbox to work */
    .header, .info-section, .payment-section, .signature-section {
      display: flex !important;
    }
  `;
  
  const styleEl = document.createElement("style");
  styleEl.textContent = combinedStyles;
  
  wrapper.appendChild(styleEl);
  wrapper.innerHTML += bodyContent;
  
  document.body.appendChild(wrapper);
  
  try {
    // Force layout calculation
    void wrapper.offsetHeight;
    void wrapper.offsetWidth;
    
    // Wait for fonts
    await waitForFonts(document);
    
    // Wait for images
    await waitForImages(wrapper);
    
    // Multiple animation frames for proper rendering
    await raf(window);
    await raf(window);
    await raf(window);
    
    // Extra delay for complex layouts
    await new Promise<void>((r) => setTimeout(r, 300));
    
    // Find the container element
    const container = wrapper.querySelector(".container") as HTMLElement || wrapper;
    
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      throw new Error(`PDF export root has invalid size (w:${rect.width}, h:${rect.height})`);
    }
    
    // Configure and run html2pdf
    const worker = html2pdf();
    
    worker.set({
      margin: marginMm,
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: 794, // A4 width in pixels at 96dpi
        windowHeight: 1123, // A4 height in pixels at 96dpi
        letterRendering: true,
        logging: false,
        backgroundColor: "#ffffff",
        allowTaint: true,
        foreignObjectRendering: false,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: orientation,
      },
    });

    await worker.from(container).save();
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}
