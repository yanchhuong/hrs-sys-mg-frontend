import { useEffect, useMemo, useRef, useState } from 'react';
import { Gift, X, Copy, Loader2, Check, Clock, QrCode, Share2, ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import * as shopApi from '../../api/shop';
import { couponDaysLabel, fmtExpiry, wheelColors } from '../../utils/spinPrize';
import { layoutWheelLabel, makeMeasure } from '../../utils/wheelLabels';
import { PlainButton } from '../ui/button';

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
 *
 * V387 — on a Demo wheel (the owner's choice) the same game is a practice
 * one: labelled Demo, spin as often as you like, the result is shown as
 * "you'd win…" with no coupon and no contact form. The server still picks
 * with the real odds; it just issues and records nothing.
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
  const demo = !!config?.demo;
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<shopApi.SpinResult | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  /** V361 — asking the server whether this browser already spun today. */
  const [checkingToday, setCheckingToday] = useState(false);
  /** "Play on another phone" — a QR of this wheel for a friend to scan. */
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState('');
  const playUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/shop/${encodeURIComponent(shopCode)}?spin=1`
    : '';
  useEffect(() => {
    if (!showQr || qrData || !playUrl) return;
    QRCode.toDataURL(playUrl, { width: 440, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQrData)
      .catch(() => setQrData(''));
  }, [showQr, qrData, playUrl]);
  useEffect(() => { if (!open) setShowQr(false); }, [open]);

  /* Maximize — the game fills the screen with a bigger wheel. Uses the
   * browser's real full-screen mode where it exists (hides the address
   * bar on Android / desktop) and a full-viewport layout everywhere, so
   * iPhone Safari, which has no element full screen, still gets it. */
  const [maximized, setMaximized] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const exitNativeFullscreen = () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  };
  const toggleMaximize = () => {
    if (maximized) {
      setMaximized(false);
      exitNativeFullscreen();
      return;
    }
    setMaximized(true);
    const el = overlayRef.current;
    if (el && typeof el.requestFullscreen === 'function' && !document.fullscreenElement) {
      // Refused (iframe, iOS, user setting) — the CSS layout still applies.
      void el.requestFullscreen().catch(() => {});
    }
  };
  // Leaving full screen with Esc / the system back gesture minimizes too.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setMaximized(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // Closing the game always restores the normal window.
  useEffect(() => {
    if (!open) { setMaximized(false); exitNativeFullscreen(); }
  }, [open]);
  /** Wheel edge in px: the card's 288, or as big as the screen allows
   *  (leaving room for the title and the result below it). */
  const wheelStyle = maximized
    ? { width: 'min(88vw, 62vh)', height: 'min(88vw, 62vh)' }
    : undefined;
  const copyPlayUrl = async () => {
    try { await navigator.clipboard.writeText(playUrl); toast.success('Link copied'); }
    catch { toast.error('Could not copy — long-press the link instead'); }
  };
  const sharePlayUrl = async () => {
    try { await navigator.share({ title: 'Spin & Win', text: 'Spin the wheel and win a prize!', url: playUrl }); }
    catch { /* cancelled */ }
  };

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

  // Each label across its slice when it fits, else along it (see wheelLabels).
  const labels = useMemo(() => {
    const measure = makeMeasure();
    return slices.map((s, i) => layoutWheelLabel(s.label, i, slices.length, measure));
  }, [slices]);

  // Every slice its own colour (no repeats), stable for this shop's wheel.
  const colors = useMemo(
    () => wheelColors(slices.length, `${shopCode}|${slices.map(s => s.label).join('|')}`),
    [slices, shopCode],
  );

  // V361 — opening the wheel shows today's earlier spin straight away,
  // win or not, resting on its slice; the Spin button is only offered
  // when there is no spin yet.
  useEffect(() => {
    // A demo wheel has no "today's spin" to reopen.
    if (!open || result || !config?.enabled || config.demo || n < 2) return;
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
    if (spinning || checkingToday) return;
    // Official: one spin, then the result stays. Demo: spin again freely.
    if (result && !demo) return;
    if (result) setResult(null);
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
        {demo && <span className="rounded-full bg-white/25 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">Demo</span>}
      </button>

      {open && (
        <div
          ref={overlayRef}
          className={`fixed inset-0 z-50 flex justify-center bg-black/50 ${maximized ? 'items-stretch p-0' : 'items-end sm:items-center p-0 sm:p-4'}`}
          onClick={() => !spinning && !maximized && setOpen(false)}
        >
          <div
            // While the QR layer is up the card stops scrolling, at the top,
            // so the layer (inset-0) covers exactly what's on screen.
            ref={el => { if (el && showQr) el.scrollTop = 0; }}
            className={`relative w-full ${maximized ? 'h-full max-h-none rounded-none flex flex-col justify-center' : 'sm:max-w-sm max-h-[92vh] rounded-t-2xl sm:rounded-2xl'} ${showQr ? 'overflow-hidden min-h-[600px]' : 'overflow-y-auto'} bg-white p-5 pb-7 shadow-2xl`}
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
            <button
              type="button"
              onClick={toggleMaximize}
              className="absolute right-12 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              aria-label={maximized ? 'Minimize' : 'Maximize'}
              title={maximized ? 'Minimize' : 'Full screen'}
            >
              {maximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              disabled={spinning}
              className="absolute left-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-40"
              aria-label="Play on another phone"
              title="Play on another phone"
            >
              <QrCode className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900 inline-flex items-center gap-2">
                Spin &amp; Win
                {demo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">Demo</span>}
              </div>
              <div className="text-xs text-gray-500">
                {demo ? (
                  <>Demo wheel — just for fun. Spin as often as you like; prizes aren’t real and no coupon is given.</>
                ) : (
                  <>
                    One spin a day. Win a coupon to use at the counter.
                    {/* V362 — say up front how long a prize lasts. */}
                    {!!config.couponDays && <> Prizes are valid for {couponDaysLabel(config.couponDays)}.</>}
                  </>
                )}
              </div>
            </div>

            <div className={`relative mx-auto mt-4 ${maximized ? '' : 'h-72 w-72'}`} style={wheelStyle}>
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
                    <path d={arc(i)} fill={colors[i]?.fill} stroke="#fff" strokeWidth="2" />
                    {(() => {
                      const L = labels[i];
                      if (!L) return null;
                      return (
                        <text
                          x={L.x}
                          y={L.y}
                          transform={`rotate(${L.rot} ${L.x} ${L.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={L.fontSize}
                          fontWeight={700}
                          fill={colors[i]?.text}
                          data-layout={L.mode}
                        >
                          <title>{s.label}</title>
                          {L.lines.length === 1
                            ? L.lines[0]
                            : L.lines.map((line, k) => (
                              <tspan key={k} x={L.x} dy={k === 0 ? `${-0.575}em` : '1.15em'}>{line}</tspan>
                            ))}
                        </text>
                      );
                    })()}
                  </g>
                ))}
              </svg>
              {/* The centre IS the button. It sits above the SVG, so it stays
                  upright while the wheel turns. */}
              <button
                type="button"
                onClick={spin}
                disabled={spinning || (!!result && !demo) || checkingToday}
                aria-label="Spin the wheel"
                className={`absolute left-1/2 top-1/2 z-10 ${maximized ? 'h-24 w-24 text-lg' : 'h-20 w-20'} -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white font-extrabold tracking-wider text-white transition-transform active:scale-95 disabled:cursor-default ${
                  result && !demo ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700 shadow-[0_6px_18px_rgba(37,99,235,0.45)]'
                }`}
              >
                {/* An invitation to tap, until the spin starts. */}
                {!spinning && (!result || demo) && !checkingToday && (
                  <span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-blue-500/40 animate-ping" />
                )}
                {checkingToday
                  ? <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  : result && !demo ? <Gift className="mx-auto h-6 w-6 text-gray-500" />
                  : spinning ? null : 'SPIN'}
              </button>
            </div>

            {result?.demo ? (
              <div className="mt-4 text-center">
                {result.prize
                  ? <div className="text-base font-bold text-pink-600">🎉 You’d win {result.label}!</div>
                  : <div className="text-base font-semibold text-gray-700">{result.label} — no prize this time.</div>}
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                  Demo only — not a real prize, no coupon is given.
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={spin}
                    disabled={spinning}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Gift className="h-4 w-4" /> Spin again
                  </button>
                </div>
              </div>
            ) : result ? (
              <div className="mt-4 text-center">
                {result.prize && result.couponCode ? (
                  <>
                    <div className="text-base font-bold text-pink-600">🎉 You won {result.label}!</div>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-pink-300 bg-pink-50 px-4 py-2">
                      <span className="font-mono text-xl font-bold tracking-wider text-gray-900">{result.couponCode}</span>
                      <PlainButton type="button" onClick={() => copy(result.couponCode!)} className="text-pink-600" aria-label="Copy code">
                        <Copy className="h-4 w-4" />
                      </PlainButton>
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
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
                >
                  <QrCode className="h-3.5 w-3.5" /> Let a friend play — show QR
                </button>
              </div>
            ) : (
              <div className="mt-4 text-center text-sm font-medium text-gray-500" aria-live="polite">
                {checkingToday ? 'Loading…' : spinning ? 'Good luck…' : 'Tap SPIN in the middle of the wheel'}
              </div>
            )}

            {showQr && (
              <div className="absolute inset-0 z-30 flex flex-col items-center overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-7 text-center" role="region" aria-label="Play on another phone">
                <button
                  type="button"
                  onClick={() => setShowQr(false)}
                  className="absolute left-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                  aria-label="Back to the wheel"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="text-lg font-bold text-gray-900">Play on another phone</div>
                <div className="mt-1 text-xs text-gray-500">Scan with the other phone’s camera to open this wheel.</div>
                <div className="mt-4 rounded-xl border bg-white p-2 shadow-sm">
                  {qrData
                    ? <img src={qrData} alt="QR to play Spin & Win" className="h-56 w-56" />
                    : <div className="h-56 w-56 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>}
                </div>
                <div className="mt-2 text-sm font-semibold text-blue-600">Scan to Play</div>
                <div className="mt-1 text-[11px] text-gray-400">
                  {demo ? 'Anyone can try the demo wheel.' : 'Each phone gets one spin a day.'}
                  {!demo && !!config.couponDays && <> Prizes are valid for {couponDaysLabel(config.couponDays)}.</>}
                </div>
                <div className="mt-3 w-full truncate rounded-lg bg-gray-50 border px-3 py-1.5 font-mono text-[11px] text-gray-600" title={playUrl}>{playUrl}</div>
                <div className="mt-3 flex w-full gap-2">
                  <PlainButton
                    type="button"
                    onClick={copyPlayUrl}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="h-4 w-4" /> Copy link
                  </PlainButton>
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <PlainButton
                      type="button"
                      onClick={sharePlayUrl}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Share2 className="h-4 w-4" /> Share
                    </PlainButton>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
