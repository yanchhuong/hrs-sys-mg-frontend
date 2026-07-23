import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * V271 — capture the currently-mounted sale-document print template
 * ({@code .print-tax-invoice}) as a base64-encoded PDF (portrait A4)
 * suitable for attaching to an outgoing invoice / quotation email.
 *
 * <p>Reuses the same off-screen mount trick as
 * {@code capturePrintImage} so the customer sees the identical layout
 * they'd get if they hit the browser's Print button. The canvas is
 * page-sliced onto A4 sheets so long documents don't get squashed.</p>
 *
 * <p>Returns {@code null} when the template isn't in the DOM (caller
 * proceeds without an attachment — the email body still carries the
 * public view link so the recipient can view it in-browser).</p>
 */
export interface CapturedPdf {
  /** Raw base64 (no data-URL prefix) — direct into the backend DTO. */
  base64: string;
  /** MIME type. Always application/pdf. */
  contentType: 'application/pdf';
  /** Suggested filename. Caller usually overrides with a document-number-flavoured name. */
  filename: string;
}

export async function capturePrintPdf(defaultFilename = 'document.pdf'): Promise<CapturedPdf | null> {
  const el = document.querySelector<HTMLElement>('.print-tax-invoice');
  if (!el) {
    console.warn('[capturePrintPdf] .print-tax-invoice not in DOM — skipping attachment');
    return null;
  }

  const prev = {
    display: el.style.display,
    position: el.style.position,
    left: el.style.left,
    top: el.style.top,
    zIndex: el.style.zIndex,
    background: el.style.background,
    width: el.style.width,
    padding: el.style.padding,
  };

  try {
    el.style.display = 'block';
    el.style.position = 'fixed';
    el.style.left = '-99999px';
    el.style.top = '0';
    el.style.zIndex = '-1';
    el.style.background = 'white';
    el.style.width = '794px';  // ~210mm @ 96dpi
    el.style.padding = '14mm';

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // A4 portrait — 210 × 297mm. jsPDF works in mm by default.
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Fit the canvas's WIDTH to the page and let its height flow across
    // pages. Ratio here == (canvas.height / canvas.width) × pageW.
    const imgW = pageW;
    const imgH = (canvas.height / canvas.width) * imgW;

    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    } else {
      // Slice: offset the image up on each page until the whole thing
      // is covered. jsPDF renders the FULL image but clips to the page,
      // so offsetting Y negatively pushes later content into view.
      let remaining = imgH;
      let y = 0;
      while (remaining > 0) {
        pdf.addImage(imgData, 'JPEG', 0, y, imgW, imgH);
        remaining -= pageH;
        if (remaining > 0) {
          pdf.addPage();
          y -= pageH;
        }
      }
    }

    // jsPDF's output('datauristring') yields "data:application/pdf;base64,XXX".
    // We strip the prefix so the backend gets clean base64.
    const raw = pdf.output('datauristring');
    const comma = raw.indexOf(',');
    const base64 = comma >= 0 ? raw.substring(comma + 1) : raw;

    return { base64, contentType: 'application/pdf', filename: defaultFilename };
  } catch (err) {
    console.warn('[capturePrintPdf] capture failed:', err);
    return null;
  } finally {
    el.style.display = prev.display;
    el.style.position = prev.position;
    el.style.left = prev.left;
    el.style.top = prev.top;
    el.style.zIndex = prev.zIndex;
    el.style.background = prev.background;
    el.style.width = prev.width;
    el.style.padding = prev.padding;
  }
}
