/**
 * Crop the company logo — the logo's counterpart of QrCropDialog.
 *
 * A logo file usually carries a wide plain margin, and the print
 * templates size the whole image: a mark with padding round it came
 * out smaller than the template's logo size said. The box starts on
 * the logo itself (findContentRect trims the margin), and the operator
 * drags it or its corners to adjust. Unlike the KHQR square it is any
 * shape, because a wordmark is wide.
 *
 * Geometry lives in utils/rectCrop.ts — pure, and mirrored by the
 * mobile sheet so the two behave the same at the edges.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { clampRect, findContentRect, moveRect, resizeRect, snapRect, type Corner, type Rect } from '../../utils/rectCrop';

/** Longest edge of the on-screen image. The box is tracked in IMAGE
 *  pixels and only scaled for display. */
const VIEW_MAX = 460;

/** Longest edge of the saved logo. A4 prints it at most ~180px wide,
 *  captured at 2–3x, so 800 stays sharp without bloating the settings
 *  row every page load carries. */
const SAVE_MAX = 800;

/** Any pixel not fully opaque. Throws on a tainted canvas, like toDataURL. */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

interface Props {
  /** The logo as a data URL (or a URL that allows CORS). Null closes the dialog. */
  src: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

type Grab = { kind: 'move' } | { kind: 'resize'; corner: Corner };

type Drag =
  | { kind: 'move'; startX: number; startY: number; from: Rect }
  | { kind: 'resize'; corner: Corner; startX: number; startY: number; from: Rect };

export function LogoCropDialog({ src, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);

  /* Load the image, then find the logo's edges. Reading pixels needs
   * an untainted canvas — a data URL, or a linked image served with
   * CORS; otherwise the box starts on the whole image. */
  useEffect(() => {
    setError(null);
    if (!src) { setImg(null); setBox(null); return; }
    let live = true;
    const el = new Image();
    if (!src.startsWith('data:')) el.crossOrigin = 'anonymous';
    el.onload = () => {
      if (!live) return;
      const W = el.naturalWidth, H = el.naturalHeight;
      let found: Rect | null = null;
      try {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(el, 0, 0);
          found = findContentRect(ctx.getImageData(0, 0, W, H).data, W, H);
        }
      } catch { /* tainted — start on the whole image */ }
      setImg(el);
      setTrimmed(!!found);
      setBox(found ?? { x: 0, y: 0, w: W, h: H });
    };
    el.onerror = () => {
      if (!live) return;
      setImg(null); setBox(null);
      setError('This logo could not be loaded for cropping. Upload the image file instead.');
    };
    el.src = src;
    return () => { live = false; };
  }, [src]);

  const W = img?.naturalWidth ?? 0;
  const H = img?.naturalHeight ?? 0;
  const scale = W && H ? Math.min(VIEW_MAX / W, VIEW_MAX / H, 1) : 1;
  const viewW = Math.round(W * scale);
  const viewH = Math.round(H * scale);

  const onPointerDown = (e: React.PointerEvent, g: Grab) => {
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const at = { startX: e.clientX, startY: e.clientY, from: box };
    dragRef.current = g.kind === 'move'
      ? { kind: 'move', ...at }
      : { kind: 'resize', corner: g.corner, ...at };
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !W || !H) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    setBox(d.kind === 'move'
      ? moveRect(d.from, dx, dy, W, H)
      : resizeRect(d.from, d.corner, dx, dy, W, H));
  }, [W, H, scale]);

  const endDrag = () => { dragRef.current = null; };

  /** Draw the kept part, scaled down to SAVE_MAX. Saved as JPEG — a
   *  fraction of the size of a PNG for a photographic logo — unless it
   *  has see-through parts, which only PNG keeps. */
  const confirm = () => {
    if (!img || !box) return;
    const b = snapRect(clampRect(box, W, H));
    const k = Math.min(1, SAVE_MAX / Math.max(b.w, b.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * k));
    c.height = Math.max(1, Math.round(b.h * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
    try {
      onConfirm(hasTransparency(ctx, c.width, c.height) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92));
    } catch {
      setError('This logo is linked from another site and cannot be cropped here. Upload the image file instead.');
    }
  };

  const HANDLES: { corner: Corner; css: React.CSSProperties }[] = [
    { corner: 'nw', css: { left: -7, top: -7, cursor: 'nwse-resize' } },
    { corner: 'ne', css: { right: -7, top: -7, cursor: 'nesw-resize' } },
    { corner: 'sw', css: { left: -7, bottom: -7, cursor: 'nesw-resize' } },
    { corner: 'se', css: { right: -7, bottom: -7, cursor: 'nwse-resize' } },
  ];

  return (
    <Dialog open={!!src} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop the logo</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500 -mt-2">
          {trimmed
            ? 'The empty margin was trimmed — drag the box or its corners if it needs adjusting. The template’s logo size is the size of what you keep.'
            : 'Drag the corners in until the box hugs the logo. The template’s logo size is the size of what you keep.'}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {img && box && (
          <div className="flex justify-center">
            <div
              className="relative select-none touch-none"
              style={{
                width: viewW, height: viewH,
                // Checkerboard, so a transparent logo's edges show.
                background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 16px 16px',
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                src={src!}
                alt=""
                draggable={false}
                style={{ width: viewW, height: viewH, display: 'block' }}
              />
              {[
                { left: 0, top: 0, width: viewW, height: Math.max(0, box.y * scale) },
                { left: 0, top: (box.y + box.h) * scale, width: viewW, height: Math.max(0, viewH - (box.y + box.h) * scale) },
                { left: 0, top: box.y * scale, width: Math.max(0, box.x * scale), height: box.h * scale },
                { left: (box.x + box.w) * scale, top: box.y * scale, width: Math.max(0, viewW - (box.x + box.w) * scale), height: box.h * scale },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,0.45)', pointerEvents: 'none', ...s }} />
              ))}

              <div
                data-crop-box=""
                style={{
                  position: 'absolute',
                  left: box.x * scale,
                  top: box.y * scale,
                  width: box.w * scale,
                  height: box.h * scale,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                  cursor: 'move',
                }}
                onPointerDown={e => onPointerDown(e, { kind: 'move' })}
              >
                {HANDLES.map(h => (
                  <div
                    key={h.corner}
                    data-crop-handle={h.corner}
                    onPointerDown={e => onPointerDown(e, { kind: 'resize', corner: h.corner })}
                    style={{
                      position: 'absolute',
                      width: 14, height: 14,
                      background: '#fff',
                      border: '1px solid rgba(0,0,0,0.5)',
                      borderRadius: 3,
                      ...h.css,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={confirm} disabled={!img || !box}>Save crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
