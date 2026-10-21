/**
 * v-qr-crop-box — pick the exact square of an uploaded image to keep
 * as the KHQR.
 *
 * The crop used to happen silently on save. It is right nearly all
 * the time now that it looks for finder patterns rather than ink,
 * but "nearly all" is the problem: when it was wrong the operator
 * had no way to see it and no way to fix it, and a bad QR is only
 * discovered by a customer who cannot pay.
 *
 * So the detector's answer becomes the STARTING position of a box
 * the operator can drag and resize, over the full image, with a
 * live preview of what will be saved. Automatic when it works,
 * correctable when it doesn't.
 *
 * Geometry lives in utils/cropBox.ts — pure, tested, and shared with
 * the mobile sheet so the two behave the same at the edges.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { findQrRect } from '../../utils/qrCrop';
import { clampBox, initialBox, moveBox, resizeBox, snapBox, type Box, type Corner } from '../../utils/cropBox';

/** Longest edge of the on-screen image. The box is tracked in IMAGE
 *  pixels and only scaled for display, so the saved crop is always
 *  full resolution however small the preview is. */
const VIEW_MAX = 460;

interface Props {
  /** The picked image as a data URL. Null closes the dialog. */
  src: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

/** What the pointer grabbed. Kept separate from Drag because Omit
 *  over a union collapses to the keys the members share, which drops
 *  the corner. */
type Grab = { kind: 'move' } | { kind: 'resize'; corner: Corner };

type Drag =
  | { kind: 'move'; startX: number; startY: number; from: Box }
  | { kind: 'resize'; corner: Corner; startX: number; startY: number; from: Box };

export function QrCropDialog({ src, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [detected, setDetected] = useState(false);
  const dragRef = useRef<Drag | null>(null);

  /* Load the image, then ask the detector where the QR is. The
   * detector reads pixels off a canvas, which a data URL allows; a
   * failure here is not fatal, it just means the box starts centred
   * instead of on the code. */
  useEffect(() => {
    if (!src) { setImg(null); setBox(null); return; }
    let live = true;
    const el = new Image();
    el.onload = () => {
      if (!live) return;
      const W = el.naturalWidth, H = el.naturalHeight;
      let found: { x: number; y: number; w: number; h: number } | null = null;
      try {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(el, 0, 0);
          found = findQrRect(ctx.getImageData(0, 0, W, H).data, W, H);
        }
      } catch { /* tainted or no context — start centred */ }
      setImg(el);
      setDetected(!!found);
      setBox(initialBox(found, W, H));
    };
    el.onerror = () => { if (live) { setImg(null); setBox(null); } };
    el.src = src;
    return () => { live = false; };
  }, [src]);

  const W = img?.naturalWidth ?? 0;
  const H = img?.naturalHeight ?? 0;
  // One number converts between screen and image space everywhere.
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
    // Screen delta -> image delta. Without the divide the box runs
    // away from the cursor on any image shown smaller than life.
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    setBox(d.kind === 'move'
      ? moveBox(d.from, dx, dy, W, H)
      : resizeBox(d.from, d.corner, dx, dy, W, H));
  }, [W, H, scale]);

  const endDrag = () => { dragRef.current = null; };

  /** Draw the chosen square at full resolution, on white — a source
   *  with transparency would otherwise print as nothing. */
  const confirm = () => {
    if (!img || !box) return;
    const b = snapBox(clampBox(box, W, H));
    const c = document.createElement('canvas');
    c.width = b.size; c.height = b.size;
    const ctx = c.getContext('2d');
    if (!ctx) { onConfirm(src!); return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, b.size, b.size);
    ctx.drawImage(img, b.x, b.y, b.size, b.size, 0, 0, b.size, b.size);
    onConfirm(c.toDataURL('image/png'));
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
          <DialogTitle>Crop the KHQR</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500 -mt-2">
          {detected
            ? 'The QR was found automatically — drag the box or its corners if it needs adjusting.'
            : 'No QR pattern was found, so the box starts in the middle. Drag it over the code.'}
        </p>

        {img && box && (
          <div className="flex justify-center">
            <div
              className="relative select-none touch-none bg-gray-100"
              style={{ width: viewW, height: viewH }}
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
              {/* Everything outside the box dimmed, so the eye goes to
                  what will actually be saved. Four panels rather than
                  one big shadow: a box-shadow spread large enough to
                  cover the image also bleeds past its edges. */}
              {[
                { left: 0, top: 0, width: viewW, height: Math.max(0, box.y * scale) },
                { left: 0, top: (box.y + box.size) * scale, width: viewW, height: Math.max(0, viewH - (box.y + box.size) * scale) },
                { left: 0, top: box.y * scale, width: Math.max(0, box.x * scale), height: box.size * scale },
                { left: (box.x + box.size) * scale, top: box.y * scale, width: Math.max(0, viewW - (box.x + box.size) * scale), height: box.size * scale },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,0.45)', pointerEvents: 'none', ...s }} />
              ))}

              <div
                style={{
                  position: 'absolute',
                  left: box.x * scale,
                  top: box.y * scale,
                  width: box.size * scale,
                  height: box.size * scale,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                  cursor: 'move',
                }}
                onPointerDown={e => onPointerDown(e, { kind: 'move' })}
              >
                {HANDLES.map(h => (
                  <div
                    key={h.corner}
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
