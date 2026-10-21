/**
 * v-qr-crop-box — geometry for the draggable crop square.
 *
 * Pure: no DOM, no React, no pointer events. The web dialog and the
 * mobile sheet both drive these functions with deltas in IMAGE
 * pixels, so the two cannot drift apart on the one part that is
 * easy to get subtly wrong — what happens at the edges.
 *
 * The box is always a square, because a QR is. That makes a resize
 * one number rather than two, and it means a corner drag can never
 * produce a stretched crop that scans badly.
 */

export interface Box {
  x: number;
  y: number;
  /** Width and height both — the box is square. */
  size: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Smallest crop worth saving, in image pixels. */
export const MIN_BOX = 24;

/** Pull a box back inside the image, shrinking it first if it cannot fit. */
export function clampBox(b: Box, imgW: number, imgH: number, min = MIN_BOX): Box {
  const limit = Math.max(min, Math.min(imgW, imgH));
  const size = Math.min(Math.max(b.size, min), limit);
  return {
    size,
    x: Math.min(Math.max(b.x, 0), Math.max(0, imgW - size)),
    y: Math.min(Math.max(b.y, 0), Math.max(0, imgH - size)),
  };
}

/** Drag the whole box. It stops at the edges rather than sliding past. */
export function moveBox(b: Box, dx: number, dy: number, imgW: number, imgH: number): Box {
  return clampBox({ ...b, x: b.x + dx, y: b.y + dy }, imgW, imgH);
}

/**
 * Drag one corner. The opposite corner stays put, which is what makes
 * a resize feel anchored rather than slippery.
 *
 * The two deltas are averaged into one, since the box stays square —
 * dragging mostly-sideways and dragging mostly-down both work, and a
 * diagonal drag does the obvious thing. Signs differ per corner:
 * moving the NW corner right SHRINKS the box, moving the SE corner
 * right grows it.
 */
export function resizeBox(
  b: Box,
  corner: Corner,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
  min = MIN_BOX,
): Box {
  // The corner that must not move.
  const right  = b.x + b.size;
  const bottom = b.y + b.size;

  let size: number;
  switch (corner) {
    case 'se': size = b.size + (dx + dy) / 2; break;
    case 'nw': size = b.size - (dx + dy) / 2; break;
    case 'ne': size = b.size + (dx - dy) / 2; break;
    case 'sw': size = b.size + (dy - dx) / 2; break;
  }

  // How big the box may get before the anchored corner would have to
  // move, or the box would leave the image.
  const maxSize =
      corner === 'se' ? Math.min(imgW - b.x, imgH - b.y)
    : corner === 'nw' ? Math.min(right, bottom)
    : corner === 'ne' ? Math.min(imgW - b.x, bottom)
    :                   Math.min(right, imgH - b.y);

  size = Math.min(Math.max(size, min), Math.max(min, maxSize));

  const x = corner === 'nw' || corner === 'sw' ? right  - size : b.x;
  const y = corner === 'nw' || corner === 'ne' ? bottom - size : b.y;
  return clampBox({ x, y, size }, imgW, imgH, min);
}

/**
 * Where the box starts: on the QR the detector found, or — when it
 * found nothing — a centred square covering most of the image, so
 * there is always something to drag rather than a hunt for handles.
 */
export function initialBox(
  detected: { x: number; y: number; w: number; h: number } | null,
  imgW: number,
  imgH: number,
): Box {
  if (detected) {
    return clampBox(
      { x: detected.x, y: detected.y, size: Math.max(detected.w, detected.h) },
      imgW, imgH,
    );
  }
  const size = Math.round(Math.min(imgW, imgH) * 0.8);
  return clampBox({ x: (imgW - size) / 2, y: (imgH - size) / 2, size }, imgW, imgH);
}

/** Round to whole pixels for the final canvas draw. */
export function snapBox(b: Box): Box {
  return { x: Math.round(b.x), y: Math.round(b.y), size: Math.round(b.size) };
}

/**
 * Decoded byte size of a `data:` URL.
 *
 * Here because both crop UIs already import this module and both
 * need it for the same reason: the size limit belongs on the CROP,
 * not on the file that was picked. A phone screenshot is routinely
 * megabytes and the QR cut out of it is tens of kilobytes, so
 * checking the source first rejected uploads that would have been
 * fine — and rejected them before the operator could crop, which
 * left no way forward at all.
 *
 * Base64 carries 3 bytes per 4 characters, minus whatever the
 * trailing '=' padding stands in for.
 */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(dataUrl.slice(0, comma))) return body.length;
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(body.length * 3 / 4) - pad);
}
