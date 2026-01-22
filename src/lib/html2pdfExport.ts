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

  // Create off-screen wrapper for html2canvas to capture
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
    z-index: 1;
    transform: translate3d(-120%, 0, 0);
    will-change: transform;
  `;

  const clonedContainer = containerEl.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clonedContainer);
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

    // Double rAF to ensure browser has painted
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

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
  }
}
