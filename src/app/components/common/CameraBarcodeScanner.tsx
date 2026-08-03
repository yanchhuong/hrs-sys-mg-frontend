import { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library';
import { X, Camera, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';

/**
 * Camera-based barcode scan dialog for the POS search + any doc
 * form's line-items row. Uses @zxing/library's
 * BrowserMultiFormatReader which handles CODE_128 / EAN_13 / UPC_A /
 * QR + friends — the codes we typically see printed on retail goods
 * plus generated internal codes.
 *
 * <p>Enumerates video-input devices and picks the last one (usually
 * the rear camera on phones / tablets, which is what a cashier
 * wants). Users on multi-camera setups (external USB camera on a
 * kiosk) can flip via the "Switch camera" button.</p>
 *
 * <p>Decode fires once per open — the parent {@link Props.onDecoded}
 * handler is expected to close the dialog to prevent duplicate
 * scans. Errors that aren't "no barcode in this frame" (which
 * happens dozens of times per second while the user is aligning
 * the code) are surfaced in the dialog body.</p>
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the decoded barcode text. Parent should perform
   *  its lookup and close the dialog. */
  onDecoded: (code: string) => void;
}

export function CameraBarcodeScanner({ open, onOpenChange, onDecoded }: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Boot the reader on open, tear down on close so the camera light
  // isn't stuck on. Runs whenever open flips OR the selected device
  // changes so "Switch camera" swaps the video stream.
  useEffect(() => {
    if (!open) {
      readerRef.current?.reset();
      readerRef.current = null;
      setError(null);
      return;
    }
    // Narrow the decoder to the 1D + 2D formats real-world items use.
    // Skipping formats we don't need speeds up decode + cuts CPU on
    // low-spec tablets.
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    readerRef.current = reader;

    let cancelled = false;

    (async () => {
      try {
        // Cheap up-front sanity check — no cameras on desktop without
        // a webcam should surface a helpful error rather than opening
        // a permission prompt that resolves to nothing.
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setError('Camera API not available in this browser. iOS + Android need HTTPS.');
          return;
        }

        // decodeFromConstraints triggers the browser permission prompt
        // via getUserMedia, so the user is asked once and the stream
        // starts as soon as they allow. Rear camera preferred via
        // facingMode when a deviceId isn't explicitly chosen. If the
        // rear preference throws OverconstrainedError (Macs with only
        // a front camera, some strict Safari builds), retry without
        // any facingMode so the browser hands back whatever it's got.
        // Radix Dialog portals its content on the same tick this
        // effect runs, so the <video> ref may not be populated on the
        // very first read. Wait up to ~500 ms for it to appear before
        // giving up — the alternative is a blank preview because
        // decodeFromConstraints bails silently when it can't attach.
        let video = videoRef.current;
        for (let attempts = 0; !video && attempts < 20; attempts++) {
          await new Promise(r => setTimeout(r, 25));
          if (cancelled) return;
          video = videoRef.current;
        }
        if (!video) {
          setError('Video element failed to mount. Close + reopen the scanner.');
          return;
        }
        const startDecode = async (constraints: MediaStreamConstraints) => {
          await reader.decodeFromConstraints(constraints, video!, (result, err) => {
            if (result) {
              onDecoded(result.getText());
            } else if (err && !(err instanceof NotFoundException)) {
              // NotFoundException fires every frame that doesn't
              // contain a barcode — expected while aligning. Swallow.
              // eslint-disable-next-line no-console
              console.warn('[CameraBarcodeScanner] decode error', err);
            }
          });
          // Belt-and-braces: some browsers (Safari + macOS) don't
          // auto-play the attached MediaStream reliably. Explicit
          // play() forces the preview to light up.
          try { await video!.play(); } catch { /* autoplay policy — ignore */ }
        };

        try {
          const primary: MediaStreamConstraints = deviceId
            ? { video: { deviceId: { exact: deviceId } } }
            : { video: { facingMode: { ideal: 'environment' } } };
          await startDecode(primary);
        } catch (e) {
          const name = (e as { name?: string })?.name;
          if (name === 'OverconstrainedError' || name === 'NotFoundError') {
            // Fall through to a plain "any camera" request so laptops
            // with only a front camera still work.
            await startDecode({ video: true });
          } else {
            throw e;
          }
        }

        // After the stream is live the permission prompt has been
        // resolved, so labels + deviceIds are now populated. Pull the
        // device list at that point so "Switch camera" has real data.
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          if (cancelled) return;
          const videoInputs = list.filter(d => d.kind === 'videoinput');
          setDevices(videoInputs);
          if (!deviceId) {
            // Pin the deviceId to whatever the stream ended up on so
            // switch-camera can compute the "next" device relative to
            // the one currently rendering.
            const track = video.srcObject instanceof MediaStream
              ? video.srcObject.getVideoTracks()[0]
              : null;
            const currentId = track?.getSettings().deviceId ?? null;
            if (currentId) setDeviceId(currentId);
          }
        } catch { /* device enum failure is non-fatal */ }
      } catch (e) {
        if (cancelled) return;
        const raw = e instanceof Error ? e.message : String(e);
        // NotAllowedError = user denied permission; NotFoundError =
        // no camera hardware; NotReadableError = OS-level lock. Give
        // targeted copy for each.
        const name = (e as { name?: string })?.name;
        if (name === 'NotAllowedError') {
          setError('Camera access denied. Grant permission in your browser settings.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('No camera found on this device.');
        } else if (name === 'NotReadableError') {
          setError('Camera is in use by another app. Close it and try again.');
        } else {
          setError(raw);
        }
      }
    })();

    return () => {
      cancelled = true;
      reader.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  const switchCamera = () => {
    if (devices.length < 2) return;
    const idx = devices.findIndex(d => d.deviceId === deviceId);
    const next = devices[(idx + 1) % devices.length];
    setDeviceId(next.deviceId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-blue-600" />
            Scan barcode
          </DialogTitle>
          <DialogDescription className="sr-only">
            Point the camera at a barcode to auto-fill the field.
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {/* Alignment reticle — subtle rounded rectangle centered on
              the video so the operator knows roughly where to hold
              the code. Kept semi-transparent so it doesn't fight the
              live preview. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="border-2 border-white/60 rounded-lg w-4/5 h-24" />
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              {error}
              <div className="text-red-600/80 mt-0.5">
                Grant camera access in your browser settings, or use a physical scanner instead.
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            Hold the barcode inside the box — decoding happens automatically.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {devices.length > 1 && (
              <Button variant="outline" size="sm" onClick={switchCamera}>
                Switch camera
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
