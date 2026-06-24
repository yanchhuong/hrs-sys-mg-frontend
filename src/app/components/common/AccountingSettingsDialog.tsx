import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Clock, User, Eye, Hash, Receipt as ReceiptIcon, Landmark, Upload, X as XIcon, Plus, Trash2, Info, BellRing, Printer, MonitorPlay } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import * as settingsApi from '../../api/accountingSettings';
import { resolveVideoEmbed } from '../../utils/posCustomerDisplay';
import {
  loadBankAccounts, saveBankAccounts, newBankAccountId,
  EMPTY_BANK_ACCOUNT, MAX_BANK_ACCOUNTS_ON_INVOICE, type BankAccount,
} from '../../utils/bankAccount';
import { ImageDropZone } from './ImageDropZone';

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
type Section = 'display' | 'numbering' | 'tax' | 'bank' | 'reminders' | 'receipt' | 'slides';

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

  const isReceipt = scope === 'receipt';
  // Quotation / Voucher are single-document scopes too — they only
  // render the first prefix slot (and skip the multi-kind labels)
  // exactly like Receipt does. Grouping them under one flag keeps
  // the render branches readable.
  const isSingleKind = scope === 'receipt' || scope === 'quotation' || scope === 'voucher';
  const title = scope === 'sale'      ? 'Invoice Settings'
              : scope === 'purchase'  ? 'Bill Settings'
              : scope === 'receipt'   ? 'Receipt Settings'
              : scope === 'quotation' ? 'Quotation Settings'
              : scope === 'pos'       ? 'POS Settings'
              :                         'General Voucher Settings';
  const sideLabel = scope === 'sale'      ? 'Invoice'
                  : scope === 'purchase'  ? 'Bill'
                  : scope === 'receipt'   ? 'Receipt'
                  : scope === 'quotation' ? 'Quotation'
                  : scope === 'pos'       ? 'POS'
                  :                         'Voucher';
  const prefixLabels = scope === 'sale'
    ? { commercial: 'Invoice',   tax: 'Tax Invoice', creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'purchase'
    ? { commercial: 'Bill',      tax: 'Tax Bill',    creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'receipt'
    ? { commercial: 'Receipt',   tax: '',            creditNote: '',            debitNote: '' }
    : scope === 'quotation'
    ? { commercial: 'Quotation', tax: '',            creditNote: '',            debitNote: '' }
    // POS — 'commercial' = counter-receipt, 'tax' = tax receipt,
    // 'creditNote' slot repurposed to carry the queue-number prefix
    // ("POSQ" → POSQ-042). 'debitNote' slot is unused.
    : scope === 'pos'
    ? { commercial: 'POS Receipt', tax: 'POS Tax',    creditNote: 'Queue (Q-no)', debitNote: '' }
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
    setBanks(prev => [...prev, { ...EMPTY_BANK_ACCOUNT, id: newBankAccountId() }]);
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
        className="font-mono text-sm h-8"
        placeholder={settingsApi.defaultsFor(scope)[field]}
      />
    </div>
  );

  // Left-menu items. Each one toggles the body, no scroll-jumping.
  // Bank Account is gated to Sale (Invoice) for now — that's where HR
  // asked for it; we can extend to Bills / Receipts once the UX lands.
  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'display',   label: 'Display',     hint: 'What shows on the form & PDF', icon: <Eye className="h-4 w-4" /> },
    { key: 'numbering', label: 'Numbering',   hint: 'Document number prefixes',     icon: <Hash className="h-4 w-4" /> },
    { key: 'tax',       label: 'Tax types',   hint: 'Patterns in the Tax dropdown', icon: <ReceiptIcon className="h-4 w-4" /> },
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
            {menu.map(m => {
              const active = section === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSection(m.key)}
                  className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 transition-colors flex items-start gap-2 ${
                    active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-700 hover:bg-white'
                  }`}
                >
                  <span className={`mt-0.5 ${active ? 'text-blue-600' : 'text-gray-500'}`}>{m.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium leading-tight">{m.label}</span>
                    <span className="block text-[11px] text-gray-500 leading-tight mt-0.5">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          <div className="overflow-y-auto p-6 space-y-4">
            {section === 'display' && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold mb-1">Display</h3>
                {toggleRow('Show Notes', 'Internal memo field on the form (not printed).',
                  draft.showNotes, v => setDraft({ ...draft, showNotes: v }))}
                {!isReceipt && toggleRow('Show Terms & Conditions', 'Customer-facing terms printed at the bottom.',
                  draft.showTerms, v => setDraft({ ...draft, showTerms: v }))}
                {!isReceipt && toggleRow('Show Discount', 'Discount input (amount or percent) + line in the totals.',
                  draft.showDiscount, v => setDraft({ ...draft, showDiscount: v }))}
                {!isReceipt && toggleRow('Show Tax', 'Taxation dropdown + tax line in the totals.',
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
                    className="font-mono text-sm h-8"
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
                      Next number example: <code className="font-mono text-gray-700">{previewNo}</code>
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
              // operator can't silently overflow the layout.
              const shownCount = banks.filter(b => b.showOnInvoice).length;
              const atCap = shownCount >= MAX_BANK_ACCOUNTS_ON_INVOICE;
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
                  <Button size="sm" onClick={addBank} disabled={loading || saving} className="shrink-0">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Bank Account
                  </Button>
                </div>

                {banks.length === 0 && (
                  <div className="border-2 border-dashed rounded-md py-10 text-center text-sm text-gray-500">
                    No bank accounts yet — click <strong>Add Bank Account</strong> to start.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {banks.map(b => {
                    const checked = !!b.showOnInvoice;
                    // Disable the toggle on the rows that *aren't*
                    // already checked once we hit the cap. Already-
                    // checked rows stay enabled so the user can
                    // un-check to free up a slot.
                    const disableShowOnInvoice = !checked && atCap;
                    return (
                    <div key={b.id} className={`border rounded-lg p-3 bg-white space-y-2 relative ${
                      checked ? 'ring-2 ring-blue-200 border-blue-300' : ''
                    }`}>
                      <label className={`flex items-center gap-2 text-xs ${
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
                      {/* Image area — square (1:1), held to the card's
                       *  full width so the QR is always centered and
                       *  doesn't drift if Acc Name wraps onto two lines. */}
                      {b.qrDataUrl ? (
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
                          className="text-sm font-mono"
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
                        className={`px-2.5 py-0.5 rounded-full border font-mono text-xs transition-colors ${
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
