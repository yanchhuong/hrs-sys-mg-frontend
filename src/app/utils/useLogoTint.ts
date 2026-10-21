/**
 * v-footer-logo-tint — read the brand colour out of the logo image.
 *
 * The DOM half of logoColor.ts: load the image, sample it onto a
 * small canvas, hand the pixels to the pure functions.
 *
 * Works because the company logo is stored as a base64 data URL
 * (Settings → Company logo writes one), and a data URL does not
 * taint a canvas. The settings page also offers a "paste a CDN link"
 * fallback, and THAT would taint: getImageData throws a
 * SecurityError on a cross-origin image without CORS headers. So the
 * read is wrapped and returns null, which puts the band back on its
 * configured colour rather than breaking the invoice.
 *
 * 48px is plenty: this is looking for the dominant hue, not detail,
 * and it keeps the scan to a couple of thousand pixels.
 */
import { useEffect, useState } from 'react';
import { dominantFromPixels, toBandTint } from './logoColor';

const SAMPLE_PX = 48;

export function useLogoTint(logoUrl: string | null | undefined, enabled: boolean): string | null {
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !logoUrl) { setTint(null); return; }

    let live = true;
    const img = new Image();
    // Harmless on a data URL; lets a CORS-enabled remote logo work
    // instead of tainting. One without the headers still fails, and
    // is caught below.
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (!live) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_PX;
        canvas.height = SAMPLE_PX;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, SAMPLE_PX, SAMPLE_PX);
        const { data } = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX);
        const rgb = dominantFromPixels(data);
        // null = a logo with no colour in it (mono mark). Leave the
        // band on its configured colour rather than tinting it grey.
        if (rgb) setTint(toBandTint(rgb));
      } catch {
        /* tainted canvas, or no 2d context — fall back silently */
      }
    };
    img.onerror = () => { /* broken logo URL — fall back */ };
    img.src = logoUrl;

    return () => { live = false; };
  }, [logoUrl, enabled]);

  return tint;
}
