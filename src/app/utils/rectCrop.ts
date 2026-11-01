/**
 * Geometry for the logo crop box — the free-shape sibling of
 * cropBox.ts (the KHQR square).
 *
 * Pure: no DOM, no React, no pointer events. The web dialog and the
 * mobile sheet both drive these functions with deltas in IMAGE pixels,
 * like the KHQR crop, so the two behave the same at the edges.
 *
 * A logo is rarely square — a wordmark is wide — so a corner drag moves
 * width and height on their own. The box starts on the logo itself:
 * findContentRect trims the plain margin a logo file usually carries,
 * so the template's logo size is the size of the mark, not of the mark
 * plus its padding.
 */

import type { Corner } from './cropBox';

export type { Corner };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest crop worth saving, in image pixels. */
export const MIN_RECT = 16;

/** Pull a box back inside the image, shrinking it first if it cannot fit. */
export function clampRect(r: Rect, imgW: number, imgH: number, min = MIN_RECT): Rect {
  const w = Math.min(Math.max(r.w, min), Math.max(min, imgW));
  const h = Math.min(Math.max(r.h, min), Math.max(min, imgH));
  return {
    w,
    h,
    x: Math.min(Math.max(r.x, 0), Math.max(0, imgW - w)),
    y: Math.min(Math.max(r.y, 0), Math.max(0, imgH - h)),
  };
}

/** Drag the whole box. It stops at the edges rather than sliding past. */
export function moveRect(r: Rect, dx: number, dy: number, imgW: number, imgH: number): Rect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, imgW, imgH);
}

/**
 * Drag one corner. The opposite corner stays put; each of the dragged
 * corner's two edges stops at the image edge and at the minimum size.
 */
export function resizeRect(
  r: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  imgW: number,
  imgH: number,
  min = MIN_RECT,
): Rect {
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  let x1 = r.x, y1 = r.y, x2 = right, y2 = bottom;
  if (corner === 'nw' || corner === 'sw') x1 = Math.min(Math.max(r.x + dx, 0), right - min);
  else x2 = Math.max(Math.min(right + dx, imgW), r.x + min);
  if (corner === 'nw' || corner === 'ne') y1 = Math.min(Math.max(r.y + dy, 0), bottom - min);
  else y2 = Math.max(Math.min(bottom + dy, imgH), r.y + min);
  return clampRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, imgW, imgH, min);
}

/** Round to whole pixels for the final canvas draw. */
export function snapRect(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
}

/**
 * The logo's own bounds in RGBA pixels: everything that is not the
 * background, plus a little room so soft edges and shadows aren't
 * shaved. Null when there is nothing to trim.
 *
 * The background is whatever sits just inside the top-left corner —
 * transparent, white, or a flat colour. A 1% band round the border is
 * ignored, so a sliver left by a screenshot doesn't stretch the box to
 * the edge; content reaching into that band snaps the box to the edge.
 */
export function findContentRect(data: Uint8ClampedArray, w: number, h: number): Rect | null {
  const m = Math.max(1, Math.round(Math.min(w, h) * 0.01));
  if (w <= 2 * m || h <= 2 * m) return null;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const bg = at(m, m);
  const clearBg = data[bg + 3] < 16;
  const isContent = (i: number) => {
    if (data[i + 3] < 16) return false;
    if (clearBg) return true;
    const d = Math.abs(data[i] - data[bg]) + Math.abs(data[i + 1] - data[bg + 1]) + Math.abs(data[i + 2] - data[bg + 2]);
    return d > 48;
  };

  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = m; y < h - m; y++) {
    for (let x = m; x < w - m; x++) {
      if (!isContent(at(x, y))) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return null;

  const pad = Math.round(Math.max(x2 - x1, y2 - y1) * 0.02);
  const left   = x1 <= m ? 0 : Math.max(0, x1 - pad);
  const top    = y1 <= m ? 0 : Math.max(0, y1 - pad);
  const right  = x2 >= w - m - 1 ? w : Math.min(w, x2 + 1 + pad);
  const bottom = y2 >= h - m - 1 ? h : Math.min(h, y2 + 1 + pad);
  // Hardly any margin — the file is already cropped.
  if ((right - left) * (bottom - top) > w * h * 0.95) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
