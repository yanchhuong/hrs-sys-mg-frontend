import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Clock, User, Eye, Hash, Receipt as ReceiptIcon, Landmark, Upload, X as XIcon, Plus, Trash2, Info, BellRing, Printer, MonitorPlay, Coins } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import * as settingsApi from '../../api/accountingSettings';
import * as currencyApi from '../../api/currencySettings';
import { resolveVideoEmbed } from '../../utils/posCustomerDisplay';
import {
  loadBankAccounts, saveBankAccounts, newBankAccountId,
  EMPTY_BANK_ACCOUNT, MAX_BANK_ACCOUNTS_ON_INVOICE, type BankAccount,
} from '../../utils/bankAccount';
import { ImageDropZone } from './ImageDropZone';
import * as paywayApi from '../../api/payway';
import { PayWaySettingsDialog } from './PayWaySettingsDialog';

/** Reference lists of taxation patterns. Sale + Purchase share the
 *  original 5-pattern VAT+WHT set; Receipt has its own 4-pattern WHT
 *  catalog matching the form dropdown (datakeys 11 / 15 / 16 / 20). */
const SALE_PURCHASE_TAX_TYPES = [
  { key: '1',  label: 'VAT 10%',                rate: 10 },
  { key: '2',  label: 'VAT 0%',                 rate: 0 },
  { key: '3',  label: 'Exclusive VAT',          rate: 0 },
  { key: '11', label: 'WHT Tax on Service 15%', rate: 15 },
  { key: '12', label: 'WHT Tax on Service 14%', rate: 14 },
];
const RECEIPT_TAX_TYPES = [
  { key: '11', label: 'WHT Tax on Service 15%',                                       rate: 15 },
  { key: '15', label: 'WHT Tax on Rental (Physical Person) 10%',                      rate: 10 },
  { key: '16', label: 'WHT Tax on Rental (Legal Person) 10%',                         rate: 10 },
  { key: '20', label: 'WHT on non-resident (Management fee, Technical Service) 14%',  rate: 14 },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Which side these settings belong to. Drives both the endpoint
   *  the dialog talks to and the labels it renders. */
  scope: settingsApi.AccountingScope;
  /** Fired after a successful save so the parent page can refresh
   *  whatever it cached about the toggles. */
  onSaved?: (next: settingsApi.AccountingSettings) => void;
}

/** Renders a small info badge next to a section title. Hover shows
 *  the longer explanation. Used to replace the visible subtitle
 *  paragraphs that used to sit under each section heading — they
 *  pushed the toggles below the fold on a 14" screen for very little
 *  payoff. */
/** Small stylized text badge naming the ABA PayWay payment integration.
 *  Uses the brand's recognised colour pairing (red wordmark + teal wordmark
 *  on a dark navy chip) so operators can identify the tab at a glance.
 *  If you have the official logo asset from ABA's merchant brand pack,
 *  drop it under /public and swap this component for an <img> reference. */
function PayWayBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#0f2a52] text-[10px] font-extrabold tracking-tight leading-none select-none">
      <span className="text-[#e60012]">ABA</span>
      <span className="text-[#14b8b8] ml-0.5">PAYWAY</span>
    </span>
  );
}

function HelpHint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Auto-crop an uploaded KHQR image to just the QR square, dropping
 *  the surrounding red brand frame. We classify a pixel as "QR ink"
 *  when all three RGB channels are below 100 — that catches the QR's
 *  neutral-black squares and the center-mark outline without being
 *  fooled by the saturated red frame (R≥150, G/B≈0). The bounding box
 *  of those pixels is the QR's body; we pad by 4% to preserve the
 *  quiet zone, snap to a square (max(w,h)), and re-encode as PNG.
 *
 *  Falls back to the original on any failure (cross-origin canvas
 *  taint, decode error, image without enough dark pixels). */
async function cropToQrSquare(dataUrl: string): Promise<string> {
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = dataUrl;
  });
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return dataUrl;

  const src = document.createElement('canvas');
  src.width  = W;
  src.height = H;
  const sctx = src.getContext('2d');
  if (!sctx) return dataUrl;
  sctx.drawImage(img, 0, 0);
  const { data } = sctx.getImageData(0, 0, W, H);

  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Skip transparent pixels — a PNG with alpha 0 isn't QR ink.
      if (data[i + 3] < 200) continue;
      // QR ink = neutral-dark. Red frame fails this because its R
      // channel is high while G/B are near zero.
      if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return dataUrl;

  const w = maxX - minX;
  const h = maxY - minY;
  // Padding for the QR quiet zone — without it scanners on some
  // phones miss the corner finder patterns.
  const pad = Math.round(Math.max(w, h) * 0.04);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const size = Math.max(w, h) + pad * 2;
  let sx = Math.round(cx - size / 2);
  let sy = Math.round(cy - size / 2);
  // Bound the crop window inside the source — a centered QR on a
  // tall card can otherwise spill above / below the source image.
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  const sSize = Math.min(size, Math.min(W - sx, H - sy));
  if (sSize < 16) return dataUrl;

  const out = document.createElement('canvas');
  out.width  = sSize;
  out.height = sSize;
  const octx = out.getContext('2d');
  if (!octx) return dataUrl;
  // Fill white first so any padding outside the source ends up as
  // the standard QR quiet-zone color, not transparent.
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, sSize, sSize);
  octx.drawImage(src, sx, sy, sSize, sSize, 0, 0, sSize, sSize);
  return out.toDataURL('image/png');
}

/** "x time ago" formatter — small + dependency-free. Falls back to
 *  the absolute date once we cross a month so the badge doesn't lie
 *  about a year-old timestamp being "x days ago". */
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Per-scope Accountant settings popup. Sale and Purchase each get
 * their own instance (and their own backend row) so toggles and
 * prefixes can diverge — e.g. hide Discount on the Sale form while
 * keeping it on the Bill form. Audit footer shows when and by whom
 * the scope was last updated.
 *
 * <p>Opens with the server-side state, lets the user toggle each
 * flag, then PUTs the lot on Save. Cancel discards in-flight
 * changes — never persists until Save is clicked.</p>
 */
type Section = 'display' | 'numbering' | 'tax' | 'bank' | 'reminders' | 'receipt' | 'slides' | 'currency';

export function AccountingSettingsDialog({ open, onOpenChange, scope, onSaved }: Props) {
  const [draft, setDraft] = useState<settingsApi.AccountingSettings>(() => settingsApi.defaultsFor(scope));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Left-menu navigation. Defaults to Display because that's the
  // toggle row HR touches most often and feels like "general settings".
  const [section, setSection] = useState<Section>('display');
  // Bank-account cards — array so HR can register multiple rails
  // (Bakong, ABA, Wing, USD account, etc.) and the printed invoice
  // shows every one. Lives in localStorage (per tenant + scope);
  // graduates to the backend settings row when the UX is confirmed.
  const [banks, setBanks] = useState<BankAccount[]>([]);
  /** Tab inside the Bank Account section — Manual (uploaded KHRQR PNG)
   *  vs ABA PayWay (dynamic KHRQR minted per transaction). Filters the
   *  card grid + drives the default mode for newly-added cards. */
  const [bankTab, setBankTab] = useState<'manual' | 'auto'>('manual');

  /** v-pos-bankaccount-payway-signposts — tenant-level PayWay status
   *  so the ABA PayWay tab can render a chip
   *  (Not configured / Disabled / Ready) instead of silently
   *  letting the operator save an unusable "auto" bank card. */
  const [paywayStatus, setPaywayStatus] = useState<paywayApi.PayWayCredentials | null>(null);
  const [paywayDialogOpen, setPaywayDialogOpen] = useState(false);
  const refreshPaywayStatus = () => {
    paywayApi.getCredentials()
      .then(setPaywayStatus)
      .catch(() => { /* soft-fail — chip stays hidden */ });
  };
  useEffect(() => {
    if (!open) return;
    refreshPaywayStatus();
  }, [open]);

  /* ----- Currency section (V166) ------------------------------------ */
  // Tenant-wide currency setting — independent from the scoped
  // AccountingSettings row, so it carries its own loaded state, draft,
  // and Save button. Mounted only when section === 'currency'.
  const [currencyPrimary, setCurrencyPrimary] = useState<currencyApi.AllowedCurrency>('USD');
  const [currencySecondary, setCurrencySecondary] = useState<'' | currencyApi.AllowedCurrency>('KHR');
  const [currencyRate, setCurrencyRate] = useState<string>('4100');
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyFetchingRate, setCurrencyFetchingRate] = useState(false);
  // Lazy-load the row the first time the operator opens this section
  // so the dialog mount path stays light for tenants who never visit
  // the Currency tab.
  const [currencyLoaded, setCurrencyLoaded] = useState(false);
  useEffect(() => {
    if (section !== 'currency' || currencyLoaded) return;
    setCurrencyLoading(true);
    currencyApi.get()
      .then(s => {
        setCurrencyPrimary(s.primaryCurrency);
        setCurrencySecondary(s.secondaryCurrency ?? '');
        setCurrencyRate(s.secondaryRate != null ? String(s.secondaryRate) : '');
        setCurrencyLoaded(true);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load currency settings'))
      .finally(() => setCurrencyLoading(false));
  }, [section, currencyLoaded]);
  // Auto-clear secondary if it collides with the new primary so the
  // UI never visually shows USD/USD before the server rejects it.
  useEffect(() => {
    if (currencySecondary && currencySecondary === currencyPrimary) {
      setCurrencySecondary('');
      setCurrencyRate('');
    }
  }, [currencyPrimary, currencySecondary]);
  /** Pull the live FX rate from the public open.er-api.com
   *  aggregator (proxied through our BE so we can swap providers
   *  later without an FE deploy). The endpoint returns
   *  "quote per 1 base" already — same orientation as our
   *  primary→secondary setting — so the value drops straight into
   *  the input with no inversion needed.
   *
   *  <p>Covers every pair the aggregator carries: USD+KHR (which
   *  PayWay's own rate API didn't), USD+KRW, KHR+KRW, USD+JPY, etc.
   *  On any provider error we surface the BE's message verbatim and
   *  the operator falls back to manual entry.</p> */
  const fetchLiveRate = async () => {
    if (currencyFetchingRate) return;
    if (!currencySecondary) {
      toast.error('Pick a secondary currency first.');
      return;
    }
    setCurrencyFetchingRate(true);
    try {
      const live = await currencyApi.getLiveRate(currencyPrimary, currencySecondary);
      const rate = live.rate;
      // Two-decimal precision for big quotes (KHR ~ 4000) and 6
      // decimals for sub-unit rates (e.g. KHR → USD ~ 0.000244).
      setCurrencyRate(rate >= 100 ? rate.toFixed(2) : rate.toFixed(6));
      toast.success(`Live rate applied (${live.source}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fetch live rate');
    } finally {
      setCurrencyFetchingRate(false);
    }
  };

  const saveCurrencySettings = async () => {
    if (currencySaving) return;
    const sec = currencySecondary === '' ? null : currencySecondary;
    const parsedRate = currencyRate.trim() === '' ? null : Number(currencyRate);
    if (sec && (parsedRate === null || !Number.isFinite(parsedRate) || parsedRate <= 0)) {
      toast.error('Enter a positive conversion rate, or remove the secondary currency.');
      return;
    }
    setCurrencySaving(true);
    try {
      await currencyApi.save({
        primaryCurrency: currencyPrimary,
        secondaryCurrency: sec,
        secondaryRate: sec ? parsedRate : null,
      });
      toast.success('Currency settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save currency settings');
    } finally {
      setCurrencySaving(false);
    }
  };

  const isReceipt = scope === 'receipt';
  // Quotation / Voucher are single-document scopes too — they only
  // render the first prefix slot (and skip the multi-kind labels)
  // exactly like Receipt does. Grouping them under one flag keeps
  // the render branches readable.
  const isSingleKind = scope === 'receipt' || scope === 'quotation' || scope === 'voucher' || scope === 'hospital';
  const title = scope === 'sale'      ? 'Invoice Settings'
              : scope === 'purchase'  ? 'Bill Settings'
              : scope === 'receipt'   ? 'Expense Settings'
              : scope === 'quotation' ? 'Quotation Settings'
              : scope === 'pos'       ? 'POS Settings'
              : scope === 'hospital'  ? 'Encounter Settings'
              :                         'Voucher Settings';
  const sideLabel = scope === 'sale'      ? 'Invoice'
                  : scope === 'purchase'  ? 'Bill'
                  : scope === 'receipt'   ? 'Expense'
                  : scope === 'quotation' ? 'Quotation'
                  : scope === 'pos'       ? 'POS'
                  : scope === 'hospital'  ? 'Encounter'
                  :                         'Voucher';
  const prefixLabels = scope === 'sale'
    ? { commercial: 'Invoice',   tax: 'Tax Invoice', creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'purchase'
    ? { commercial: 'Bill',      tax: 'Tax Bill',    creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'receipt'
    ? { commercial: 'Expense',   tax: '',            creditNote: '',            debitNote: '' }
    : scope === 'quotation'
    ? { commercial: 'Quotation', tax: '',            creditNote: '',            debitNote: '' }
    // POS — 'commercial' = counter-receipt, 'tax' = tax receipt,
    // 'creditNote' slot repurposed to carry the queue-number prefix
    // ("POSQ" → POSQ-042). 'debitNote' slot is unused.
    : scope === 'pos'
    ? { commercial: 'POS Receipt', tax: 'POS Tax',    creditNote: 'Queue (Q-no)', debitNote: '' }
    // Hospital — single-kind: Invoice No (V183 / v-hospital-settings-parity
    // + v-hospital-encounters-invoice-labels). The prefix drives the
    // number InvoiceService.nextInvoiceNo mints for KIND_MEDICAL,
    // replacing the legacy hardcoded 'MED'. Labelled "Invoice No" per
    // 2026-07-07 UX — operators think of the encounter's mint as an
    // invoice number even though the underlying kind is 'medical'.
    : scope === 'hospital'
    ? { commercial: 'Invoice No',  tax: '',           creditNote: '',            debitNote: '' }
    : { commercial: 'Voucher',   tax: '',            creditNote: '',            debitNote: '' };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    settingsApi.get(scope)
      .then(s => { if (!cancelled) setDraft(s); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => { if (!cancelled) setLoading(false); });
    setBanks(loadBankAccounts(scope));
    return () => { cancelled = true; };
  }, [open, scope]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await settingsApi.update(scope, draft);
      setDraft(saved); // pick up server-stamped updatedAt + updatedByEmail
      // Bank info is browser-local for now — save alongside the
      // server-persisted settings so a single Save click commits both.
      saveBankAccounts(scope, banks);
      toast.success(`${sideLabel} settings saved`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  /** Patch a single bank card by id — keeps the rest of the array
   *  untouched so editing one card doesn't reset siblings. */
  const updateBank = (id: string, patch: Partial<BankAccount>) => {
    setBanks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };
  const addBank = () => {
    // Seed the new card's mode from whichever Bank Account tab the
    // operator is on — manual cards live in the Manual tab, auto in
    // the ABA PayWay tab. Without this, "Add" from the ABA tab would
    // create a card in the wrong list.
    setBanks(prev => [...prev, { ...EMPTY_BANK_ACCOUNT, id: newBankAccountId(), mode: bankTab }]);
  };
  const removeBank = (id: string) => {
    setBanks(prev => prev.filter(b => b.id !== id));
  };

  /** Read a file as a base64 data URL so the KHRQR survives a page
   *  reload (localStorage can't hold a blob). Caps at 1 MB — QR PNGs are
   *  ~30 KB; anything bigger is almost certainly a wrong file.
   *
   *  After load we auto-crop to the QR square — see {@link cropToQrSquare} —
   *  so the saved image is just the QR pattern, not the surrounding red
   *  KHQR brand frame. The print template wraps it in its own
   *  bank-name / account-number layout, so a second branded frame
   *  inside ours would look amateur. */
  const handleQrUpload = (id: string, file: File) => {
    if (file.size > 1024 * 1024) {
      toast.error('Image too large — keep KHRQR under 1 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files (PNG / JPG) are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result || '');
      if (!raw) {
        toast.error('Could not read image');
        return;
      }
      try {
        const cropped = await cropToQrSquare(raw);
        updateBank(id, { qrDataUrl: cropped });
      } catch {
        // Cropping is opportunistic — if anything fails (canvas
        // tainted, image decode error, …) fall through to the
        // original so the operator still sees their upload.
        updateBank(id, { qrDataUrl: raw });
      }
    };
    reader.onerror = () => toast.error('Could not read image');
    reader.readAsDataURL(file);
  };

  // Each setting renders as label + hover-hint instead of label +
  // visible subtitle. The two-line subtitle pattern pushed Auto-send
  // + Reminders off the visible area on a 14" screen; condensing to
  // one line per row keeps the whole sale-side settings list in view.
  const toggleRow = (
    label: string,
    description: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <Label className="text-sm font-medium inline-flex items-center gap-1.5">
        {label}
        <HelpHint>{description}</HelpHint>
      </Label>
      <Switch checked={value} onCheckedChange={onChange} disabled={loading || saving} />
    </div>
  );

  const prefixRow = (
    label: string,
    field: 'prefixCommercial' | 'prefixTax' | 'prefixCreditNote' | 'prefixDebitNote',
  ) => (
    <div className="grid grid-cols-[1fr_120px] items-center gap-3">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Input
        value={draft[field]}
        onChange={e => setDraft({ ...draft, [field]: e.target.value.toUpperCase() })}
        disabled={loading || saving}
        maxLength={16}
        className="tabular-nums text-sm h-8"
        placeholder={settingsApi.defaultsFor(scope)[field]}
      />
    </div>
  );

  // Left-menu items. Each one toggles the body, no scroll-jumping.
  // Bank Account is gated to Sale (Invoice) for now — that's where HR
  // asked for it; we can extend to Bills / Receipts once the UX lands.
  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'display',   label: 'Display',     hint: 'What shows on the form & PDF', icon: <Eye className="h-4 w-4" /> },
    // Numbering — Hospital reads it too (v-hospital-settings-parity):
    // the prefix in the Medical Bill (MED-YYYY-#####) is now tenant-
    // configurable via prefixCommercial on the hospital-scope row.
    { key: 'numbering' as Section, label: 'Numbering', hint: 'Document number prefixes', icon: <Hash className="h-4 w-4" /> },
    // Tax types section — hidden on POS (fixed 2-kind receipts) and
    // Hospital (encounters don't carry a tax matrix yet). Sale / Bill
    // / Receipt / Quotation / Voucher keep it.
    ...(scope !== 'pos' && scope !== 'hospital' ? [
      { key: 'tax' as Section, label: 'Tax types', hint: 'Patterns in the Tax dropdown', icon: <ReceiptIcon className="h-4 w-4" /> },
    ] : []),
    ...(scope === 'sale' ? [
      { key: 'reminders' as Section, label: 'Reminders', hint: 'Telegram pings: before due, after due, paid', icon: <BellRing className="h-4 w-4" /> },
      { key: 'bank' as Section, label: 'Bank Account', hint: 'Payment info + KHRQR printed on the invoice', icon: <Landmark className="h-4 w-4" /> },
    ] : []),
    // POS-only "Receipt" section — controls what prints on the
    // counter-checkout receipt (PAID stamp, SKU prefix, paper size,
    // shop name) plus the auto-print-on-checkout behaviour. POS also
    // gets the Bank Account section so the cashier can show a KHQR
    // for "scan to pay" at checkout.
    ...(scope === 'pos' ? [
      { key: 'receipt' as Section, label: 'Receipt', hint: 'Print layout: PAID stamp, SKU, paper size', icon: <Printer className="h-4 w-4" /> },
      { key: 'bank' as Section, label: 'Bank Account', hint: 'KHRQR + bank details for scan-to-pay at checkout', icon: <Landmark className="h-4 w-4" /> },
      { key: 'slides' as Section, label: 'Display Ads', hint: 'Carousel shown on the customer screen when idle', icon: <MonitorPlay className="h-4 w-4" /> },
    ] : []),
    // Currency picker (V166). Tenant-wide setting — appears on every
    // transactional scope (sale, pos, quotation, voucher, purchase,
    // receipt) so the operator can flip the active pair (USD+KHR /
    // USD+KRW / single) from whichever module they're working in.
    // All six open the same backing row; the section reads/writes
    // via currencyApi.
    ...(scope === 'sale' || scope === 'pos' || scope === 'quotation' || scope === 'voucher' || scope === 'purchase' || scope === 'receipt' || scope === 'hospital' ? [
      { key: 'currency' as Section, label: 'Currency', hint: 'Active currency pair + conversion rate', icon: <Coins className="h-4 w-4" /> },
    ] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {/* Description kept for Radix accessibility but hidden —
              the title alone is clear enough and the long paragraph
              clutters the popup. */}
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>

        {/* Split body: left sidebar (section menu) + right pane (active
            section content). Mirrors the broader Settings page so the
            popup feels like the same surface. */}
        <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
          <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
            {/* v-settings-menu-tooltip — hint on hover, labels stay single-line. */}
            <TooltipProvider delayDuration={200}>
              {menu.map(m => {
                const active = section === m.key;
                return (
                  <Tooltip key={m.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSection(m.key)}
                        className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 transition-colors flex items-center gap-2 ${
                          active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-700 hover:bg-white'
                        }`}
                      >
                        <span className={active ? 'text-blue-600' : 'text-gray-500'}>{m.icon}</span>
                        <span className="flex-1 min-w-0 text-sm font-medium truncate">{m.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      {m.hint}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </aside>

          <div className="overflow-y-auto p-6 space-y-4">
            {section === 'display' && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold mb-1">Display</h3>
                {/* Hospital keeps Show Notes (encounter has a notes
                    field), plus Show Approver(s). Terms / Discount /
                    Tax stay hidden — encounter form has no such
                    inputs yet. */}
                {toggleRow('Show Notes', 'Internal memo field on the form (not printed).',
                  draft.showNotes, v => setDraft({ ...draft, showNotes: v }))}
                {!isReceipt && scope !== 'hospital' && toggleRow('Show Terms & Conditions', 'Customer-facing terms printed at the bottom.',
                  draft.showTerms, v => setDraft({ ...draft, showTerms: v }))}
                {!isReceipt && scope !== 'hospital' && toggleRow('Show Discount', 'Discount input (amount or percent) + line in the totals.',
                  draft.showDiscount, v => setDraft({ ...draft, showDiscount: v }))}
                {!isReceipt && scope !== 'hospital' && toggleRow('Show Tax', 'Taxation dropdown + tax line in the totals.',
                  draft.showTax, v => setDraft({ ...draft, showTax: v }))}
                {/* Sale-only for now — Invoice is the only doc whose
                    form fires the Telegram send on save. Other
                    scopes carry the column but the UI doesn't
                    expose the toggle until they hook into the
                    auto-send flow. */}
                {scope === 'sale' && toggleRow(
                  'Auto-send via Telegram on save',
                  'After Save, immediately push the invoice to the customer\'s Telegram chat (if linked). Off by default.',
                  draft.autoSendTelegram,
                  v => setDraft({ ...draft, autoSendTelegram: v }),
                )}
                {scope === 'sale' && toggleRow(
                  'Issue Invoice on save',
                  'After Save & Close, automatically move the invoice from Draft to Issued (Progress). Off by default — invoices stay as Draft until you click Issue manually.',
                  draft.autoIssue,
                  v => setDraft({ ...draft, autoIssue: v }),
                )}
                {/* Approval picker — Quotation / Voucher / Bill /
                    Receipt (V175). Off by default so existing tenants'
                    forms don't grow a picker on the next deploy. When
                    on, the create dialog shows up-to-three approver
                    slots (manual-assign chain). POS + Sale opt out
                    for now — checkout is time-critical and the Sale
                    Invoice already has its own workflow. */}
                {(scope === 'quotation' || scope === 'voucher' ||
                  scope === 'purchase' || scope === 'receipt' ||
                  scope === 'hospital') && (
                  <>
                    {toggleRow(
                      'Show Approver(s)',
                      'Show the Approvers picker on the create form so this document can be routed for sign-off (manual-assign chain). Off by default — leave off to skip approval entirely.',
                      draft.showApproval,
                      v => setDraft({ ...draft, showApproval: v }),
                    )}
                    {/* Slot-count selector — only meaningful when the
                        toggle is on. Renders inset so the pair reads
                        as one setting. V180. */}
                    {draft.showApproval && (
                      <div className="flex items-center justify-between gap-4 py-1.5 pl-6">
                        <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                          Number of approvers
                          <HelpHint>How many approver slots the create form exposes. Each slot is optional at document create time; picks are always ordered.</HelpHint>
                        </Label>
                        <Select
                          value={String(draft.approverCount ?? 3)}
                          onValueChange={(v) => setDraft({ ...draft, approverCount: Number(v) })}
                          disabled={loading || saving}
                        >
                          <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Reminders — sale-scope only. Promoted from a nested
                block inside Display to its own left-menu section so
                the cadence + repeat config has breathing room. */}
            {section === 'reminders' && scope === 'sale' && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold mb-1 inline-flex items-center gap-1.5">
                  Reminders
                  <HelpHint>Telegram pings to the customer. Skipped silently when the customer hasn't linked yet.</HelpHint>
                </h3>

                {toggleRow(
                  'Before Due Date',
                  'Send a "due soon" ping ahead of the due date.',
                  draft.reminderBeforeDueEnabled,
                  v => setDraft({ ...draft, reminderBeforeDueEnabled: v }),
                )}
                {draft.reminderBeforeDueEnabled && (
                  <div className="ml-1 mb-2 flex items-center gap-2 text-xs text-gray-600">
                    <span>Send</span>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={draft.reminderBeforeDueDays}
                      onChange={e => {
                        const n = parseInt(e.target.value, 10);
                        setDraft({
                          ...draft,
                          reminderBeforeDueDays: Number.isFinite(n) ? Math.max(0, Math.min(365, n)) : 1,
                        });
                      }}
                      disabled={loading || saving}
                      className="h-7 w-16 text-sm"
                    />
                    <span>day(s) before due date.</span>
                  </div>
                )}

                {toggleRow(
                  'After Due Date',
                  'Send a reminder when the invoice is past due and still unpaid.',
                  draft.reminderAfterDueEnabled,
                  v => setDraft({ ...draft, reminderAfterDueEnabled: v }),
                )}
                {draft.reminderAfterDueEnabled && (
                  <div className="ml-1 mb-2 space-y-1">
                    {toggleRow(
                      'Repeat',
                      'Off: send once. On: keep re-sending on the cadence below until the invoice settles.',
                      draft.reminderAfterDueRepeat,
                      v => setDraft({ ...draft, reminderAfterDueRepeat: v }),
                    )}
                    {draft.reminderAfterDueRepeat && (
                      <div className="ml-1 flex items-center gap-3 text-xs text-gray-600">
                        <span>Frequency:</span>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="afterDueFreq"
                            value="daily"
                            checked={draft.reminderAfterDueFrequency === 'daily'}
                            onChange={() => setDraft({ ...draft, reminderAfterDueFrequency: 'daily' })}
                            disabled={loading || saving}
                          />
                          Daily
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="afterDueFreq"
                            value="weekly"
                            checked={draft.reminderAfterDueFrequency === 'weekly'}
                            onChange={() => setDraft({ ...draft, reminderAfterDueFrequency: 'weekly' })}
                            disabled={loading || saving}
                          />
                          Weekly
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {toggleRow(
                  'Paid Reminder',
                  'Send a "payment received" thank-you message when the invoice is fully paid.',
                  draft.reminderPaidEnabled,
                  v => setDraft({ ...draft, reminderPaidEnabled: v }),
                )}

                {/* V129. Shared message body for all three reminder
                    branches. Placeholders substituted server-side
                    before the AI-Agent dispatch — unknown tokens pass
                    through unchanged. */}
                <div className="mt-4 pt-3 border-t">
                  <Label className="text-sm font-semibold inline-flex items-center gap-1.5">
                    Message Template
                    <HelpHint>
                      Used for all three reminders. Leave any placeholder out to drop that field.
                      Available: <code>{'{invoiceNo}'}</code>, <code>{'{amount}'}</code>,{' '}
                      <code>{'{customerName}'}</code>, <code>{'{dueDate}'}</code>.
                    </HelpHint>
                  </Label>
                  <textarea
                    value={draft.reminderTemplate}
                    onChange={e => setDraft({ ...draft, reminderTemplate: e.target.value })}
                    disabled={loading || saving}
                    rows={4}
                    maxLength={4096}
                    placeholder="Hi {customerName}, this is a reminder for invoice {invoiceNo} ({amount}) due on {dueDate}."
                    className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Tokens like <code>{'{invoiceNo}'}</code> are replaced when the message is sent.
                  </p>
                </div>

                {toggleRow(
                  'Resend Invoice',
                  'Along with the reminder text above, push the invoice details (number, customer, due date, total) as a second message — saves the customer scrolling back.',
                  draft.reminderResendInvoice,
                  v => setDraft({ ...draft, reminderResendInvoice: v }),
                )}
              </div>
            )}

            {/* POS Receipt section (V133). Surfaces the layout +
                behaviour controls the counter receipt obeys at print
                time — PAID stamp, SKU prefix, paper size, auto-print
                on checkout, and the shop name printed in the header. */}
            {section === 'receipt' && scope === 'pos' && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold mb-1 inline-flex items-center gap-1.5">
                  Receipt
                  <HelpHint>Controls the layout and print behaviour of the POS receipt.</HelpHint>
                </h3>

                {/* V138 — logo image. Drag-drop or click to browse;
                    stored as a base64 data URL on the settings row so
                    it round-trips with the rest of the receipt prefs. */}
                <div className="space-y-1.5 mb-3">
                  <Label className="text-xs text-gray-600">Logo on receipt</Label>
                  <ImageDropZone
                    value={draft.posLogoUrl}
                    onChange={v => setDraft({ ...draft, posLogoUrl: v })}
                    hint="PNG / JPG · prints centered above the shop name"
                    height={100}
                    disabled={loading || saving}
                  />
                </div>

                <div className="space-y-1.5 mb-3">
                  <Label className="text-xs text-gray-600">Shop name on receipt</Label>
                  <Input
                    value={draft.posShopName ?? ''}
                    onChange={e => setDraft({ ...draft, posShopName: e.target.value })}
                    placeholder="Leave blank to use your company name"
                    maxLength={255}
                  />
                </div>

                {toggleRow(
                  'Show PAID stamp',
                  'Print a "PAID" mark on the receipt after the sale completes.',
                  draft.posShowPaidStamp,
                  v => setDraft({ ...draft, posShowPaidStamp: v }),
                )}
                {toggleRow(
                  'Auto-print on checkout',
                  'Open the browser print dialog automatically as soon as payment is confirmed.',
                  draft.posAutoPrint,
                  v => setDraft({ ...draft, posAutoPrint: v }),
                )}
                {toggleRow(
                  'Show SKU prefix',
                  'Print each item\'s SKU code in front of the name (e.g. "15-453574  Men\'s shirt").',
                  draft.posShowSku,
                  v => setDraft({ ...draft, posShowSku: v }),
                )}
                {toggleRow(
                  'Show Queue / Order No.',
                  'Print "#001" on the receipt so customers can match their slip with the order pickup.',
                  draft.posShowQueueNo,
                  v => setDraft({ ...draft, posShowQueueNo: v }),
                )}

                <div className="space-y-1.5 mt-3">
                  <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                    Paper size
                    <HelpHint>
                      Thermal 80mm = standard POS hardware. A4 / A5 / A6 use the
                      desktop printer's @page rule so margins fit the chosen sheet.
                    </HelpHint>
                  </Label>
                  <select
                    value={draft.posPaperSize}
                    onChange={e => setDraft({ ...draft, posPaperSize: e.target.value as settingsApi.AccountingSettings['posPaperSize'] })}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={loading || saving}
                  >
                    <option value="thermal_80">Thermal 80mm (POS roll)</option>
                    <option value="a6">A6 (105 × 148mm)</option>
                    <option value="a5">A5 (148 × 210mm)</option>
                    <option value="a4">A4 (210 × 297mm)</option>
                  </select>
                </div>

                {/* V141 — exchange rate. New POS orders snapshot
                    this value into pos_orders.exchange_rate at create
                    time; the receipt prints "Total (KHR)" = Total USD
                    × this rate, plus a separate "@ rate" line for
                    transparency. */}
                <div className="space-y-1.5 mt-3">
                  <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                    Exchange rate (USD → KHR)
                    <HelpHint>
                      Used on the receipt to print the KHR equivalent next to the USD total.
                      New POS orders snapshot this value at create time so a later rate change
                      doesn't rewrite historic receipts.
                    </HelpHint>
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={draft.posExchangeRate}
                    onChange={e => {
                      const n = parseFloat(e.target.value);
                      setDraft({ ...draft, posExchangeRate: Number.isFinite(n) && n > 0 ? n : draft.posExchangeRate });
                    }}
                    disabled={loading || saving}
                    className="tabular-nums text-sm h-8"
                  />
                  <p className="text-[11px] text-gray-500">
                    Example: <code>4100</code> means $1.00 prints as ៛ 4,100.
                  </p>
                </div>
              </div>
            )}

            {/* V143 — POS customer-display ads carousel. Toggle +
                media editor. The carousel shows up on the customer
                screen when the cart is empty; an active sale snaps
                the display back to the live order view. */}
            {section === 'slides' && scope === 'pos' && (
              <PosSlidesEditor
                enabled={draft.posSlideEnabled}
                onEnabledChange={v => setDraft({ ...draft, posSlideEnabled: v })}
                rawMedia={draft.posSlideMedia}
                onMediaChange={raw => setDraft({ ...draft, posSlideMedia: raw })}
                disabled={loading || saving}
              />
            )}

            {section === 'numbering' && (() => {
              // Live preview of the format the next save will mint —
              // shows the operator exactly what shape they're choosing.
              const today = new Date();
              const dd = String(today.getDate()).padStart(2, '0');
              const mm = String(today.getMonth() + 1).padStart(2, '0');
              const yyyy = String(today.getFullYear());
              const dateStr = draft.numberDateFormat === 'DDMMYYYY' ? `${dd}${mm}${yyyy}`
                           : draft.numberDateFormat === 'MMYYYY'   ? `${mm}${yyyy}`
                           :                                          yyyy;
              const seqWidth = Math.max(2, Math.min(6, draft.numberSeqWidth || 3));
              const seqExample = '1'.padStart(seqWidth, '0');
              const previewNo = `${draft.prefixCommercial || 'INV'}-${dateStr}-${seqExample}`;
              return (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                  Document numbering
                  <HelpHint>
                    Drives the auto-generated {sideLabel.toLowerCase()} number on save —
                    {' '}&lt;prefix&gt;-&lt;date&gt;-&lt;seq&gt;. The sequence resets per date bucket
                    (daily under DDMMYYYY, monthly under MMYYYY, yearly under YYYY).
                  </HelpHint>
                </h3>
                {/* Prefixes first — they're the field HR actually
                 *  changes day to day; the date format / sequence
                 *  width are set once per tenant and rarely touched.
                 *  POS collapses to ONE field — the queue prefix —
                 *  since both invoice kinds (commercial / tax) on
                 *  a POS sale share the same counter, and the queue
                 *  number itself is the only thing the cashier sees
                 *  on the receipt. */}
                {scope === 'pos' ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {prefixRow('Prefix', 'prefixCreditNote')}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Stored as <code>PREFIX-DDMMYYYY-###</code> · printed on the receipt as just <code>###</code>.
                    </p>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {prefixRow(prefixLabels.commercial, 'prefixCommercial')}
                    {!isSingleKind && prefixRow(prefixLabels.tax,        'prefixTax')}
                    {!isSingleKind && prefixRow(prefixLabels.creditNote, 'prefixCreditNote')}
                    {!isSingleKind && prefixRow(prefixLabels.debitNote,  'prefixDebitNote')}
                  </div>
                )}
                {/* Format controls — shared across all four doc kinds
                 *  in this scope. Date dropdown drives the middle
                 *  segment, seq dropdown drives the trailing pad width.
                 *  Preview below updates live so HR sees the exact
                 *  shape they're committing to. */}
                {scope === 'sale' && (
                  <div className="grid grid-cols-[1fr_1fr] gap-3 pt-3 mt-1 border-t">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                        Date format
                        <HelpHint>
                          DDMMYYYY = full date (resets daily). MMYYYY = month + year
                          (resets monthly). YYYY = just the year (resets annually).
                        </HelpHint>
                      </Label>
                      <select
                        value={draft.numberDateFormat}
                        onChange={e => setDraft({ ...draft, numberDateFormat: e.target.value as 'DDMMYYYY' | 'MMYYYY' | 'YYYY' })}
                        disabled={loading || saving}
                        className="w-full h-8 text-sm border rounded-md px-2 bg-white"
                      >
                        <option value="DDMMYYYY">DDMMYYYY</option>
                        <option value="MMYYYY">MMYYYY</option>
                        <option value="YYYY">YYYY</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                        Sequence width
                        <HelpHint>
                          Zero-padding on the running counter — wider keeps numbers
                          aligned in lists but doesn't change the actual count.
                        </HelpHint>
                      </Label>
                      <select
                        value={draft.numberSeqWidth}
                        onChange={e => setDraft({ ...draft, numberSeqWidth: parseInt(e.target.value, 10) || 3 })}
                        disabled={loading || saving}
                        className="w-full h-8 text-sm border rounded-md px-2 bg-white"
                      >
                        <option value={2}>## (2 digits)</option>
                        <option value={3}>### (3 digits)</option>
                        <option value={4}>#### (4 digits)</option>
                      </select>
                    </div>
                    <div className="col-span-2 -mt-1 text-[11px] text-gray-500">
                      Next number example: <code className="tabular-nums text-gray-700">{previewNo}</code>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {section === 'bank' && (() => {
              // "Show on invoice" cap — the printed footer only has
              // room for two QR cards side by side. We disable the
              // checkbox on the rest once the cap is reached so the
              // operator can't silently overflow the layout. The cap
              // is GLOBAL across both tabs.
              const shownCount = banks.filter(b => b.showOnInvoice).length;
              const atCap = shownCount >= MAX_BANK_ACCOUNTS_ON_INVOICE;
              // Per-tab counts for the tab labels.
              const manualCount = banks.filter(b => (b.mode ?? 'manual') === 'manual').length;
              const autoCount   = banks.filter(b => b.mode === 'auto').length;
              const visibleBanks = banks.filter(b => (b.mode ?? 'manual') === bankTab);
              return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                    Bank Account
                    <HelpHint>
                      Up to <strong>{MAX_BANK_ACCOUNTS_ON_INVOICE}</strong> bank accounts can show on the printed
                      invoice — tick <em>Show on invoice</em> on the ones you want printed.
                    </HelpHint>
                    {/* Live counter stays visible — it's dynamic state,
                        not a static explanation, so the operator can
                        see at a glance how close they are to the cap
                        without hovering. */}
                    <span className="text-[11px] font-normal text-gray-400">
                      ({shownCount}/{MAX_BANK_ACCOUNTS_ON_INVOICE} selected)
                    </span>
                  </h3>
                  {/* Add button only on the Manual tab — the ABA PayWay
                      tab needs no card at all (credentials live in
                      Settings → PayWay), so the button would just
                      misdirect the operator. */}
                  {bankTab === 'manual' && (
                    <Button size="sm" onClick={addBank} disabled={loading || saving} className="shrink-0">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Manual Bank
                    </Button>
                  )}
                </div>

                {/* Section-level tabs: Manual cards (uploaded PNG QR)
                    vs ABA PayWay (POS asks PayWay to mint a per-sale
                    KHRQR with the cart amount baked in). The tab is
                    the mode — cards saved in one tab don't show in the
                    other, and `Add` seeds the new card's mode from
                    whichever tab is active. */}
                <div className="inline-flex rounded-md border bg-gray-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBankTab('manual')}
                    className={`px-3 py-1.5 rounded font-medium transition ${
                      bankTab === 'manual'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Manual <span className="text-[10px] opacity-70 ml-1">({manualCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBankTab('auto')}
                    className={`px-2.5 py-1 rounded font-medium transition inline-flex items-center gap-1.5 ${
                      bankTab === 'auto'
                        ? 'bg-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    aria-label="ABA PayWay"
                  >
                    <PayWayBadge />
                    <span className="text-[10px] opacity-70">({autoCount})</span>
                  </button>
                </div>

                {bankTab === 'auto' && (() => {
                  const configured = paywayStatus?.configured ?? false;
                  const enabled    = paywayStatus?.enabled ?? false;
                  const chip = !configured
                    ? { text: 'Not configured', cls: 'bg-amber-100 text-amber-800 border-amber-300' }
                    : !enabled
                      ? { text: 'Configured but disabled', cls: 'bg-rose-100 text-rose-800 border-rose-300' }
                      : { text: `Ready · ${paywayStatus?.environment ?? ''}`, cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
                  return (
                    <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${chip.cls}`}>
                          {chip.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPaywayDialogOpen(true)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2"
                        >
                          Open Settings → PayWay
                        </button>
                      </div>
                      <p>
                        ABA PayWay mints a fresh KHRQR per transaction with the cart amount baked in — no image
                        upload needed. Set Merchant ID + API key + toggle <strong>Enabled</strong> in the PayWay
                        settings dialog; the card below is just for the account name / number that appears next
                        to the QR on the checkout screen.
                      </p>
                    </div>
                  );
                })()}

                {/* Empty-state CTA only on the Manual tab. On the ABA
                    PayWay tab the explanatory banner above is the
                    operator's full instruction — no further action
                    happens here. */}
                {bankTab === 'manual' && visibleBanks.length === 0 && (
                  <div className="border-2 border-dashed rounded-md py-10 text-center text-sm text-gray-500">
                    No manual bank accounts yet — click <strong>Add Manual Bank</strong> to start.
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {visibleBanks.map(b => {
                    const checked = !!b.showOnInvoice;
                    const mode = b.mode ?? 'manual';
                    // Disable the toggle on the rows that *aren't*
                    // already checked once we hit the cap. Already-
                    // checked rows stay enabled so the user can
                    // un-check to free up a slot.
                    const disableShowOnInvoice = !checked && atCap;
                    return (
                    <div key={b.id} className={`border rounded-lg p-2 bg-white space-y-1.5 relative ${
                      checked ? 'ring-2 ring-blue-200 border-blue-300' : ''
                    }`}>
                      <label className={`flex items-center gap-2 text-[11px] ${
                        disableShowOnInvoice ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'
                      }`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableShowOnInvoice || loading || saving}
                          onChange={e => updateBank(b.id, { showOnInvoice: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-medium">Show on invoice</span>
                        {disableShowOnInvoice && (
                          <span className="text-[10px] text-gray-400">(limit {MAX_BANK_ACCOUNTS_ON_INVOICE} reached)</span>
                        )}
                      </label>

                      {/* Image area — only when mode='manual'. In
                       *  'auto' mode we show a "PayWay will mint a
                       *  dynamic QR per sale" hint instead so the
                       *  operator knows nothing needs uploading. */}
                      {mode === 'auto' ? (
                        <div className="flex flex-col items-center justify-center gap-1 w-full aspect-square border-2 border-dashed border-blue-200 rounded-md text-blue-700 bg-blue-50/40 text-center px-2">
                          <span className="text-[11px] font-medium">Auto KHRQR</span>
                          <span className="text-[9px] text-blue-600/80 leading-tight">
                            PayWay mints the QR per transaction with the cart amount baked in.
                          </span>
                        </div>
                      ) : b.qrDataUrl ? (
                        <div className="relative">
                          <img
                            src={b.qrDataUrl}
                            alt="KHRQR"
                            className="w-full aspect-square object-contain bg-gray-50 rounded-md border"
                          />
                          <label className="absolute bottom-1 right-1 inline-flex">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleQrUpload(b.id, f);
                                e.target.value = '';
                              }}
                            />
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-white/95 border rounded-md cursor-pointer hover:bg-gray-50">
                              <Upload className="h-3 w-3" /> Replace
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => updateBank(b.id, { qrDataUrl: '' })}
                            className="absolute top-1 right-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/95 border text-red-600 hover:bg-red-50"
                            title="Remove image"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleQrUpload(b.id, f);
                              e.target.value = '';
                            }}
                          />
                          <span className="flex flex-col items-center justify-center gap-1 w-full aspect-square border-2 border-dashed rounded-md text-gray-500 cursor-pointer hover:bg-gray-50">
                            <Upload className="h-5 w-5" />
                            <span className="text-xs">Upload KHRQR</span>
                            <span className="text-[10px]">PNG / JPG, &lt; 1 MB</span>
                          </span>
                        </label>
                      )}

                      {/* Account name + number live under the image,
                       *  matching the printed card layout. Bank name +
                       *  notes are secondary; tuck them below in small
                       *  caps so they stay editable without dominating.
                       *
                       *  Length caps mirror what fits on the printed
                       *  KHQR card without overflowing — operators
                       *  hit the cap and naturally use shorter labels
                       *  instead of getting a clipped print later. */}
                      <div className="space-y-1.5">
                        <Input
                          value={b.accountName}
                          onChange={e => updateBank(b.id, { accountName: e.target.value })}
                          placeholder="Account name"
                          disabled={loading || saving}
                          maxLength={25}
                          className="text-sm font-medium"
                        />
                        <Input
                          value={b.accountNumber}
                          onChange={e => {
                            // Account No. is digits + dash only — strip
                            // anything else inline so a paste from a
                            // copy of "ABA: 0012-345-678" doesn't carry
                            // letters into the printed card.
                            const cleaned = e.target.value.replace(/[^0-9-]/g, '').slice(0, 9);
                            updateBank(b.id, { accountNumber: cleaned });
                          }}
                          placeholder="Account number"
                          disabled={loading || saving}
                          inputMode="numeric"
                          maxLength={9}
                          className="text-sm tabular-nums"
                        />
                        <Input
                          value={b.bankName}
                          onChange={e => updateBank(b.id, { bankName: e.target.value })}
                          placeholder="Bank name (e.g. ABA)"
                          disabled={loading || saving}
                          maxLength={15}
                          className="text-xs h-8"
                        />
                        <Input
                          value={b.notes}
                          onChange={e => updateBank(b.id, { notes: e.target.value })}
                          placeholder="Notes (branch, SWIFT…)"
                          disabled={loading || saving}
                          maxLength={20}
                          className="text-xs h-8"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeBank(b.id)}
                        className="absolute -top-2 -right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-red-200 text-red-600 hover:bg-red-50 shadow-sm"
                        title="Delete this bank account"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                  })}
                </div>

                <p className="text-[11px] text-gray-500">
                  Stored in your browser for now — set them once on the machine that prints invoices.
                </p>
              </div>
              );
            })()}

            {section === 'tax' && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                  Tax types
                  <HelpHint>
                    Click to enable or disable. Disabled patterns won't appear in the Taxation dropdown.
                  </HelpHint>
                </h3>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(isReceipt ? RECEIPT_TAX_TYPES : SALE_PURCHASE_TAX_TYPES).map(t => {
                    const on = draft.taxTypesEnabled.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        disabled={loading || saving}
                        onClick={() => setDraft({
                          ...draft,
                          taxTypesEnabled: on
                            ? draft.taxTypesEnabled.filter(k => k !== t.key)
                            : [...draft.taxTypesEnabled, t.key],
                        })}
                        className={`px-2.5 py-0.5 rounded-full border tabular-nums text-xs transition-colors ${
                          on
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : 'bg-white text-gray-400 border-gray-200 line-through hover:bg-gray-50'
                        }`}
                        title={on ? 'Click to disable' : 'Click to enable'}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {section === 'currency' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                  Currency
                  <HelpHint>
                    Tenant-wide setting. Drives the Currency dropdown on every Invoice / POS / Quotation / Voucher form
                    plus totals on receipts. It is Max two currencies.
                  </HelpHint>
                </h3>

                {currencyLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-600">Primary currency</Label>
                        <select
                          value={currencyPrimary}
                          onChange={e => setCurrencyPrimary(e.target.value as currencyApi.AllowedCurrency)}
                          className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                          disabled={currencySaving}
                        >
                          {currencyApi.ALLOWED_CURRENCIES.map(c => (
                            <option key={c} value={c}>{currencyApi.currencyLabel(c)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-600">Secondary (optional)</Label>
                        <select
                          value={currencySecondary === '' ? '__none' : currencySecondary}
                          onChange={e => {
                            const v = e.target.value === '__none'
                              ? ''
                              : e.target.value as currencyApi.AllowedCurrency;
                            setCurrencySecondary(v);
                            // Picking "None" makes the rate meaningless — clear
                            // it inline so the underlying state matches the
                            // (now-hidden) rate field, and the guard on Save
                            // can't misfire against a stale value.
                            if (!v) setCurrencyRate('');
                          }}
                          className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                          disabled={currencySaving}
                        >
                          <option value="__none">None — single currency</option>
                          {currencyApi.ALLOWED_CURRENCIES.filter(c => c !== currencyPrimary).map(c => (
                            <option key={c} value={c}>{currencyApi.currencyLabel(c)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {currencySecondary && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-600">
                          Conversion rate ({currencyPrimary} → {currencySecondary})
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="any"
                            value={currencyRate}
                            onChange={e => setCurrencyRate(e.target.value)}
                            placeholder={currencyPrimary === 'USD' && currencySecondary === 'KHR' ? '4100' : 'e.g. 1300'}
                            disabled={currencySaving || currencyFetchingRate}
                            className="flex-1"
                          />
                          {/* Live-rate fetch from PayWay's exchange-rate
                              API. Only useful for pairs PayWay quotes
                              (KRW, JPY, EUR, …); falls back to a clear
                              toast for USD+KHR which isn't in the table. */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={fetchLiveRate}
                            disabled={currencySaving || currencyFetchingRate}
                            title="Fetch the latest rate from PayWay"
                          >
                            {currencyFetchingRate ? 'Fetching…' : 'Fetch live rate'}
                          </Button>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          1 {currencyPrimary} = <span className="tabular-nums font-medium">{currencyRate || '—'}</span> {currencySecondary}.
                          Used for the second total line on POS receipts and the Grand Total ({currencySecondary}) row on invoices.
                        </p>
                      </div>
                    )}

                    <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
                      Changing the pair affects new documents only — existing
                      Invoice / POS / Quotation / Voucher rows keep the currency
                      and exchange rate they were saved with.
                    </div>

                    <div>
                      <Button onClick={saveCurrencySettings} disabled={currencySaving} size="sm">
                        {currencySaving ? 'Saving…' : 'Save currency'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Audit footer — server-stamped on every save. Hidden when
            no row exists yet (the popup is showing defaults). */}
        {draft.updatedAt && (
          <div className="flex items-center gap-3 text-xs text-gray-500 px-6 py-2 border-t">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(draft.updatedAt)} ({new Date(draft.updatedAt).toLocaleString()})
            </span>
            {draft.updatedByEmail && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {draft.updatedByEmail}
              </span>
            )}
          </div>
        )}

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
      {/* Nested tenant-level PayWay dialog — opened by the chip in the
       *  ABA PayWay tab. After it closes we refresh the status chip so
       *  the operator sees the new state without reopening this
       *  outer dialog. */}
      <PayWaySettingsDialog
        open={paywayDialogOpen}
        onOpenChange={setPaywayDialogOpen}
        onSaved={next => setPaywayStatus(next)}
      />
    </Dialog>
  );
}

/* ====================================================================
 *  POS Display Ads editor (V143). Master toggle + list of media items
 *  the customer-display carousel rotates through while the cart is
 *  idle. Images can be drag-dropped (stored as base64 data URL);
 *  videos take a URL (uploads would blow past the column limit).
 * =================================================================== */

function PosSlidesEditor({
  enabled, onEnabledChange,
  rawMedia, onMediaChange,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  rawMedia: string | null;
  onMediaChange: (raw: string | null) => void;
  disabled?: boolean;
}) {
  const items = settingsApi.parsePosSlideMedia(rawMedia);

  const commit = (next: settingsApi.PosSlideItem[]) =>
    onMediaChange(next.length === 0 ? null : settingsApi.serializePosSlideMedia(next));

  const addImage = () => commit([...items, { kind: 'image', src: '' }]);
  const addVideo = () => commit([...items, { kind: 'video', src: '' }]);
  const removeAt = (idx: number) => commit(items.filter((_, i) => i !== idx));
  const setSrc = (idx: number, src: string) =>
    commit(items.map((m, i) => (i === idx ? { ...m, src } : m)));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
        Display Ads
        <HelpHint>
          Fullscreen carousel shown on the customer-display window while the cart is empty.
          An active sale (any item in the cart) hides the carousel and snaps the screen to
          the live order view.
        </HelpHint>
      </h3>

      {toggleRowStatic(
        'Enable slide display',
        'Off keeps the customer screen on its default Welcome state when idle. On rotates the media list below.',
        enabled, onEnabledChange, disabled,
      )}

      {/* Media list — disabled / dimmed when the toggle is off so
          the operator can pre-load assets and flip the switch when
          ready. */}
      <div className={`space-y-2 ${enabled ? '' : 'opacity-60'}`}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Media ({items.length})</Label>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={addImage} disabled={disabled}>
              <Plus className="h-3 w-3 mr-1" /> Image
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={addVideo} disabled={disabled}>
              <Plus className="h-3 w-3 mr-1" /> Video
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-gray-500">
            No slides yet. Add an Image (drag-drop a file) or a Video (paste a URL).
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((m, idx) => (
              <li key={idx} className="border rounded-md bg-white p-2 flex items-start gap-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold w-12 shrink-0 pt-1">
                  {m.kind}
                </div>
                <div className="flex-1 min-w-0">
                  {m.kind === 'image' ? (
                    <ImageDropZone
                      value={m.src}
                      onChange={v => setSrc(idx, v ?? '')}
                      hint="PNG / JPG · drag-drop or paste a public URL below"
                      height={120}
                      disabled={disabled}
                      maxBytes={2 * 1024 * 1024}
                    />
                  ) : (
                    <VideoSlideInput
                      src={m.src}
                      onChange={src => setSrc(idx, src)}
                      disabled={disabled}
                    />
                  )}
                  {/* URL fallback for images (lets the operator point
                      at a hosted asset instead of uploading). */}
                  {m.kind === 'image' && (
                    <Input
                      value={m.src.startsWith('data:') ? '' : m.src}
                      onChange={e => setSrc(idx, e.target.value)}
                      placeholder="…or paste an image URL"
                      className="mt-1 text-xs"
                      disabled={disabled}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="text-gray-400 hover:text-red-600 mt-1"
                  disabled={disabled}
                  title="Remove slide"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Video slide URL input + preview (V143). Resolves the URL to one
 *  of three forms — direct file (mp4/webm) plays in {@code <video>},
 *  YouTube / Vimeo embed in {@code <iframe>}, anything else shows a
 *  warning. The operator sees a live label ("YouTube", "Direct file",
 *  "Unsupported URL") so they know whether the carousel will play
 *  this slide before they Save. */
function VideoSlideInput({
  src, onChange, disabled,
}: {
  src: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const embed = resolveVideoEmbed(src);
  return (
    <div className="space-y-1.5">
      <Input
        value={src}
        onChange={e => onChange(e.target.value)}
        placeholder="https://…/promo.mp4   or   youtube.com/watch?v=…"
        disabled={disabled}
      />
      {src.trim().length > 0 && (
        <>
          <div className="flex items-center justify-between text-[11px]">
            <span className={
              embed.kind === 'invalid' ? 'text-red-600' :
              embed.kind === 'iframe'  ? 'text-emerald-700' :
                                          'text-gray-600'
            }>
              Detected: <b>{embed.label}</b>
            </span>
            {embed.kind === 'invalid' && (
              <span className="text-red-500">Carousel won't play this URL</span>
            )}
          </div>
          {embed.kind === 'video' && (
            <video
              src={embed.src}
              className="w-full max-h-48 rounded border bg-black"
              controls
              muted
              preload="metadata"
            />
          )}
          {embed.kind === 'iframe' && (
            <div className="aspect-video rounded border bg-black overflow-hidden">
              <iframe
                src={embed.src}
                className="w-full h-full"
                style={{ border: 0 }}
                allow="autoplay; encrypted-media; picture-in-picture"
                title="Video preview"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Local copy of the inline toggleRow factory so the slides editor
 *  can render its own switches without a closure over the parent
 *  component's saving/loading state. */
function toggleRowStatic(
  label: string, hint: string,
  value: boolean, onChange: (v: boolean) => void,
  disabled?: boolean,
) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 leading-snug mt-0.5">{hint}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
