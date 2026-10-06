/**
 * Run an html2canvas capture with its font-baseline probe measured right.
 *
 * html2canvas finds each font's baseline by putting a 1×1 <img> beside
 * sample text in a hidden <div> on <body> (its FontMetrics probe) and
 * reading the image's offsetTop. Tailwind's preflight makes every <img>
 * `display: block`, so the probe drops onto its own line, the baseline
 * comes out about half a line too low, and every glyph in the capture is
 * drawn that far down: VAT TIN digits fall out of their boxes, table text
 * sits on the bottom border. (The VatTinBoxes / BiLabel workarounds in
 * Invoices.tsx were chasing this.) The mobile app has no global img rule,
 * so its copy of the template captured correctly while this one didn't.
 *
 * The rule below puts the probe back inline for the length of the capture
 * only. It matches nothing else: the probe is the one direct <img> child
 * of a body-level <div> styled `visibility: hidden`.
 */
export async function withHtml2canvasBaselineFix<T>(run: () => Promise<T>): Promise<T> {
  const style = document.createElement('style');
  style.textContent = 'body > div[style*="visibility: hidden"] > img { display: inline !important; }';
  document.head.appendChild(style);
  try {
    return await run();
  } finally {
    style.remove();
  }
}
