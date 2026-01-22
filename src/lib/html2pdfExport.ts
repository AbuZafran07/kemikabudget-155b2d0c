/* eslint-disable @typescript-eslint/no-explicit-any */
import html2pdf from "html2pdf.js";

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

  const doc = new DOMParser().parseFromString(html, "text/html");
  const styleEl = doc.querySelector("style");
  const containerEl = doc.querySelector(".container") ?? doc.body;
  if (!containerEl) {
    throw new Error("Could not find export container in PDF HTML");
  }

  // Render the content in the main document so html2canvas can reliably capture it.
  // We keep it visible but off-screen to avoid browser optimizations that can result in blank renders.
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-200vw";
  wrapper.style.top = "0";
  wrapper.style.width = "210mm";
  wrapper.style.background = "#fff";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "-1";

  const clonedContainer = containerEl.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clonedContainer);
  document.body.appendChild(wrapper);

  // IMPORTANT: Put the <style> into <head> (not inside the wrapper <div>),
  // to ensure consistent style application across browsers.
  let injectedStyle: HTMLStyleElement | null = null;
  if (styleEl && styleEl.textContent) {
    injectedStyle = document.createElement("style");
    injectedStyle.setAttribute("data-pdf-export", "1");
    injectedStyle.textContent = styleEl.textContent;
    document.head.appendChild(injectedStyle);
  }

  try {
    // Allow the browser to layout and paint before rendering to canvas.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Create worker and configure - using any to bypass html2pdf.js typing issues
    const worker = html2pdf();
    
    (worker as any).set({
      margin: marginMm,
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: orientation,
      },
    });

    await worker.from(wrapper).save();
  } finally {
    if (injectedStyle?.parentNode) injectedStyle.parentNode.removeChild(injectedStyle);
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }
}
