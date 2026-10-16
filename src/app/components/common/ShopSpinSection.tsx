import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Gift, Plus, Trash2, Loader2, Ticket, CheckCircle2, Search, Trophy, Phone, ChevronRight, Clock, XCircle } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import * as shopApi from '../../api/shop';
import { SpinWinnersDialog } from './SpinWinnersDialog';
import { PRIZE_KINDS, COUPON_DAY_CHOICES, couponDaysLabel, autoLabel, fmtExpiry } from '../../utils/spinPrize';

const kindOf = (s: shopApi.SpinSlice): shopApi.PrizeKind => s.kind ?? (s.prize ? 'gift' : 'none');
const SELECT_CLS = 'h-8 rounded-md border border-input bg-transparent px-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * V358 — "Spin & Win" controls in the Share Shop dialog.
 *
 *   • On/Off switch — shows or hides the wheel on the public shop page.
 *   • Wheel editor  — the slices: label, type (V362: % off, $ off, gift
 *     or try again) with its value, and chance (relative odds). The
 *     label follows the type/value ("10% off") until the owner edits it.
 *   • Coupons valid for — no expiry / 1 / 2 / 3 / 7 days from the win.
 *   • Redeem        — look up a code a customer shows at the counter and
 *     mark it used; the server refuses a second redemption.
 *   • Winners (V359) — tallies here; the full list (name + phone the
 *     winner left, search, status filter, export) in Manage winners.
 *
 * The server picks every spin's result from these odds, so nothing on the
 * public page can choose a better prize.
 */
export function ShopSpinSection() {
  const [settings, setSettings] = useState<shopApi.SpinSettings | null>(null);
  const [draft, setDraft] = useState<shopApi.SpinSlice[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<shopApi.SpinCoupon | null>(null);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<shopApi.WinnerSummary | null>(null);
  const [winnersOpen, setWinnersOpen] = useState(false);

  const loadSummary = () =>
    shopApi.listSpinWinners({ size: 1 }).then(p => setSummary(p.summary)).catch(() => setSummary(null));

  useEffect(() => {
    shopApi.getSpinSettings()
      .then(s => { setSettings(s); setDraft(s.slices); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load Spin & Win'));
    void loadSummary();
  }, []);

  const total = useMemo(() => draft.reduce((s, x) => s + (Number(x.weight) || 0), 0), [draft]);

  const toggle = async (next: boolean) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, enabled: next });
    setBusy(true);
    try {
      setSettings(await shopApi.updateSpinSettings({ enabled: next }));
      toast.success(next ? 'Spin & Win is on' : 'Spin & Win is off');
    } catch (e) {
      setSettings(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  /** Change one slice. Its label keeps following the type/value as long
   *  as the owner hasn't written their own. */
  const updateSlice = (i: number, patch: Partial<shopApi.SpinSlice>) => setDraft(d => d.map((x, j) => {
    if (j !== i) return x;
    const next = { ...x, ...patch };
    const before = autoLabel(kindOf(x), x.value);
    const wasAuto = !x.label.trim() || x.label === before;
    if (wasAuto) next.label = autoLabel(kindOf(next), next.value) ?? (kindOf(next) === 'gift' && kindOf(x) !== 'gift' ? '' : next.label);
    return next;
  }));

  const setKind = (i: number, k: shopApi.PrizeKind) => {
    const cur = draft[i];
    const value = k === 'percent' ? (kindOf(cur) === 'percent' && cur.value ? cur.value : 10)
      : k === 'amount' ? (kindOf(cur) === 'amount' && cur.value ? cur.value : 1)
      : null;
    updateSlice(i, { kind: k, prize: k !== 'none', value });
  };

  const setCouponDays = async (days: number) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, couponDays: days || null });
    setBusy(true);
    try {
      setSettings(await shopApi.updateSpinSettings({ couponDays: days }));
      toast.success(days ? `New coupons are valid for ${couponDaysLabel(days)}` : 'New coupons never expire');
    } catch (e) {
      setSettings(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const saveWheel = async () => {
    setBusy(true);
    try {
      const fresh = await shopApi.updateSpinSettings({
        slices: draft.map(s => {
          const kind = kindOf(s);
          return {
            label: s.label.trim(),
            weight: Number(s.weight) || 0,
            prize: kind !== 'none',
            kind,
            value: kind === 'percent' || kind === 'amount' ? Number(s.value) || 0 : null,
          };
        }),
      });
      setSettings(fresh);
      setDraft(fresh.slices);
      setEditing(false);
      toast.success('Wheel saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the wheel');
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setFound(null);
    try {
      setFound(await shopApi.lookupSpinCoupon(code));
    } catch (e) {
      toast.error(e instanceof Error && /not found/i.test(e.message) ? 'No coupon with that code' : (e instanceof Error ? e.message : 'Lookup failed'));
    } finally {
      setChecking(false);
    }
  };

  const redeem = async () => {
    if (!found) return;
    setChecking(true);
    try {
      const done = await shopApi.redeemSpinCoupon(found.code);
      setFound(done);
      toast.success(`${done.code} redeemed — ${done.label}`);
      void loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redeem failed');
      try { setFound(await shopApi.lookupSpinCoupon(found.code)); } catch { /* keep */ }
    } finally {
      setChecking(false);
    }
  };

  if (!settings) {
    return (
      <div className="rounded-md border bg-white p-3 text-xs text-gray-500 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Spin &amp; Win…
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white p-3 space-y-3">
      {/* On / Off */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 inline-flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5 text-pink-600" />
            Spin &amp; Win
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {settings.enabled
              ? 'Customers can spin once a day on the shop page. Prizes give a code to show at the counter.'
              : 'Off — the wheel is hidden on the shop page.'}
          </div>
        </div>
        <Switch checked={settings.enabled} disabled={busy} onCheckedChange={toggle} aria-label="Spin & Win" />
      </div>

      {/* V362 — how long a won coupon stays valid, from the moment it's won. */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-700 inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-500" /> Coupons valid for
          </div>
          <div className="text-[10px] text-gray-500">Counted from the win. Winners see the expiry; the counter refuses it after.</div>
        </div>
        <select
          value={settings.couponDays ?? 0}
          onChange={e => void setCouponDays(Number(e.target.value))}
          disabled={busy}
          className={`${SELECT_CLS} h-8 text-sm`}
          aria-label="Coupons valid for"
        >
          {[...new Set<number>([...COUPON_DAY_CHOICES, settings.couponDays ?? 0])].sort((a, b) => a - b).map(d => (
            <option key={d} value={d}>{couponDaysLabel(d)}</option>
          ))}
        </select>
      </div>

      {/* Wheel editor */}
      {!editing ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {settings.slices.map((s, i) => (
            <span
              key={i}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${s.prize ? 'bg-pink-50 border-pink-200 text-pink-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
              title={`Chance ${s.weight}`}
            >
              {s.label}
            </span>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setDraft(settings.slices); setEditing(true); }}>
            Edit wheel
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_84px_72px_54px_24px] gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 px-0.5">
            <span>Slice</span><span>Type</span><span>Value</span><span>Chance</span><span />
          </div>
          {draft.map((s, i) => {
            const k = kindOf(s);
            return (
            <div key={i} className="grid grid-cols-[1fr_84px_72px_54px_24px] gap-1.5 items-center">
              <Input
                value={s.label}
                maxLength={40}
                onChange={e => setDraft(d => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder={k === 'gift' ? 'e.g. Free drink' : 'Label'}
                className="h-8 text-sm"
                aria-label={`Slice ${i + 1} label`}
              />
              <select
                value={k}
                onChange={e => setKind(i, e.target.value as shopApi.PrizeKind)}
                className={`${SELECT_CLS} ${k === 'none' ? 'text-gray-500' : 'text-pink-700'}`}
                aria-label={`Slice ${i + 1} type`}
              >
                {PRIZE_KINDS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {k === 'percent' || k === 'amount' ? (
                <div className="relative">
                  {k === 'amount' && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>}
                  <Input
                    type="number"
                    min={0}
                    max={k === 'percent' ? 100 : 100000}
                    step={k === 'amount' ? '0.01' : '1'}
                    value={s.value ?? ''}
                    onChange={e => updateSlice(i, { value: e.target.value === '' ? null : Number(e.target.value) })}
                    // No browser spin arrows: they cover the number in a field this narrow.
                    className={`h-8 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${k === 'amount' ? 'pl-4 pr-1' : 'pl-2 pr-5'}`}
                    aria-label={`Slice ${i + 1} ${k === 'percent' ? 'percent off' : 'amount off in USD'}`}
                  />
                  {k === 'percent' && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>}
                </div>
              ) : (
                <span className="text-center text-xs text-gray-300">—</span>
              )}
              <Input
                type="number"
                min={0}
                max={1000}
                value={s.weight}
                onChange={e => setDraft(d => d.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                className="h-8 text-sm pr-1"
                aria-label={`Chance for ${s.label || 'slice ' + (i + 1)}`}
              />
              <button
                type="button"
                onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                disabled={draft.length <= 2}
                className="h-8 w-7 inline-flex items-center justify-center text-gray-400 hover:text-red-600 disabled:opacity-30"
                aria-label="Remove slice"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="col-span-5 -mt-1 text-[10px] text-gray-400 pl-0.5">
                {total > 0 ? `${Math.round(((Number(s.weight) || 0) / total) * 1000) / 10}% of spins` : '—'}
              </div>
            </div>
            );
          })}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draft.length >= 12}
              onClick={() => setDraft(d => [...d, { label: '10% off', weight: 10, prize: true, kind: 'percent', value: 10 }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add slice
            </Button>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDraft(settings.slices); setEditing(false); }}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={saveWheel}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save wheel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Redeem at the counter */}
      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-gray-700 inline-flex items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5 text-gray-500" /> Redeem a coupon
        </div>
        <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); void check(); }}>
          <Input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setFound(null); }}
            placeholder="SPIN-XXXXXX"
            className="h-8 text-sm font-mono"
            aria-label="Coupon code"
          />
          <Button type="submit" variant="outline" size="sm" className="h-8" disabled={checking || !code.trim()}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </form>
        {found && (
          <div className={`rounded-md border p-2 text-xs flex items-center justify-between gap-2 ${found.redeemedAt || found.expired ? 'bg-gray-50' : 'bg-green-50 border-green-200'}`}>
            <div className="min-w-0">
              <div className="font-mono font-semibold text-gray-800">{found.code}</div>
              <div className="text-gray-700">{found.label}</div>
              {(found.winnerName || found.winnerPhone) && (
                <div className="text-gray-700 inline-flex items-center gap-1">
                  {found.winnerName}
                  {found.winnerPhone && <span className="inline-flex items-center gap-0.5 text-gray-500 tabular-nums"><Phone className="h-3 w-3" />{found.winnerPhone}</span>}
                </div>
              )}
              <div className="text-[10px] text-gray-500">
                Won {new Date(found.spunAt).toLocaleString()}
                {found.redeemedAt && ` · Redeemed${found.redeemedRef ? ' at checkout ' + found.redeemedRef : ''} ${new Date(found.redeemedAt).toLocaleString()}${found.redeemedByName ? ' by ' + found.redeemedByName : ''}`}
              </div>
              {found.expiresAt && !found.redeemedAt && (
                <div className={`text-[10px] ${found.expired ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  {found.expired ? 'Expired' : 'Valid until'} {fmtExpiry(found.expiresAt)}
                </div>
              )}
            </div>
            {found.redeemedAt ? (
              <span className="inline-flex items-center gap-1 text-gray-500 shrink-0"><CheckCircle2 className="h-3.5 w-3.5" /> Used</span>
            ) : found.expired ? (
              <span className="inline-flex items-center gap-1 text-red-600 shrink-0"><XCircle className="h-3.5 w-3.5" /> Expired</span>
            ) : (
              <Button size="sm" className="h-7 text-xs shrink-0" disabled={checking} onClick={redeem}>Redeem</Button>
            )}
          </div>
        )}
      </div>

      {/* Winners — tallies here, the full list in its own window */}
      <button
        type="button"
        onClick={() => setWinnersOpen(true)}
        className="w-full border-t pt-3 flex items-center justify-between gap-2 text-left group"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-700 inline-flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-gray-500" /> Manage winners
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
            {summary
              ? summary.spins === 0
                ? 'No spins yet'
                : `${summary.spins} spin${summary.spins === 1 ? '' : 's'} · ${summary.issued} won · ${summary.open} open · ${summary.redeemed} used${summary.expired ? ` · ${summary.expired} expired` : ''} · ${summary.withContact} left a phone`
              : '—'}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 shrink-0" />
      </button>
      <SpinWinnersDialog open={winnersOpen} onOpenChange={setWinnersOpen} onChanged={() => void loadSummary()} />
    </div>
  );
}
