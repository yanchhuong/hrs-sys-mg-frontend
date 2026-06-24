/**
 * Shared file → base64 data-URL reader for image uploads (logo on
 * POS Settings, drag-drop on Items, KHRQR cards, …). Keeping the
 * read + validation in one place means every dropper enforces the
 * same size cap and rejects the same non-image MIME types.
 */

/** Cap upload size at 1 MB. Larger images bloat the row, slow the
 *  print preview, and rarely look better at the small sizes the
 *  receipt / cards render to. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export interface ReadOptions {
  /** Override the default 1 MB cap. Pass 0 to disable the check. */
  maxBytes?: number;
}

/** Read a File as a base64 data URL. Rejects non-image MIME types
 *  and files larger than {@link ReadOptions.maxBytes} so the caller
 *  can surface a single error to the user. */
export function readImageAsDataUrl(file: File, opts: ReadOptions = {}): Promise<string> {
  const cap = opts.maxBytes ?? MAX_IMAGE_BYTES;
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error(`"${file.name}" is not an image`));
  }
  if (cap > 0 && file.size > cap) {
    const mb = (cap / (1024 * 1024)).toFixed(1);
    return Promise.reject(new Error(`Image too large — keep it under ${mb} MB`));
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read image'));
    r.onload  = () => {
      const v = r.result;
      if (typeof v === 'string' && v.startsWith('data:')) resolve(v);
      else reject(new Error('Unexpected reader output'));
    };
    r.readAsDataURL(file);
  });
}
