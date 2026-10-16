import { useEffect, useMemo, useState } from 'react';
import { Gift, X, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as shopApi from '../../api/shop';

/**
 * V358 — "Spin & Win" on the public shop page.
 *
 * A floating button opens the wheel. The SERVER picks the result (weighted
 * by the owner's odds); this component only animates the wheel to the
 * slice it is told. One spin per device per day: the device id is a random
 * id kept in localStorage, and the server enforces the limit, returning
 * the earlier result if the device already spun today. A prize comes with
 * a coupon code to show at the counter.
 */

const DEVICE_KEY = 'shop-spin-device';
const SPIN_MS = 4800;
// Alternating slice colours; prize slices get the warm pair.
const PRIZE_COLORS = ['#EC4899', '#F59E0B'];
const OTHER_COLORS = ['#E5E7EB', '#CBD5E1'];

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(DEVICE_KEY, id);
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
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<shopApi.SpinResult | null>(null);

  useEffect(() => {
    if (!shopCode) return;
    shopApi.getPublicSpin(shopCode).then(setConfig).catch(() => setConfig(null));
  }, [shopCode]);

  const slices = config?.slices ?? [];
  const n = slices.length;
  const seg = n > 0 ? 360 / n : 360;

  const colors = useMemo(() => {
    let p = 0, o = 0;
    return slices.map(s => (s.prize ? PRIZE_COLORS[p++ % 2] : OTHER_COLORS[o++ % 2]));
  }, [slices]);

  if (!config?.enabled || n < 2) return null;

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      const r = await shopApi.spinPublic(shopCode, deviceId());
      if (r.alreadySpun) {
        // Today's spin already happened: show it straight away, wheel
        // resting on that slice.
        setRotation(-(r.sliceIndex * seg + seg / 2));
        setResult(r);
        setSpinning(false);
        return;
      }
      // Land the middle of the slice under the pointer at the top, after
      // several full turns. A little jitter so it isn't dead-centre.
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const target = 360 * 6 - (r.sliceIndex * seg + seg / 2) + jitter;
      const base = rotation - (rotation % 360);
      setRotation(base + target);
      window.setTimeout(() => { setResult(r); setSpinning(false); }, SPIN_MS + 100);
    } catch (e) {
      setSpinning(false);
      toast.error(e instanceof Error ? e.message : 'Could not spin — please try again.');
    }
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast.success('Code copied'); } catch { /* ignore */ }
  };

  const r = 140; // wheel radius in SVG units
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
            className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-7 shadow-2xl"
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
              <div className="text-xs text-gray-500">One spin a day. Win a coupon to use at the counter.</div>
            </div>

            <div className="relative mx-auto mt-4 h-72 w-72">
              {/* Pointer */}
              <div className="absolute left-1/2 -top-1 z-10 -translate-x-1/2 h-0 w-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-gray-900 drop-shadow" />
              <svg
                viewBox="-150 -150 300 300"
                className="h-full w-full"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.12, 1)` : 'none',
                }}
              >
                <circle r="148" fill="#111827" />
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
                <circle r="22" fill="#fff" stroke="#111827" strokeWidth="4" />
              </svg>
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
                  </>
                ) : (
                  <div className="text-base font-semibold text-gray-700">{result.label} — better luck next time!</div>
                )}
                {result.alreadySpun && (
                  <div className="mt-2 text-[11px] text-gray-400">You’ve already spun today. Come back tomorrow for another spin.</div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={spin}
                disabled={spinning}
                className="mt-5 w-full rounded-xl bg-gray-900 py-3 text-base font-bold text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {spinning ? <><Loader2 className="h-4 w-4 animate-spin" /> Spinning…</> : 'Spin the wheel'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
