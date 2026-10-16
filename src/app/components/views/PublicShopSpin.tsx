import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, X, Copy, Loader2, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import * as shopApi from '../../api/shop';
import { couponDaysLabel, fmtExpiry } from '../../utils/spinPrize';

/**
 * V358 — "Spin & Win" on the public shop page.
 *
 * A floating button opens the wheel. The SERVER picks the result (weighted
 * by the owner's odds); this component only animates the wheel to the
 * slice it is told. One spin per shop per browser per day: the device id is
 * a random id kept in localStorage per shop, and the server enforces the
 * limit on (shop, device, day), returning
 * the earlier result if the device already spun today. A prize comes with
 * a coupon code to show at the counter, and (V359) the winner can leave
 * their name and phone so the shop knows who won and can reach them.
 */

// One id per shop in this browser ("shop + browser" is the unique visitor),
// so a customer gets one spin a day on EACH shop they visit, and shops
// never see the same id for the same person.
const DEVICE_KEY = 'shop-spin-device';

/* The spin, frame by frame (requestAnimationFrame), like a real wheel:
 *   1. speed-up — starts turning the moment the centre is tapped, easing
 *      up to full speed while the server picks the result;
 *   2. cruise  — keeps turning at full speed for at least MIN_SPIN_MS;
 *   3. slow-down — an ease-out (cubic) that STARTS at the cruise speed, so
 *      there is no jump, and comes to rest on the server's slice after a
 *      few more turns. The pointer stays still. */
const SPIN_UP_MS = 450;
const MIN_SPIN_MS = 1200;
const MAX_SPEED = 0.9; // degrees per ms (about 2.5 turns a second)
const MIN_TURNS_LEFT = 3; // full turns while slowing down
// Alternating slice colours; prize slices get the warm pair.
const PRIZE_COLORS = ['#EC4899', '#F59E0B'];
const OTHER_COLORS = ['#E5E7EB', '#CBD5E1'];

function deviceId(shopCode: string): string {
  const key = `${DEVICE_KEY}:${shopCode}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      // Reuse the old browser-wide id the first time, so a visitor who
      // already spun today before this change isn't handed a second spin.
      id = localStorage.getItem(DEVICE_KEY)
        ?? (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): a per-tab id still works; the server
    // and its per-connection limit keep the rule.
    return `tab-${Math.random().toString(36).slice(2, 14)}`;
  }
}

export function PublicShopSpin({ shopCode, lifted }: {
  shopCode: string;
  /** Raise the button above the cart bar while that bar is showing. */
  lifted: boolean;
}) {
  const [config, setConfig] = useState<shopApi.PublicSpinConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<shopApi.SpinResult | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  /** V361 — asking the server whether this browser already spun today. */
  const [checkingToday, setCheckingToday] = useState(false);

  // The wheel's angle lives in a ref and is written straight to the SVG's
  // style each frame — no React re-render per frame.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  const setAngle = (a: number) => {
    angleRef.current = a;
    if (svgRef.current) svgRef.current.style.transform = `rotate(${a}deg)`;
  };
  /** A re-opened modal mounts a new SVG: give it the current angle. */
  const attachSvg = (el: SVGSVGElement | null) => {
    svgRef.current = el;
    if (el) el.style.transform = `rotate(${angleRef.current}deg)`;
  };

  useEffect(() => {
    if (!shopCode) return;
    shopApi.getPublicSpin(shopCode).then(setConfig).catch(() => setConfig(null));
  }, [shopCode]);

  // "Scan to Play" QR → /shop/{code}?spin=1 opens the wheel straight away
  // (once it is known to be on). The flag is then dropped from the address
  // so a refresh or a shared link doesn't keep popping it open.
  useEffect(() => {
    if (!config?.enabled || (config.slices?.length ?? 0) < 2) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('spin') !== '1') return;
      setOpen(true);
      url.searchParams.delete('spin');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch { /* no URL API — the floating button still works */ }
  }, [config]);

  const slices = config?.slices ?? [];
  const n = slices.length;
  const seg = n > 0 ? 360 / n : 360;

  const colors = useMemo(() => {
    let p = 0, o = 0;
    return slices.map(s => (s.prize ? PRIZE_COLORS[p++ % 2] : OTHER_COLORS[o++ % 2]));
  }, [slices]);

  // V361 — opening the wheel shows today's earlier spin straight away,
  // win or not, resting on its slice; the Spin button is only offered
  // when there is no spin yet.
  useEffect(() => {
    if (!open || result || !config?.enabled || n < 2) return;
    let live = true;
    setCheckingToday(true);
    shopApi.getMySpinToday(shopCode, deviceId(shopCode))
      .then(r => {
        if (!live || !r) return;
        setAngle(-(r.sliceIndex * seg + seg / 2));
        showResult(r);
      })
      .catch(() => { /* fall back to the Spin button — a spin returns it anyway */ })
      .finally(() => { if (live) setCheckingToday(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopCode, n]);

  if (!config?.enabled || n < 2) return null;

  const finish = (r: shopApi.SpinResult) => {
    showResult(r);
    setSpinning(false);
    if (r.prize) { try { navigator.vibrate?.([30, 50, 30]); } catch { /* not supported */ } }
  };

  const spin = () => {
    if (spinning || result || checkingToday) return;
    setSpinning(true);
    // Keep the numbers small: start from the same position within one turn.
    setAngle(((angleRef.current % 360) + 360) % 360);
    const restOn = (r: shopApi.SpinResult) => {
      // Land inside the slice, a little off-centre so it doesn't look staged.
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      return -(r.sliceIndex * seg + seg / 2) + jitter;
    };

    let res: shopApi.SpinResult | null = null;
    let err: unknown = null;
    const request = shopApi.spinPublic(shopCode, deviceId(shopCode))
      .then(r => { res = r; })
      .catch(e => { err = e; });
    const fail = () => {
      setSpinning(false);
      toast.error(err instanceof Error ? err.message : 'Could not spin — please try again.');
    };

    // Reduced motion: no spin — just show where it landed.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      void request.then(() => {
        const r = res as shopApi.SpinResult | null;
        if (r) { setAngle(restOn(r)); finish(r); } else fail();
      });
      return;
    }

    const t0 = performance.now();
    let last = t0;
    let plan: { from: number; to: number; start: number; ms: number } | null = null;
    const frame = (now: number) => {
      const dt = Math.min(50, now - last); // a background tab can stall frames
      last = now;
      const r = res as shopApi.SpinResult | null;
      if (!plan) {
        const up = Math.min(1, (now - t0) / SPIN_UP_MS);
        const speed = MAX_SPEED * up * up;
        setAngle(angleRef.current + speed * dt);
        if ((r || err) && now - t0 >= MIN_SPIN_MS) {
          const from = angleRef.current;
          // On an error, just glide to a stop one turn later; otherwise rest
          // on the result after at least MIN_TURNS_LEFT more turns.
          const base = from + MIN_TURNS_LEFT * 360;
          const to = r ? base + ((((restOn(r) - base) % 360) + 360) % 360) : from + 360;
          // An ease-out cubic starts at 3 x distance / time — match it to the
          // current speed so the slow-down carries on smoothly.
          plan = { from, to, start: now, ms: (3 * (to - from)) / speed };
        }
      } else {
        const p = Math.min(1, (now - plan.start) / plan.ms);
        setAngle(plan.from + (plan.to - plan.from) * (1 - Math.pow(1 - p, 3)));
        if (p >= 1) {
          rafRef.current = null;
          if (r) finish(r); else fail();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const showResult = (r: shopApi.SpinResult) => {
    setResult(r);
    setName(r.winnerName ?? '');
    setPhone(r.winnerPhone ?? '');
    setEditingContact(false);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.couponCode) return;
    setSavingContact(true);
    try {
      const r = await shopApi.claimSpinPublic(shopCode, {
        deviceId: deviceId(shopCode), couponCode: result.couponCode, name, phone,
      });
      showResult({ ...r, alreadySpun: result.alreadySpun });
      toast.success('Saved — the shop has your details');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save — please try again.');
    } finally {
      setSavingContact(false);
    }
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast.success('Code copied'); } catch { /* ignore */ }
  };

  const r = 148; // wheel radius in SVG units — no frame, slices reach the edge
  const label = (i: number) => {
    const a = ((i * seg + seg / 2) - 90) * (Math.PI / 180);
    return { x: Math.cos(a) * r * 0.62, y: Math.sin(a) * r * 0.62, rot: i * seg + seg / 2 };
  };
  const arc = (i: number) => {
    const a0 = (i * seg - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * seg - 90) * (Math.PI / 180);
    const large = seg > 180 ? 1 : 0;
    return `M0 0 L${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 ${large} 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed left-4 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:brightness-105 transition-[bottom] ${lifted ? 'bottom-24' : 'bottom-5'}`}
        aria-label="Spin and win"
      >
        <Gift className="h-4 w-4" /> Spin &amp; Win
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => !spinning && setOpen(false)}>
          <div
            className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-7 shadow-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Spin and win"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={spinning}
              className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">Spin &amp; Win</div>
              <div className="text-xs text-gray-500">
                One spin a day. Win a coupon to use at the counter.
                {/* V362 — say up front how long a prize lasts. */}
                {!!config.couponDays && <> Prizes are valid for {couponDaysLabel(config.couponDays)}.</>}
              </div>
            </div>

            <div className="relative mx-auto mt-4 h-72 w-72">
              {/* Pointer — blue like the SPIN button; it stays still while
                  the wheel turns. */}
              <div className="absolute left-1/2 -top-1 z-20 -translate-x-1/2 h-0 w-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-blue-600 drop-shadow" />
              <svg
                ref={attachSvg}
                viewBox="-150 -150 300 300"
                className="h-full w-full"
                style={{ willChange: 'transform' }}
              >
                {slices.map((s, i) => (
                  <g key={i}>
                    <path d={arc(i)} fill={colors[i]} stroke="#fff" strokeWidth="2" />
                    <text
                      x={label(i).x}
                      y={label(i).y}
                      transform={`rotate(${label(i).rot} ${label(i).x} ${label(i).y})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={n > 8 ? 10 : 12}
                      fontWeight={700}
                      fill={s.prize ? '#fff' : '#334155'}
                    >
                      {s.label.length > 14 ? s.label.slice(0, 13) + '…' : s.label}
                    </text>
                  </g>
                ))}
              </svg>
              {/* The centre IS the button. It sits above the SVG, so it stays
                  upright while the wheel turns. */}
              <button
                type="button"
                onClick={spin}
                disabled={spinning || !!result || checkingToday}
                aria-label="Spin the wheel"
                className={`absolute left-1/2 top-1/2 z-10 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white font-extrabold tracking-wider text-white transition-transform active:scale-95 disabled:cursor-default ${
                  result ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700 shadow-[0_6px_18px_rgba(37,99,235,0.45)]'
                }`}
              >
                {/* An invitation to tap, until the spin starts. */}
                {!spinning && !result && !checkingToday && (
                  <span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-blue-500/40 animate-ping" />
                )}
                {checkingToday
                  ? <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  : result ? <Gift className="mx-auto h-6 w-6 text-gray-500" />
                  : spinning ? null : 'SPIN'}
              </button>
            </div>

            {result ? (
              <div className="mt-4 text-center">
                {result.prize && result.couponCode ? (
                  <>
                    <div className="text-base font-bold text-pink-600">🎉 You won {result.label}!</div>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-pink-300 bg-pink-50 px-4 py-2">
                      <span className="font-mono text-xl font-bold tracking-wider text-gray-900">{result.couponCode}</span>
                      <button type="button" onClick={() => copy(result.couponCode!)} className="text-pink-600" aria-label="Copy code">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">Show this code at the counter to claim your prize.</div>
                    {/* V362 — when it stops working. */}
                    {result.expiresAt && !result.redeemedAt && (
                      <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${result.expired ? 'text-red-600' : 'text-amber-700'}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {result.expired ? 'Expired on' : 'Valid until'} {fmtExpiry(result.expiresAt)}
                      </div>
                    )}
                    {result.redeemedAt ? (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
                        <Check className="h-3.5 w-3.5" />
                        Used at the counter on {new Date(result.redeemedAt).toLocaleString()}
                      </div>
                    ) : result.expired ? (
                      <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        This coupon has expired and can no longer be used.
                      </div>
                    ) : result.winnerPhone && !editingContact ? (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-800">
                        <Check className="h-3.5 w-3.5" />
                        Saved for {result.winnerName} · {result.winnerPhone}
                        <button type="button" onClick={() => setEditingContact(true)} className="ml-1 font-semibold underline">Edit</button>
                      </div>
                    ) : (
                      <form onSubmit={saveContact} className="mt-4 space-y-2 text-left">
                        <div className="text-xs font-semibold text-gray-700">Leave your name and phone so the shop knows it’s you</div>
                        <input
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Your name"
                          autoComplete="name"
                          maxLength={80}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          aria-label="Your name"
                        />
                        <input
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="Phone number, e.g. 012 345 678"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={24}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          aria-label="Phone number"
                        />
                        <button
                          type="submit"
                          disabled={savingContact || name.trim().length < 2 || phone.replace(/\D/g, '').length < 8}
                          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                          {savingContact && <Loader2 className="h-4 w-4 animate-spin" />} Save my details
                        </button>
                        {/* V362 — the coupon policy, where the winner gives their details. */}
                        <ul className="mt-1 space-y-0.5 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500 list-disc list-inside">
                          <li>
                            {result.expiresAt
                              ? <>Valid until <span className="font-medium text-gray-700">{fmtExpiry(result.expiresAt)}</span> — it can’t be used after that.</>
                              : 'This coupon does not expire.'}
                          </li>
                          <li>One use only. Show the code at the counter or give it at checkout.</li>
                          <li>Only this shop sees your name and phone, to confirm the winner and contact you about the prize.</li>
                        </ul>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="text-base font-semibold text-gray-700">{result.label} — better luck next time!</div>
                )}
                {result.alreadySpun && (
                  <div className="mt-2 text-[11px] text-gray-400">You’ve already spun today. Come back tomorrow for another spin.</div>
                )}
              </div>
            ) : (
              <div className="mt-4 text-center text-sm font-medium text-gray-500" aria-live="polite">
                {checkingToday ? 'Loading…' : spinning ? 'Good luck…' : 'Tap SPIN in the middle of the wheel'}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
