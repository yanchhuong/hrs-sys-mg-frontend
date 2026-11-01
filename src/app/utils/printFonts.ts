/**
 * Force-load the Khmer print fonts (Battambang body + Muol Light / Moul
 * titles) before triggering window.print(). The print-only Cambodian tax-invoice templates
 * are mounted with display: none and rendered via @media print, so
 * Google Fonts may not have requested the font files yet by the time
 * the print dialog snapshots the page — fallbacks (Hanuman / Khmer OS)
 * would then leak into the printed PDF.
 *
 * Uses the CSS Font Loading API (document.fonts.load) which is
 * available in every modern browser. The promise resolves once the
 * font is downloaded and registered; we await both fonts then call
 * window.print() so the print engine always sees real glyphs.
 *
 * If document.fonts isn't available (very old browser, or running
 * in a non-DOM context like SSR) we fall through to a plain print —
 * better to print with fallbacks than to swallow the click.
 */
export async function printWithKhmerFonts(): Promise<void> {
  await khmerPrintFontsReady();
  window.print();
}

/**
 * The same fonts, for the html2canvas captures (forward image, PDF):
 * a display:none template never makes the browser fetch them either.
 *
 * Google serves each script as its own unicode-range face and
 * document.fonts.load only fetches the faces its sample text touches,
 * so the sample carries a Khmer letter — without it only the Latin
 * subset loaded.
 */
export async function khmerPrintFontsReady(): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all([
        document.fonts.load('400 14px Battambang', 'Aក'),
        document.fonts.load('700 14px Battambang', 'Aក'),
        document.fonts.load('400 20px Moul', 'Aក'),
        document.fonts.load('400 20px "Khmer OS Muol Light"', 'Aក'),
      ]);
    }
  } catch {
    // Swallow — never block printing on a font-load failure.
  }
}
