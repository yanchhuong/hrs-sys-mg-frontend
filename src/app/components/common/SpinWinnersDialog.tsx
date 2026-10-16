import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trophy, Loader2, Search, Phone, Download, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import * as shopApi from '../../api/shop';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * V359 — "Manage winners" for the public shop's Spin & Win.
 *
 *   • Tallies over every winner: issued, open, redeemed, left a contact.
 *   • One filter row: status (All / Open / Used) + search over code,
 *     name and phone. Server-paged, 10 a page, newest first.
 *   • Each winner: code, prize, the name + phone they left (tap to call),
 *     when they won, and Redeem (confirmed — it can't be undone).
 *   • Export CSV of the current filter, for follow-up calls / marketing.
 */

const PAGE_SIZE = 10;
const SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function SpinWinnersDialog({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A coupon was redeemed here — the caller refreshes its own summary. */
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<shopApi.WinnerStatus>('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<shopApi.WinnersPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);

  // Search waits for a pause in typing, and starts again from page 1.
  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(q.trim()); setPage(0); }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    shopApi.listSpinWinners({ status, q: query, page, size: PAGE_SIZE })
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) toast.error(e instanceof Error ? e.message : 'Failed to load winners'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, status, query, page, reload]);

  const redeem = async (c: shopApi.SpinCoupon) => {
    const ok = await confirm({
      title: `Redeem ${c.code}?`,
      message: `Give ${c.winnerName ?? 'the customer'} their prize: ${c.label}. A coupon can only be redeemed once.`,
      confirmLabel: 'Redeem',
    });
    if (!ok) return;
    setBusyCode(c.code);
    try {
      const done = await shopApi.redeemSpinCoupon(c.code);
      toast.success(`${done.code} redeemed — ${done.label}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redeem failed');
    } finally {
      setBusyCode(null);
      setReload(n => n + 1);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: shopApi.SpinCoupon[] = [];
      for (let p = 0; p < 50; p++) {
        const d = await shopApi.listSpinWinners({ status, q: query, page: p, size: 100 });
        rows.push(...d.items);
        if (rows.length >= d.total || d.items.length === 0) break;
      }
      const cell = (v: string | null | undefined) => {
        const s = v ?? '';
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        ['Code', 'Prize', 'Name', 'Phone', 'Won at', 'Status', 'Redeemed at', 'Redeemed by'].join(','),
        ...rows.map(c => [
          c.code, c.label, c.winnerName, c.winnerPhone,
          new Date(c.spunAt).toISOString(),
          c.redeemedAt ? 'Used' : 'Open',
          c.redeemedAt ? new Date(c.redeemedAt).toISOString() : '',
          c.redeemedByName,
        ].map(cell).join(',')),
      ];
      // BOM so Excel reads Khmer names as UTF-8.
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spin-winners-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} winner${rows.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const filtered = status !== 'all' || q.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-pink-600" />
            Spin &amp; Win winners
          </DialogTitle>
          <div className="text-xs text-gray-500 mt-1">
            Everyone who won a coupon, with the name and phone they left. Redeem a coupon when the customer claims it at the counter.
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Tallies over all winners */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Winners', value: s?.issued, cls: 'text-gray-900' },
              { label: 'Open', value: s?.open, cls: 'text-green-700' },
              { label: 'Redeemed', value: s?.redeemed, cls: 'text-gray-500' },
              { label: 'Left contact', value: s?.withContact, cls: 'text-blue-700' },
            ].map(t => (
              <div key={t.label} className="rounded-md border bg-white px-3 py-2">
                <div className="text-[11px] text-gray-500">{t.label}</div>
                <div className={`text-lg font-semibold tabular-nums ${t.cls}`}>{t.value ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Filter row — one line, scrolls sideways when narrow */}
          <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x [&>*]:shrink-0">
            <select
              value={status}
              onChange={e => { setStatus(e.target.value as shopApi.WinnerStatus); setPage(0); }}
              className={SELECT_CLS}
              aria-label="Filter winners by status"
            >
              <option value="all">All winners</option>
              <option value="open">Open</option>
              <option value="redeemed">Used</option>
            </select>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Code, name or phone"
                className="h-9 pl-8 text-sm"
                aria-label="Search winners"
              />
            </div>
            {filtered && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setStatus('all'); setQ(''); setPage(0); }}>
                Clear
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={exporting || total === 0}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Export CSV
            </Button>
          </div>

          {/* List */}
          {loading && !data ? (
            <div className="text-sm text-gray-500 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : total === 0 ? (
            <div className="text-sm text-gray-500 text-center py-10">
              {filtered ? 'No winners match this filter.' : 'No winners yet. Coupons appear here as soon as customers win.'}
            </div>
          ) : (
            <div className={`rounded-md border divide-y ${loading ? 'opacity-60' : ''}`}>
              <div className="hidden sm:grid grid-cols-[112px_1fr_1.3fr_104px_104px] gap-3 px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 bg-gray-50/70">
                <span>Code</span><span>Prize</span><span>Winner</span><span>Won</span><span className="text-right">Status</span>
              </div>
              {data!.items.map(c => (
                <div key={c.code} className="grid grid-cols-[1fr_auto] sm:grid-cols-[112px_1fr_1.3fr_104px_104px] gap-x-3 gap-y-1 px-3 py-2.5 items-center text-sm">
                  <span className="font-mono font-semibold text-gray-800">{c.code}</span>
                  <span className="hidden sm:block text-gray-700 truncate">{c.label}</span>
                  {/* Phone: code + status on the first line, then the winner, then the date. */}
                  <div className="col-span-2 sm:col-span-1 min-w-0 order-3 sm:order-none">
                    <div className="sm:hidden text-xs text-pink-700 font-medium">{c.label}</div>
                    {c.winnerName || c.winnerPhone ? (
                      <>
                        <div className="truncate text-gray-900">{c.winnerName}</div>
                        {c.winnerPhone && (
                          <a href={`tel:${c.winnerPhone}`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline tabular-nums">
                            <Phone className="h-3 w-3" /> {c.winnerPhone}
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">No contact left</span>
                    )}
                  </div>
                  <span className="col-span-2 sm:col-span-1 text-xs text-gray-500 tabular-nums order-4 sm:order-none">{when(c.spunAt)}</span>
                  <div className="flex justify-end order-2 sm:order-none">
                    {c.redeemedAt ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-gray-500"
                        title={`Redeemed${c.redeemedRef ? ' at checkout ' + c.redeemedRef : ''} ${new Date(c.redeemedAt).toLocaleString()}${c.redeemedByName ? ' by ' + c.redeemedByName : ''}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {/* V360 — used at a POS checkout shows its queue number. */}
                        {c.redeemedRef ? 'Used at POS' : 'Used'}
                      </span>
                    ) : (
                      <Button size="sm" className="h-7 text-xs" disabled={busyCode === c.code} onClick={() => redeem(c)}>
                        {busyCode === c.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Redeem'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="tabular-nums">{from}–{to} of {total}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={to >= total || loading} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
