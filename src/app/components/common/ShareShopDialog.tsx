import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Copy, ExternalLink, RefreshCw, Loader2, Share2, Info } from 'lucide-react';
import * as shopApi from '../../api/shop';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * "Share menu" popup launched from the POS header. Surfaces the
 * tenant's 5-char public-shop code, the resolved /shop/{code} URL,
 * a QR for printing, plus rotate / copy / open actions.
 *
 * The first time it opens it minted the code via {@link shopApi.getMyShopLink}
 * (idempotent on the server). The QR is rendered client-side so we
 * don't need a per-tenant QR-as-PNG endpoint.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ShareShopDialog({ open, onOpenChange }: Props) {
  const confirm = useConfirm();
  const [info, setInfo] = useState<shopApi.ShopLinkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compose the full URL the customer will hit. The API returns either
  // an absolute URL (when PUBLIC_BASE_URL is set on the server) or a
  // relative /shop/{code} we wrap with the browser origin so the QR
  // works whether or not the deploy supplied a base URL.
  const composedUrl = info
    ? (info.url.startsWith('http') ? info.url : `${window.location.origin}${info.url}`)
    : '';

  // First-load mint. Re-fetch on every open in case the previous
  // session rotated the code — keeps the dialog truthy without a
  // page reload.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await shopApi.getMyShopLink();
        if (!cancelled) setInfo(r);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load shop link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Repaint the QR whenever the composed URL changes. Canvas-first
  // (instead of a data-URL <img>) so the QR stays crisp at print
  // resolutions when the user prints the dialog directly.
  useEffect(() => {
    if (!open || !composedUrl || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, composedUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => {
      // Don't surface a toast — the dialog still shows the URL + code
      // so the operator can hand-type if the canvas paint failed.
    });
  }, [open, composedUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(composedUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Clipboard not available — long-press to copy');
    }
  };

  const rotate = async () => {
    if (rotating) return;
    if (!(await confirm({
      title: 'Rotate the shop code?',
      message: 'The current QR / link will stop working. Printed posters need to be reissued.',
      variant: 'destructive',
      confirmLabel: 'Rotate',
    }))) return;
    setRotating(true);
    try {
      setInfo(await shopApi.rotateShopLink());
      toast.success('New code minted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setRotating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-blue-600" />
            Share your menu
            {/* Moved from a full DialogDescription paragraph into a
                hover-info tooltip so the dialog header stays compact.
                Same copy — surfaces on hover / tap-focus over the (i) */}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                  Customers can scan this QR or visit the link to view your menu.
                  Browse-only — no online ordering on this code.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center gap-2 justify-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : info ? (
          <div className="space-y-4">
            {/* QR card */}
            <div className="rounded-md border bg-white p-4 flex flex-col items-center gap-2">
              <canvas ref={canvasRef} className="rounded" />
              <div className="text-center">
                <div className="text-xs uppercase text-gray-500 tracking-wide">Shop code</div>
                <div className="text-2xl tabular-nums font-bold tracking-widest text-slate-900">
                  {info.code}
                </div>
              </div>
            </div>

            {/* URL row */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-600">Public link</label>
              <div className="flex gap-1.5">
                <Input value={composedUrl} readOnly className="tabular-nums text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={copy} title="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button" variant="outline" size="sm" title="Open"
                  onClick={() => window.open(composedUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!info.enabled && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This shop link is disabled. The public page will 404 until you re-enable it.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={rotate} disabled={rotating || loading || !info}>
            {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Rotate code
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
