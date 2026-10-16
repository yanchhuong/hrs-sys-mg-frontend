import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Gift, Plus, Trash2, Loader2, Ticket, CheckCircle2, Search } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import * as shopApi from '../../api/shop';

/**
 * V358 — "Spin & Win" controls in the Share Shop dialog.
 *
 *   • On/Off switch — shows or hides the wheel on the public shop page.
 *   • Wheel editor  — the slices: label, chance (relative odds), and
 *     whether it is a prize (issues a coupon) or a "try again".
 *   • Redeem        — look up a code a customer shows at the counter and
 *     mark it used; the server refuses a second redemption.
 *   • Recent winners, newest first, with their status.
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
  const [recent, setRecent] = useState<shopApi.SpinCoupon[]>([]);

  const loadRecent = () => shopApi.recentSpinCoupons(10).then(setRecent).catch(() => setRecent([]));

  useEffect(() => {
    shopApi.getSpinSettings()
      .then(s => { setSettings(s); setDraft(s.slices); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load Spin & Win'));
    void loadRecent();
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

  const saveWheel = async () => {
    setBusy(true);
    try {
      const fresh = await shopApi.updateSpinSettings({
        slices: draft.map(s => ({ label: s.label.trim(), weight: Number(s.weight) || 0, prize: s.prize })),
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
      void loadRecent();
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
          <div className="grid grid-cols-[1fr_72px_88px_28px] gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 px-0.5">
            <span>Slice</span><span>Chance</span><span>Type</span><span />
          </div>
          {draft.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_72px_88px_28px] gap-1.5 items-center">
              <Input
                value={s.label}
                maxLength={40}
                onChange={e => setDraft(d => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder="e.g. 10% off"
                className="h-8 text-sm"
              />
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={s.weight}
                  onChange={e => setDraft(d => d.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                  className="h-8 text-sm pr-1"
                  aria-label={`Chance for ${s.label || 'slice ' + (i + 1)}`}
                />
              </div>
              <button
                type="button"
                onClick={() => setDraft(d => d.map((x, j) => (j === i ? { ...x, prize: !x.prize } : x)))}
                className={`h-8 rounded-md border text-xs font-medium ${s.prize ? 'bg-pink-50 border-pink-300 text-pink-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                title="Prize slices issue a coupon code"
              >
                {s.prize ? 'Prize' : 'Try again'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                disabled={draft.length <= 2}
                className="h-8 w-7 inline-flex items-center justify-center text-gray-400 hover:text-red-600 disabled:opacity-30"
                aria-label="Remove slice"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="col-span-4 -mt-1 text-[10px] text-gray-400 pl-0.5">
                {total > 0 ? `${Math.round(((Number(s.weight) || 0) / total) * 1000) / 10}% of spins` : '—'}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draft.length >= 12}
              onClick={() => setDraft(d => [...d, { label: '', weight: 10, prize: true }])}
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
          <div className={`rounded-md border p-2 text-xs flex items-center justify-between gap-2 ${found.redeemedAt ? 'bg-gray-50' : 'bg-green-50 border-green-200'}`}>
            <div className="min-w-0">
              <div className="font-mono font-semibold text-gray-800">{found.code}</div>
              <div className="text-gray-700">{found.label}</div>
              <div className="text-[10px] text-gray-500">
                Won {new Date(found.spunAt).toLocaleString()}
                {found.redeemedAt && ` · Redeemed ${new Date(found.redeemedAt).toLocaleString()}${found.redeemedByName ? ' by ' + found.redeemedByName : ''}`}
              </div>
            </div>
            {found.redeemedAt ? (
              <span className="inline-flex items-center gap-1 text-gray-500 shrink-0"><CheckCircle2 className="h-3.5 w-3.5" /> Used</span>
            ) : (
              <Button size="sm" className="h-7 text-xs shrink-0" disabled={checking} onClick={redeem}>Redeem</Button>
            )}
          </div>
        )}
        {recent.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Recent winners</div>
            {recent.slice(0, 6).map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { setCode(c.code); setFound(c); }}
                className="w-full flex items-center justify-between gap-2 text-[11px] text-left px-1.5 py-1 rounded hover:bg-gray-50"
              >
                <span className="font-mono text-gray-700">{c.code}</span>
                <span className="truncate text-gray-500 flex-1">{c.label}</span>
                <span className={c.redeemedAt ? 'text-gray-400' : 'text-green-600'}>{c.redeemedAt ? 'Used' : 'Open'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
