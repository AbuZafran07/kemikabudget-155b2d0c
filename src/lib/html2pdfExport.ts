/* eslint-disable @typescript-eslint/no-explicit-any */
import html2pdfImport from "html2pdf.js";

// Force `any` because html2pdf.js typings are incomplete/inconsistent across versions
const html2pdf: any = html2pdfImport;

function waitForImages(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();

  const all: Promise<void> = Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          // Already loaded (or failed)
          if (img.complete) return resolve();
          const cleanup = () => {
            img.removeEventListener("load", onDone);
            img.removeEventListener("error", onDone);
          };
          const onDone = () => {
            cleanup();
            resolve();
          };
          img.addEventListener("load", onDone);
          img.addEventListener("error", onDone);
        })
    )
  ).then(() => undefined);

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });

  return Promise.race([all, timeout]);
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

  // Render the content in the main document so html2canvas can reliably capture it.
  // We keep it visible but off-screen to avoid browser optimizations that can result in blank renders.
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "0";
  // Keep it just outside the viewport to avoid flashes while still being painted.
  wrapper.style.transform = "translate3d(-120%, 0, 0)";
  wrapper.style.willChange = "transform";
  wrapper.style.top = "0";
  wrapper.style.width = "210mm";
  wrapper.style.height = "auto";
  wrapper.style.overflow = "visible";
  wrapper.style.background = "#fff";
  wrapper.style.pointerEvents = "none";
  // IMPORTANT: Don't use negative z-index; some browsers won't paint it (causes blank PDF).
  wrapper.style.zIndex = "1";

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
    // Force layout (avoid 0x0 capture in some browsers)
    void wrapper.offsetHeight;

    // Wait for web fonts when supported
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (document as any).fonts?.ready?.catch(() => undefined);

    // Wait for images (logo) to load inside the cloned DOM
    await waitForImages(wrapper);

    // Allow the browser to layout and paint before rendering to canvas.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const rect = wrapper.getBoundingClientRect();

    // Create worker and configure - force any to bypass html2pdf.js typing issues
    const worker: any = html2pdf();
    
    const options: any = {
      margin: marginMm,
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.ceil(rect.width || 0) || undefined,
        windowHeight: Math.ceil(rect.height || 0) || undefined,
        letterRendering: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: orientation,
      },
    };

    // Fully bypass typing from html2pdf.js by extracting the function as any
    const setFn: any = worker.set;
    setFn.call(worker, options);

    await worker.from(wrapper).save();
  } finally {
    if (injectedStyle?.parentNode) injectedStyle.parentNode.removeChild(injectedStyle);
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }
}
