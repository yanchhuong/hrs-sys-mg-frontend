/**
 * Print a full HTML document via a hidden same-page iframe.
 *
 * Why not window.open? A pop-up needs a live user gesture to bypass
 * the browser's pop-up blocker — and Tauri's WebView2 blocks it
 * unconditionally. Any code path that fires print from a useEffect
 * (auto-print on "Payment received", template-preview reopen, etc.)
 * hits "Pop-up blocked — allow pop-ups…" every time. An iframe is
 * a same-origin child of the current page; no gesture required.
 *
 * Call it with a complete HTML doc string (leading <!doctype html>).
 * Returns false only if the DOM isn't ready — the caller can toast
 * that as a real error since it should never happen in-app.
 */
export function printHtmlViaIframe(html: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  document.body.appendChild(frame);

  const cleanup = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) { cleanup(); return false; }
  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      const win = frame.contentWindow;
      if (!win) { cleanup(); return; }
      win.focus();
      win.print();
    } finally {
      // Leave the iframe long enough for the print dialog to consume
      // its contents (Chromium reads from the iframe live). 4s covers
      // the typical "Save as PDF" render before teardown.
      setTimeout(cleanup, 4000);
    }
  };

  // Wait on the logo (if any) so the receipt doesn't print with a
  // broken image box where the logo should be. Fall through after
  // 1.5s so a slow / offline image never hangs the print.
  const logoImg = doc.querySelector('img.logo, img[data-print-wait]') as HTMLImageElement | null;
  if (logoImg && !logoImg.complete) {
    logoImg.addEventListener('load', fire, { once: true });
    logoImg.addEventListener('error', fire, { once: true });
    setTimeout(fire, 1500);
  } else {
    setTimeout(fire, 100);
  }
  return true;
}
