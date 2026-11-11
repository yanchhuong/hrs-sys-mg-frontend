import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle, Check, Copy, ExternalLink, Loader2, RefreshCw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { toast } from 'sonner';
import { useConfirm } from '../../context/ConfirmContext';
import * as api from '../../api/publicBooking';
import * as itemsApi from '../../api/paymentPlanItems';

/**
 * Booking page settings (v-booking-public-link) — sibling of
 * ShareShopDialog. Surfaces the tenant's 5-char code as a shareable
 * /booking/{code} link with a QR, the two on/off switches, the banner
 * wording, and which properties the page publishes.
 *
 * <h3>Three sections, no tabs</h3>
 * <p>Link, Page, Properties — in the order someone works through them
 * the first time. Tabs would hide two thirds of a short screen behind
 * a click and make "did I turn it on?" a question you have to go
 * looking for.</p>
 *
 * <h3>No manual ordering</h3>
 * <p>Published properties follow the catalogue's own order. Drag
 * handles would be the fourth interaction in a dialog whose job is
 * "tick what you rent out", and a tenant with four rooms does not
 * need them. The API stores an explicit sort order, so this can grow
 * a reorder later without a migration.</p>
 */

/** Matches the Property form's wording for the same situation — the
 *  tenant may well meet this sentence there first. */
const UNSUPPORTED_NOTE = 'Not on the public booking page yet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareBookingDialog({ open, onOpenChange }: Props) {
  const [info, setInfo]   = useState<api.BookingLinkInfo | null>(null);
  const [items, setItems] = useState<itemsApi.PaymentPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [copied, setCopied]   = useState(false);
  const [headline, setHeadline] = useState('');
  const [tagline, setTagline]   = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confirm = useConfirm();

  /** The API composes this when PUBLIC_BASE_URL is set; otherwise fall
   *  back to this browser's origin so the dialog still shows something
   *  a tenant can actually paste. */
  const url = useMemo(() => {
    if (!info) return '';
    if (info.url) return info.url;
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/booking/${info.code}`;
  }, [info]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [link, catalogue] = await Promise.all([api.getBookingLink(), itemsApi.list()]);
      setInfo(link);
      setItems(catalogue.filter(i => i.active));
      setHeadline(link.headline ?? '');
      setTagline(link.tagline ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the booking page settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, { width: 148, margin: 1 });
  }, [url]);

  /** Every mutation returns the whole link row, so one setter keeps
   *  the dialog in step with the server rather than guessing. */
  const run = async (fn: () => Promise<api.BookingLinkInfo>, ok?: string) => {
    setBusy(true);
    try {
      setInfo(await fn());
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not save.');
      void load();   // re-read rather than leave the screen lying
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Clipboard not available — long-press to copy');
    }
  };

  const rotate = async () => {
    // Destructive in a way that is invisible afterwards: every shared
    // link and printed QR stops working and nothing says why. Worth a
    // confirm even though nothing is deleted. Through the app's own
    // confirm, as ShareShopDialog does for the same action — a raw
    // window.confirm looks nothing like the rest of the app.
    if (!(await confirm({
      title: 'Create a new booking link?',
      message: 'The current link stops working immediately, including any QR '
             + 'you have printed or sent to guests.',
      variant: 'destructive',
      confirmLabel: 'New link',
    }))) return;
    await run(api.rotateBookingLink, 'New link created.');
  };

  const published = useMemo(() => new Set(info?.publishedItemIds ?? []), [info]);
  const unsupported = useMemo(() => new Set(info?.unsupportedItemIds ?? []), [info]);

  const toggleItem = (id: string, on: boolean) => {
    const next = on
      ? [...(info?.publishedItemIds ?? []), id]
      : (info?.publishedItemIds ?? []).filter(x => x !== id);
    void run(() => api.publishBookingProperties(next));
  };

  const saveBranding = () => {
    if ((info?.headline ?? '') === headline && (info?.tagline ?? '') === tagline) return;
    void run(() => api.setBookingLinkBranding({ headline, tagline }), 'Banner saved.');
  };

  const liveCount = (info?.publishedItemIds ?? []).filter(id => !unsupported.has(id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Booking page</DialogTitle>
          <DialogDescription>
            Share this link and guests can check your dates and ask to book.
            Every request arrives as a draft for you to confirm.
          </DialogDescription>
        </DialogHeader>

        {loading || !info ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* 1 — the link */}
            <section className="flex gap-4">
              <div className="shrink-0 rounded-lg border border-gray-200 p-1.5">
                <canvas ref={canvasRef} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Your link
                </div>
                <div className="truncate rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-gray-700">
                  {url}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={copy} disabled={busy}>
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /><span className="ml-1.5">Open</span>
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={rotate} disabled={busy}
                          className="text-gray-500">
                    <RefreshCw className="h-3.5 w-3.5" /><span className="ml-1.5">New link</span>
                  </Button>
                </div>
              </div>
            </section>

            {/* 2 — the page */}
            <section className="space-y-3 border-t border-gray-100 pt-4">
              <SwitchRow
                label="Page is live"
                hint="Off: the link shows nothing at all."
                checked={info.enabled} disabled={busy}
                onChange={v => void run(() => api.setBookingLinkEnabled(v))}
              />
              <SwitchRow
                label="Accept requests"
                hint="Off: guests can see what's free, but can't ask to book."
                checked={info.requestsEnabled} disabled={busy || !info.enabled}
                onChange={v => void run(() => api.setBookingRequestsEnabled(v))}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <Labelled label="Headline">
                  <Input value={headline} onChange={e => setHeadline(e.target.value)}
                         onBlur={saveBranding} maxLength={160} disabled={busy}
                         placeholder="Book Your Stay" className="h-9 text-sm" />
                </Labelled>
                <Labelled label="Tagline">
                  <Input value={tagline} onChange={e => setTagline(e.target.value)}
                         onBlur={saveBranding} maxLength={240} disabled={busy}
                         placeholder="Comfort. Luxury." className="h-9 text-sm" />
                </Labelled>
              </div>
              <p className="text-xs text-gray-500">
                Leave either blank to use your company name.
              </p>
            </section>

            {/* 3 — what's on it */}
            <section className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Properties on the page
                </div>
                <span className="text-xs text-gray-500">
                  {liveCount} showing
                </span>
              </div>

              {items.length === 0 ? (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-gray-500">
                  No properties yet. Add one under Receivables → Property, then tick it here.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                  {items.map(it => {
                    const on   = published.has(it.id);
                    const held = on && unsupported.has(it.id);
                    const units = (it.options?.length ?? 0)
                      + (it.optionGroups ?? []).reduce((s, g) => s + (g.options?.length ?? 0), 0);
                    return (
                      <li key={it.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900">{it.name}</div>
                          <div className="truncate text-xs text-gray-500">
                            {units} {units === 1 ? 'unit' : 'units'}
                            {it.priceUnit && it.priceUnit !== 'night' && <> · per {it.priceUnit}</>}
                          </div>
                          {/* Says why rather than letting a ticked
                              property silently never appear, which
                              reads as a bug. */}
                          {held && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                              <AlertCircle className="h-3 w-3 shrink-0" /> {UNSUPPORTED_NOTE}
                            </div>
                          )}
                        </div>
                        <Switch
                          checked={on} disabled={busy}
                          onCheckedChange={v => toggleItem(it.id, v)}
                          aria-label={`Show ${it.name} on the booking page`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {busy && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow(
  { label, hint, checked, disabled, onChange }:
  { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void },
) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}
