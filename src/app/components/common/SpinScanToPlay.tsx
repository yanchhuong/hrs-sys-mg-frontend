import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, ExternalLink, Printer, QrCode } from 'lucide-react';
import { Button } from '../ui/button';
import { couponDaysLabel } from '../../utils/spinPrize';

/**
 * "Scan to Play" — a QR straight to the wheel: /shop/{code}?spin=1 opens
 * the shop page with Spin & Win already open (PublicShopSpin reads the
 * flag). Same look as the menu QR above it; Print poster makes a counter
 * card with the QR, a call to action and the coupon validity.
 */

/** The shop link with ?spin=1 added. */
export function spinUrlOf(shopUrl: string): string {
  return shopUrl + (shopUrl.includes('?') ? '&' : '?') + 'spin=1';
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function SpinScanToPlay({ shopUrl, shopCode, couponDays }: {
  shopUrl: string;
  shopCode: string;
  couponDays?: number | null;
}) {
  const url = spinUrlOf(shopUrl);
  const [qr, setQr] = useState<string>('');

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(d => { if (live) setQr(d); })
      .catch(() => setQr(''));
    return () => { live = false; };
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Clipboard not available'); }
  };

  const printPoster = () => {
    if (!qr) { toast.error('QR not ready yet'); return; }
    const w = window.open('', '_blank', 'width=480,height=680');
    if (!w) { toast.error('Popup blocked — allow popups to print'); return; }
    const validity = couponDays ? `Prizes are valid for ${couponDaysLabel(couponDays)}.` : '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Scan to Play — ${escapeHtml(shopCode)}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; text-align: center; margin: 0; padding: 36px 20px; color: #0f172a; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: #fdf2f8; color: #be185d; font-weight: 700; font-size: 14px; letter-spacing: .5px; }
        h1 { font-size: 34px; margin: 14px 0 4px; }
        .sub { color: #475569; font-size: 15px; margin-bottom: 18px; }
        img { width: 300px; height: 300px; }
        .cta { font-size: 22px; font-weight: 800; color: #2563eb; margin-top: 10px; }
        .fine { color: #64748b; font-size: 12px; margin-top: 14px; line-height: 1.5; }
        .url { color: #94a3b8; font-size: 10px; margin-top: 8px; word-break: break-all; }
        @media print { body { padding: 12mm; } }
      </style></head><body>
      <div class="badge">🎁 SPIN &amp; WIN</div>
      <h1>Scan to Play</h1>
      <div class="sub">Spin the wheel and win a prize to use at the counter.</div>
      <img src="${qr}" alt="QR" />
      <div class="cta">Point your phone camera here</div>
      <div class="fine">One spin a day per phone. ${escapeHtml(validity)}<br/>Show your coupon code at the counter.</div>
      <div class="url">${escapeHtml(url)}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  };

  return (
    <div className="rounded-md border border-pink-200 bg-pink-50/40 p-3 flex gap-3 items-center">
      <div className="shrink-0 rounded-md border bg-white p-1.5">
        {qr
          ? <img src={qr} alt="Scan to Play QR" className="h-[104px] w-[104px]" />
          : <div className="h-[104px] w-[104px] grid place-items-center text-gray-300"><QrCode className="h-8 w-8" /></div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-sm font-semibold text-gray-900">Scan to Play</div>
        <div className="text-[11px] text-gray-500 leading-snug">
          Customers scan this to open the wheel straight away — put it on the counter or tables.
        </div>
        <div className="truncate rounded bg-white border px-2 py-1 font-mono text-[11px] text-gray-600" title={url}>{url}</div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={copy} title="Copy link">
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" title="Open"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={printPoster} title="Print a counter poster">
            <Printer className="h-3.5 w-3.5 mr-1" /> Print poster
          </Button>
        </div>
      </div>
    </div>
  );
}
