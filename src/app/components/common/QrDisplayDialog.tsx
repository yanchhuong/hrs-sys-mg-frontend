import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Loader2, Printer, RefreshCw, MapPin } from 'lucide-react';
import * as qrApi from '../../api/attendanceQr';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Office whose daily QR we should render. Required when {@code open}
   *  is true; the dialog clears its state when closed so a stale token
   *  doesn't flash on the next open. */
  officeId: string | null;
}

/**
 * Single-office "today's QR" popup — the lightweight cousin of the
 * standalone {@link QrDisplay} page. Used from the Offices table's
 * "QR" column so admin can preview / print a specific office's QR
 * without leaving the Manage Offices popup.
 *
 * <p>Print here calls {@code window.print()} just like the full page;
 * the dialog body is the only thing visible on screen at that
 * moment, so the printout naturally crops to the QR card. No special
 * print-only CSS needed.</p>
 */
export function QrDisplayDialog({ open, onOpenChange, officeId }: Props) {
  const [token, setToken] = useState<qrApi.TodayToken | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rebuild the scan URL against the browser's actual origin so a QR
  // printed from staging / prod doesn't encode the backend-configured
  // QR_SCAN_BASE_URL default (which is localhost in most deployments).
  const buildScanUrl = (t: qrApi.TodayToken) => ({
    ...t,
    scanUrl: `${window.location.origin}/scan?token=${encodeURIComponent(t.token)}`,
  });

  // Fetch the token when the dialog opens / office changes. Drawing
  // is split into a separate effect below so the canvas can mount
  // before we draw to it — the previous combined version called
  // QRCode.toCanvas while the canvas was still gated behind the
  // !loading branch (canvasRef.current was null, draw silently
  // no-op'd → empty box bug).
  useEffect(() => {
    if (!open || !officeId) { setToken(null); return; }
    let cancelled = false;
    setLoading(true);
    qrApi.getToday(officeId)
      .then(t => { if (!cancelled) setToken(buildScanUrl(t)); })
      .catch(e => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to issue today\'s QR');
          onOpenChange(false);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, officeId, onOpenChange]);

  // Draw whenever a token lands AND the canvas is in the DOM. The
  // canvas is now always rendered (with a spinner overlay during
  // fetch) so canvasRef.current resolves on the first paint after
  // setToken commits.
  useEffect(() => {
    if (!token || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, token.scanUrl, {
      width: 384,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }, [token]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            {token?.officeName ?? 'Today\'s QR'}
          </DialogTitle>
          <DialogDescription>
            Print this sheet or display it on a monitor at the office
            entrance. Employees scan with their phone camera to check in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {/* Canvas is always rendered (under the spinner overlay if
              still fetching) so the draw effect above can find the
              ref the moment the token lands. The fixed inline width
              + height reserves space so the dialog doesn't reflow
              when loading transitions. */}
          <div className="relative" style={{ width: 384, height: 384 }}>
            <canvas
              ref={canvasRef}
              className="rounded-md shadow-sm border bg-white"
              style={{ width: 384, height: 384 }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/85 rounded-md">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
          </div>
          {token && (
            <>
              <p className="text-[11px] text-gray-400 text-center">
                Valid for {token.tokenDate} · within {token.radiusMeters}m of this office
              </p>
              <p className="text-[10px] tabular-nums text-gray-300 break-all max-w-xs text-center">
                {token.scanUrl}
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Refresh = re-fetch only. The draw effect picks up
              // the new token via state, no inline canvas dance
              // needed here.
              if (!officeId) return;
              setLoading(true);
              qrApi.getToday(officeId)
                .then(t => setToken(buildScanUrl(t)))
                .catch(e => toast.error(e instanceof Error ? e.message : 'Refresh failed'))
                .finally(() => setLoading(false));
            }}
            disabled={loading || !officeId}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={() => window.print()} disabled={!token}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
