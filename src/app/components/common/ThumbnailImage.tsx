import { useEffect, useState } from 'react';

/**
 * Renders an item cover as a tiny cached thumbnail so a huge legacy
 * data URL (up to 200KB @ 1024px, pre v-image-shrink) doesn't get
 * decoded to full resolution every time a POS tile or Items row
 * re-mounts.
 *
 * The first render for a given URL still hits the browser's normal
 * decode path (it needs SOMETHING to display while the downscale
 * happens on the next tick). Once the async downscale finishes, the
 * result is stored in a module-level Map and every subsequent render
 * of the same URL — same session, any component — uses the cached
 * small blob URL directly. Cache is capped at 200 entries LRU so the
 * memory footprint stays bounded no matter how many items ship.
 *
 * DOES NOT reduce network payload — the JSON response still carries
 * the full-size images. This only helps decode + paint + scroll cost.
 * For network wins, uploads are compressed to 512px in imageCompress.
 */

const CACHE = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<string>>();
const MAX_CACHE_ENTRIES = 200;
const THUMB_EDGE = 256;

async function makeThumbnail(src: string): Promise<string> {
  const cached = CACHE.get(src);
  if (cached) return cached;
  const inflight = IN_FLIGHT.get(src);
  if (inflight) return inflight;

  const task = (async () => {
    const img = await loadImage(src);
    const scale = Math.min(1, THUMB_EDGE / Math.max(img.width, img.height));
    if (scale >= 1) return src;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res =>
      canvas.toBlob(res, 'image/jpeg', 0.7));
    if (!blob) return src;
    const url = URL.createObjectURL(blob);
    if (CACHE.size >= MAX_CACHE_ENTRIES) {
      const first = CACHE.keys().next().value;
      if (first !== undefined) {
        const stale = CACHE.get(first);
        if (stale?.startsWith('blob:')) URL.revokeObjectURL(stale);
        CACHE.delete(first);
      }
    }
    CACHE.set(src, url);
    return url;
  })();

  IN_FLIGHT.set(src, task);
  try { return await task; }
  finally { IN_FLIGHT.delete(src); }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

interface Props {
  src: string;
  alt?: string;
  className?: string;
  onError?: () => void;
  loading?: 'lazy' | 'eager';
}

export function ThumbnailImage({ src, alt = '', className, onError, loading = 'lazy' }: Props): JSX.Element {
  const [display, setDisplay] = useState<string>(() => CACHE.get(src) ?? src);

  useEffect(() => {
    const cached = CACHE.get(src);
    if (cached) { setDisplay(cached); return; }
    setDisplay(src);
    let cancelled = false;
    makeThumbnail(src)
      .then(thumb => { if (!cancelled) setDisplay(thumb); })
      .catch(() => { /* fall back to the original src that's already showing */ });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <img
      src={display}
      alt={alt}
      className={className}
      loading={loading}
      onError={onError}
      draggable={false}
    />
  );
}
