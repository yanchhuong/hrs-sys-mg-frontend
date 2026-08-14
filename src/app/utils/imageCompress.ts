/**
 * Client-side image compression. Called from every image-upload surface
 * so a customer can drag in a 6 MB phone photo and we still persist a
 * ~200 KB base64 blob — no BE resize, no separate CDN.
 *
 * Approach:
 *   1. Decode the file via createImageBitmap when available (fast path
 *      on modern Chromium/WebView2) — falls back to <img>+FileReader
 *      on browsers that don't expose ImageBitmap.
 *   2. Downscale to fit inside MAX_EDGE px on the longest side. Skip
 *      the resize when the source already fits — no point re-encoding
 *      a 400×400 icon just to make it slightly worse.
 *   3. Re-encode as JPEG at QUALITY. Transparent PNGs are kept as PNG
 *      (JPEG would fill their alpha with black).
 *   4. Return a data-URL string so it round-trips through the same
 *      JSON path the old single-image code already used.
 *
 * Cap: refuses raw source files above HARD_MAX_BYTES so we don't try
 * to decode a 100 MB TIFF and crash the tab. That's a decoder guard,
 * not a storage cap — the OUTPUT is always small.
 */

// v-image-sharpen-v2 — every upload used to run through this
// downscale + re-encode pipeline unconditionally, so a pristine
// 500 KB source JPG lost quality even though it never needed
// compression. Operators reported the resulting POS covers looked
// soft. New rules:
//   • Source under BYPASS_COMPRESS_BYTES (2 MB) — return it as-is,
//     no canvas trip, no re-encode. Pristine bytes ship straight
//     through as the base64 data URL.
//   • Source at or over 2 MB — downscale to MAX_EDGE and re-encode
//     at QUALITY as before. Protects the DB from a 25 MB phone photo
//     while leaving normal shop pictures untouched.
//
// Downscaled pipeline sits at 768px / Q78 (previously 512/Q70). A
// 224 px POS tile at 2× DPR is ~448 px, which the old 512 pipeline
// barely covered; 768 covers desktop zooms + product-detail overlays.
// Thumbnails (`makeThumbnailFromUrl` below) now emit 400/Q80 so the
// grid tile is crisp on high-DPI displays — see the bumped defaults
// on the export.
const BYPASS_COMPRESS_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 768;
const QUALITY  = 0.78;
const HARD_MAX_BYTES = 25 * 1024 * 1024;

/** File formats we refuse to compress because Canvas.toBlob can't
 *  represent them (HEIC on Windows Chromium) or because they're
 *  animated (GIF re-encode drops frames). We keep them as-is so the
 *  operator at least gets a warning at the size-cap step. */
const PASSTHROUGH_MIME = new Set(['image/gif']);

async function decode(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    img.src = url;
  });
}

function edges(source: HTMLImageElement | ImageBitmap): { w: number; h: number } {
  return {
    w: 'naturalWidth'  in source ? source.naturalWidth  : source.width,
    h: 'naturalHeight' in source ? source.naturalHeight : source.height,
  };
}

/**
 * Downscale an existing data-URL (or http URL) image to a base64
 * thumbnail. Used at save time to produce the small cover that
 * list surfaces render — POS grid tile, Items table row, Public
 * Shop card — so the item-list JSON doesn't have to ship the
 * full-size cover per row.
 *
 * Defaults bumped from 200/Q65 (v-image-sharpen) to 400/Q80
 * (v-image-sharpen-v2). A POS tile is ~200 px CSS and displays at
 * ~400 px on a 2× DPR panel; anything smaller than the display size
 * gets upscaled by the browser and reads as blur. Bytes go from
 * ~10 KB to ~35 KB per thumbnail — the list-JSON payload cost is
 * manageable up to a few hundred items and disappears in gzip.
 *
 * Returns the original URL unchanged if it's already smaller than
 * the thumbnail edge — no point re-encoding a 128 px icon.
 */
export async function makeThumbnailFromUrl(
  src: string,
  edge = 400,
  quality = 0.8,
): Promise<string> {
  if (!src) return src;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image for thumbnail'));
    el.src = src;
  });
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, edge / Math.max(srcW, srcH));
  if (scale >= 1) return src;   // already small enough — no thumbnail needed
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const blob: Blob | null = await new Promise(res =>
    canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) return src;
  return await blobToDataUrl(blob);
}

/** Compress a picked File to a base64 data URL. Preserves PNG when
 *  the source is PNG (probably has alpha); otherwise emits JPEG.
 *  Bypasses the whole pipeline when the source is already small
 *  (under {@link BYPASS_COMPRESS_BYTES}) so pristine photos ship
 *  through untouched. */
export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image`);
  }
  if (file.size > HARD_MAX_BYTES) {
    throw new Error('Image is over 25 MB — pick a smaller source file.');
  }
  if (PASSTHROUGH_MIME.has(file.type)) {
    return await fileToDataUrl(file);
  }
  // Under 2 MB — return the source bytes as-is. Avoids the quality
  // hit of a canvas re-encode on a picture that never needed
  // compression to begin with. GIFs already short-circuited above.
  if (file.size < BYPASS_COMPRESS_BYTES) {
    return await fileToDataUrl(file);
  }

  const source = await decode(file);
  const { w: srcW, h: srcH } = edges(source);
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

  const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob: Blob | null = await new Promise(res =>
    canvas.toBlob(res, outMime, outMime === 'image/jpeg' ? QUALITY : undefined));
  if (!blob) throw new Error('Compression failed');

  // Free the decoded bitmap when the browser gave us one.
  if ('close' in source && typeof source.close === 'function') source.close();

  return await blobToDataUrl(blob);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read image'));
    r.onload  = () => {
      const v = r.result;
      if (typeof v === 'string') resolve(v);
      else reject(new Error('Unexpected reader output'));
    };
    r.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to encode compressed image'));
    r.onload  = () => {
      const v = r.result;
      if (typeof v === 'string') resolve(v);
      else reject(new Error('Unexpected reader output'));
    };
    r.readAsDataURL(blob);
  });
}
