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
  // `document.fonts` is not available in all browsers; best-effort only.
  // When exporting from an iframe, we must wait on the iframe document, not the app document.
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

  // Robust approach: render the FULL HTML inside an off-screen iframe (same as preview)
  // to avoid style/theme leakage from the app and prevent blank canvas captures.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "pdf-export");
  iframe.style.cssText = `
    position: fixed;
    left: -100000px;
    top: 0;
    width: 210mm;
    height: 297mm;
    border: 0;
    background: #fff;
    opacity: 1;
    pointer-events: none;
    z-index: -1;
  `;

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWin = iframe.contentWindow;
  if (!iframeDoc || !iframeWin) {
    iframe.parentNode?.removeChild(iframe);
    throw new Error("PDF export iframe not available");
  }

  // Write the full HTML into the iframe
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  try {
    // Ensure a known safe base (in case the HTML lacks body styling)
    iframeDoc.documentElement.style.background = "#fff";
    iframeDoc.body.style.background = "#fff";
    iframeDoc.body.style.color = "#000";
    iframeDoc.body.style.fontFamily = "Arial, sans-serif";

    const exportRoot =
      (iframeDoc.querySelector(".container") as HTMLElement | null) ??
      (iframeDoc.body as unknown as HTMLElement | null);

    if (!exportRoot) {
      throw new Error("Could not find export container in PDF HTML");
    }

    // Force layout calculation
    void exportRoot.offsetHeight;

    // Wait resources INSIDE the iframe
    await waitForFonts(iframeDoc);
    await waitForImages(exportRoot);

    // Ensure paint is complete (iframe window)
    await raf(iframeWin);
    await raf(iframeWin);
    await new Promise<void>((r) => iframeWin.setTimeout(r, 50));

    const rect = exportRoot.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      throw new Error(
        `PDF export root has invalid size (w:${rect.width}, h:${rect.height})`
      );
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
        scrollY: 0,
        windowWidth: Math.max(rect.width, 800),
        windowHeight: Math.max(rect.height, 600),
        letterRendering: true,
        logging: false,
        backgroundColor: "#ffffff",
        x: 0,
        y: 0,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: orientation,
      },
    });

    await worker.from(exportRoot).save();
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}
