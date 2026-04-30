/**
 * PNG export for the Insight Builder.
 *
 * html2canvas is loaded lazily via dynamic import so it doesn't ship in
 * the Data Explorer bundle for users who never export. The library is
 * ~50 kB gzipped and has no other consumers in the app.
 *
 * Why html2canvas instead of `canvas.toDataURL()` directly:
 *  - The current preview captures a styled white card with the chart's
 *    title and legend baked in by Chart.js. `toDataURL` on the bare
 *    canvas would still satisfy the acceptance criterion, but
 *    html2canvas keeps the door open to capturing surrounding chrome
 *    (description, watermark, footnotes) without re-plumbing later.
 */

/** Capture a DOM element as a PNG and trigger a browser download.
 *  Uses scale: 2 for high-DPI sharpness and a white background so
 *  transparent areas don't render as black on dark themes. */
export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode PNG"));
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
      } finally {
        // Defer revoke so Safari has time to start the download stream.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }, "image/png");
  });
}

/** Slugify a chart title into a safe download filename.
 *  Strips Windows-illegal characters, collapses whitespace, lowercases,
 *  and caps length so very long titles don't produce unwieldy files. */
export function buildInsightFilename(title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const slug =
    title
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 80) || "insight";
  return `${slug}-${today}.png`;
}
