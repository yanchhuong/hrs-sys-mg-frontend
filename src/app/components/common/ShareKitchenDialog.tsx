import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Copy, ExternalLink, RefreshCw, Loader2, ChefHat, Info } from 'lucide-react';
import { Switch } from '../ui/switch';
import * as kitchenApi from '../../api/kitchen';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * V306 — sibling of ShareShopDialog. Surfaces the tenant's 8-char
 * kitchen code + QR + enable toggle + rotate action. The code powers
 * the anonymous /kitchen/{code} KDS board that a line cook opens on
 * their tablet.
 *
 * <p>Kitchen carries WRITE privilege (code holder can advance any
 * order's fulfillmentStatus), so the dialog's copy nudges the
 * operator to keep the URL off shared surfaces and rotate on any
 * suspicion of leak. The 8-char code (vs shop's 5) already raises
 * the guessing bar, but the human factor still matters.</p>
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ShareKitchenDialog({ open, onOpenChange }: Props) {
  const confirm = useConfirm();
  const [info, setInfo] = useState<kitchenApi.KitchenLinkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [enabledBusy, setEnabledBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compose the customer-facing URL. When the BE returned an
  // absolute URL (PUBLIC_BASE_URL set) we use it; else we wrap the
  // relative path with the browser origin so the QR resolves
  // wherever the operator opened the app.
  const composedUrl = info
    ? (info.url.startsWith('http') ? info.url : `${window.location.origin}${info.url}`)
    : '';

  // Fetch on every open — the previous session may have rotated
  // the code without triggering a refresh here.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await kitchenApi.getMyKitchenLink();
        if (!cancelled) setInfo(r);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load kitchen link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Repaint the QR on canvas whenever the URL changes. Canvas beats
  // a data-URL <img> for print quality — the tenant may print the
  // QR and pin it near the kitchen tablet as a bookmark.
  useEffect(() => {
    if (!open || !composedUrl || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, composedUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => { /* silent — URL + code still visible */ });
  }, [open, composedUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(composedUrl);
      toast.success('Kitchen link copied');
    } catch {
      toast.error('Clipboard not available — long-press to copy');
    }
  };

  const rotate = async () => {
    if (rotating) return;
    if (!(await confirm({
      title: 'Rotate the kitchen code?',
      message: "The current URL will stop working immediately. Any tablet or bookmark pointing at it will need the new code. Use this if you suspect the URL leaked.",
      variant: 'destructive',
      confirmLabel: 'Rotate',
    }))) return;
    setRotating(true);
    try {
      setInfo(await kitchenApi.rotateKitchenLink());
      toast.success('New kitchen code minted');
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
            <ChefHat className="h-4 w-4 text-orange-600" />
            Share to Kitchen
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                  Open this URL on a kitchen tablet to see the live KDS board.
                  The tablet can advance orders through Start Cooking → Mark Ready
                  → Clear from Board without signing in. Rotate the code if the
                  URL ever leaks.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center gap-2 justify-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : info ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 flex flex-col items-center gap-2">
              <canvas ref={canvasRef} className="rounded" />
              <div className="text-center">
                <div className="text-xs uppercase text-gray-500 tracking-wide">Kitchen code</div>
                <div className="text-2xl tabular-nums font-bold tracking-widest text-slate-900">
                  {info.code}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-600">Kitchen link</label>
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
                  This kitchen link is disabled. The URL will 404 until you re-enable it.
                </p>
              )}
            </div>

            {/* Enable / disable toggle. Off keeps the code reserved so
                turning back on brings the same URL — friendly for
                "kitchen closed" hours. */}
            <div className="rounded-md border bg-white p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 inline-flex items-center gap-1.5">
                  <ChefHat className="h-3.5 w-3.5 text-orange-600" />
                  Kitchen board available
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {info.enabled
                    ? 'Kitchen tablets can see and advance orders.'
                    : 'The public URL is off — turn back on when the kitchen re-opens.'}
                </div>
              </div>
              <Switch
                checked={info.enabled}
                disabled={enabledBusy || rotating || loading}
                onCheckedChange={async (next) => {
                  if (!info) return;
                  const prev = info.enabled;
                  setInfo({ ...info, enabled: next });
                  setEnabledBusy(true);
                  try {
                    setInfo(await kitchenApi.setKitchenLinkEnabled(next));
                    toast.success(next ? 'Kitchen board on' : 'Kitchen board off');
                  } catch (e) {
                    setInfo({ ...info, enabled: prev });
                    toast.error(e instanceof Error ? e.message : 'Failed to update');
                  } finally {
                    setEnabledBusy(false);
                  }
                }}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={rotate} disabled={rotating || loading || !info}>
            {rotating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Rotate code
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
