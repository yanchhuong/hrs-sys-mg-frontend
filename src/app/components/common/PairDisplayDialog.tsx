import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Copy, Loader2, MonitorPlay, Unlink } from 'lucide-react';
import * as posDisplayApi from '../../api/posDisplay';
import { POS_DISPLAY_PATH } from '../../utils/posCustomerDisplay';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * "Pair customer tablet" dialog. Launched from the POS header.
 *
 * <p>Mints a 5-char code on first open, renders a QR encoding
 * {@code {origin}/pos-display/{code}} the tablet's built-in camera
 * app can open directly, and exposes copy / unpair actions.</p>
 *
 * <p>State is in-memory on the server (no migration); the parent
 * POS component reads {@code currentCode} via {@code onPaired} so
 * it can mirror cart-state pushes over SSE in addition to the
 * same-browser BroadcastChannel.</p>
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Already-paired code (if the cashier reopens the dialog). The
   *  dialog won't re-mint if this is provided — it'll just re-render
   *  the existing QR + URL. */
  currentCode: string | null;
  /** Called when a fresh code is minted. Parent stores it and
   *  starts mirroring cart pushes to /api/v1/pos/display/{code}/state. */
  onPaired: (code: string) => void;
  /** Called when the cashier explicitly unpairs. Parent clears its
   *  paired-code state so future cart updates stay local-only. */
  onUnpaired: () => void;
}

export function PairDisplayDialog({ open, onOpenChange, currentCode, onPaired, onUnpaired }: Props) {
  const confirm = useConfirm();
  const [minting, setMinting] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // URL the QR encodes — same origin so the same SSL cert serves the
  // /pos-display route. Browsers open this directly from the camera
  // scan, no app install required.
  const composedUrl = currentCode
    ? `${window.location.origin}${POS_DISPLAY_PATH}/${currentCode}`
    : '';

  // Mint on first open when we don't already have a code. We don't
  // re-mint on every reopen: rotating without reason would orphan the
  // tablet that's already happily showing the cart.
  useEffect(() => {
    if (!open || currentCode || minting) return;
    let cancelled = false;
    (async () => {
      setMinting(true);
      try {
        const r = await posDisplayApi.pair();
        if (!cancelled) onPaired(r.code);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to mint pairing code');
      } finally {
        if (!cancelled) setMinting(false);
      }
    })();
    return () => { cancelled = true; };
    // onPaired is a parent setter — including it would re-run on every
    // parent render; we want this effect tied only to dialog open +
    // code presence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentCode]);

  // Paint the QR whenever the URL becomes available. Canvas (not <img>)
  // so it stays crisp if the cashier takes a screenshot to print and
  // post by the second tablet's docking station.
  useEffect(() => {
    if (!open || !composedUrl || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, composedUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => { /* dialog still shows the URL text — non-fatal */ });
  }, [open, composedUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(composedUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Clipboard not available — long-press to copy');
    }
  };

  const unpair = async () => {
    if (!currentCode || unpairing) return;
    if (!(await confirm({
      title: 'Unpair this tablet?',
      message: 'The paired Display will go blank until you pair again.',
      variant: 'destructive',
      confirmLabel: 'Unpair',
    }))) return;
    setUnpairing(true);
    try {
      await posDisplayApi.evict(currentCode);
      onUnpaired();
      toast.success('Tablet unpaired');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unpair failed');
    } finally {
      setUnpairing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-blue-600" />
            Pair
          </DialogTitle>
          <DialogDescription>
            Open the camera app on the second tablet and scan this QR. It
            opens the customer-facing Display tuned to this POS — the cart
            updates live as you ring up items.
          </DialogDescription>
        </DialogHeader>

        {minting ? (
          <div className="py-10 flex items-center gap-2 justify-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Minting code…
          </div>
        ) : currentCode ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 flex flex-col items-center gap-2">
              <canvas ref={canvasRef} className="rounded" />
              <div className="text-center">
                <div className="text-xs uppercase text-gray-500 tracking-wide">Pairing code</div>
                <div className="text-2xl tabular-nums font-bold tracking-widest text-slate-900">
                  {currentCode}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-600">Display URL</label>
              <div className="flex gap-1.5">
                <Input value={composedUrl} readOnly className="tabular-nums text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={copy} title="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">
                Tip: the same URL works on a kiosk PC, monitor with a Chromebox, or any
                second screen running a browser.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline" size="sm"
            onClick={unpair}
            disabled={!currentCode || unpairing}
          >
            {unpairing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Unlink className="h-3.5 w-3.5 mr-1.5" />}
            Unpair
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
