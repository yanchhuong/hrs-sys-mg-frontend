/**
 * Shared file → base64 data-URL reader for image uploads (logo on
 * POS Settings, drag-drop on Items, KHRQR cards, …). Keeping the
 * read + validation in one place means every dropper enforces the
 * same size cap and rejects the same non-image MIME types.
 *
 * Every image now runs through {@link compressImageToDataUrl} first
 * so a 6 MB phone photo lands as a ~200 KB base64 blob — no more
 * upstream row-size blowups on stock_items.image_url.
 */
import { compressImageToDataUrl } from './imageCompress';

/** Post-compression cap, measured on the base64 output. Set to 3 MB
 *  because the pipeline now bypasses re-encode for sources under 2 MB
 *  (v-image-sharpen-v2 in imageCompress.ts) — those pass through as-is
 *  and pick up the base64 4/3 overhead, so a 2 MB source produces a
 *  ~2.67 MB data URL. 3 MB leaves a small margin while still catching
 *  the pathological cases (mostly-transparent scaled-up PNG that even
 *  the 768px/Q78 pipeline can't shrink). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export interface ReadOptions {
  /** Override the default 1 MB cap on the compressed output. Pass 0
   *  to disable the check entirely. */
  maxBytes?: number;
}

/** Read a File as a base64 data URL. Rejects non-image MIME types
 *  and files larger than {@link ReadOptions.maxBytes} so the caller
 *  can surface a single error to the user. */
export async function readImageAsDataUrl(file: File, opts: ReadOptions = {}): Promise<string> {
  const cap = opts.maxBytes ?? MAX_IMAGE_BYTES;
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image`);
  }
  const dataUrl = await compressImageToDataUrl(file);
  // Measure the compressed OUTPUT (base64 overhead ≈ 4/3). Skip when
  // the caller opted out (maxBytes=0) or the browser produced a small
  // enough encoding — the common path.
  if (cap > 0 && dataUrl.length > (cap * 4) / 3) {
    const mb = (cap / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Image is still over ${mb} MB after compression — try a smaller source.`,
    );
  }
  return dataUrl;
}
