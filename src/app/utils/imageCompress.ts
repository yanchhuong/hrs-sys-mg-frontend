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

const MAX_EDGE = 1600;
const QUALITY  = 0.82;
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

/** Compress a picked File to a base64 data URL. Preserves PNG when
 *  the source is PNG (probably has alpha); otherwise emits JPEG. */
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
