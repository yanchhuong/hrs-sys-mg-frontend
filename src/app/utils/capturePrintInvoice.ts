import html2canvas from 'html2canvas';

/**
 * Capture the currently-mounted sale-document print template (the
 * body-level portal that {@code PrintTaxInvoice} /
 * {@code PrintQuotation} / {@code PrintVoucher} all share via the
 * {@code .print-tax-invoice} class) into a PNG base64 data URL.
 *
 * <p>The template lives mounted via {@code createPortal} so it
 * survives the dialog's stacking context. By design it carries
 * {@code display: none} until {@code @media print} kicks in — we
 * briefly swap it to an off-screen visible state, capture, then
 * restore.</p>
 *
 * <p>Returns null when the template isn't in the DOM (caller falls
 * back to text-only send).</p>
 */
export async function capturePrintImage(): Promise<string | null> {
  const el = document.querySelector<HTMLElement>('.print-tax-invoice');
  if (!el) return null;

  // Snapshot the styles we'll mutate so we can put them back even
  // if html2canvas throws mid-render.
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
    // Park the element off-screen but laid out so html2canvas can
    // measure + render it. left:-99999px keeps it invisible to the
    // user; the print template is wide (~A4 width), so a fixed
    // 794px works out to ~210mm @ 96dpi for crisp rendering.
    el.style.display = 'block';
    el.style.position = 'fixed';
    el.style.left = '-99999px';
    el.style.top = '0';
    el.style.zIndex = '-1';
    el.style.background = 'white';
    el.style.width = '794px';
    el.style.padding = '14mm';

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      // 2x scale = retina-sharp on a phone screen; the file size
      // sits well under Telegram's 10 MB photo cap.
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[capturePrintInvoice] capture failed:', err);
    return null;
  } finally {
    // Restore — important even on failure so the on-screen UI
    // doesn't end up with the print template visible at an odd
    // offset.
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
