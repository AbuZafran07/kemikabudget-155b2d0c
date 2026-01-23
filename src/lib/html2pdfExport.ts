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

  // Create an overlay to hide the rendering from user but keep it visible to browser paint
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background: rgba(255,255,255,0.95);
    z-index: 99998;
    pointer-events: none;
  `;
  
  // Create wrapper - MUST be fully visible (opacity: 1) for html2canvas to work
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 210mm;
    height: auto;
    overflow: visible;
    background: #fff;
    pointer-events: none;
    z-index: 99999;
    opacity: 1;
  `;

  const clonedContainer = containerEl.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clonedContainer);
  
  // Add overlay first, then wrapper on top
  document.body.appendChild(overlay);
  document.body.appendChild(wrapper);

  // Inject styles into document head for consistent rendering
  let injectedStyle: HTMLStyleElement | null = null;
  if (styleEl?.textContent) {
    injectedStyle = document.createElement("style");
    injectedStyle.setAttribute("data-pdf-export", "1");
    injectedStyle.textContent = styleEl.textContent;
    document.head.appendChild(injectedStyle);
  }

  try {
    // Force layout calculation
    void wrapper.offsetHeight;

    // Wait for fonts
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => {});
    }

    // Wait for images to load
    await waitForImages(wrapper);

    // Triple rAF to ensure browser has fully painted
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    
    // Additional small delay to ensure paint is complete
    await new Promise<void>((r) => setTimeout(r, 100));

    // Get actual dimensions
    const rect = wrapper.getBoundingClientRect();

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

    await worker.from(wrapper).save();
  } finally {
    if (injectedStyle?.parentNode) {
      injectedStyle.parentNode.removeChild(injectedStyle);
    }
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
}
