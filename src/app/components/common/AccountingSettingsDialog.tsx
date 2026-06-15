import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Clock, User, Eye, Hash, Receipt as ReceiptIcon, Landmark, Upload, X as XIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as settingsApi from '../../api/accountingSettings';
import {
  loadBankAccounts, saveBankAccounts, newBankAccountId,
  EMPTY_BANK_ACCOUNT, type BankAccount,
} from '../../utils/bankAccount';

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
type Section = 'display' | 'numbering' | 'tax' | 'bank';

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
              :                         'General Voucher Settings';
  const sideLabel = scope === 'sale'      ? 'Invoice'
                  : scope === 'purchase'  ? 'Bill'
                  : scope === 'receipt'   ? 'Receipt'
                  : scope === 'quotation' ? 'Quotation'
                  :                         'Voucher';
  const prefixLabels = scope === 'sale'
    ? { commercial: 'Invoice',   tax: 'Tax Invoice', creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'purchase'
    ? { commercial: 'Bill',      tax: 'Tax Bill',    creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'receipt'
    ? { commercial: 'Receipt',   tax: '',            creditNote: '',            debitNote: '' }
    : scope === 'quotation'
    ? { commercial: 'Quotation', tax: '',            creditNote: '',            debitNote: '' }
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
   *  ~30 KB; anything bigger is almost certainly a wrong file. */
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
    reader.onload = () => updateBank(id, { qrDataUrl: String(reader.result || '') });
    reader.onerror = () => toast.error('Could not read image');
    reader.readAsDataURL(file);
  };

  const toggleRow = (
    label: string,
    description: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
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
      { key: 'bank' as Section, label: 'Bank Account', hint: 'Payment info + KHRQR printed on the invoice', icon: <Landmark className="h-4 w-4" /> },
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
              </div>
            )}

            {section === 'numbering' && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Document numbering</h3>
                  <p className="text-xs text-gray-500">
                    Drives the auto-generated {sideLabel.toLowerCase()} number on save (&lt;prefix&gt;-&lt;year&gt;-&lt;seq&gt;).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {prefixRow(prefixLabels.commercial, 'prefixCommercial')}
                  {!isSingleKind && prefixRow(prefixLabels.tax,        'prefixTax')}
                  {!isSingleKind && prefixRow(prefixLabels.creditNote, 'prefixCreditNote')}
                  {!isSingleKind && prefixRow(prefixLabels.debitNote,  'prefixDebitNote')}
                </div>
              </div>
            )}

            {section === 'bank' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Bank Account</h3>
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
                  {banks.map(b => (
                    <div key={b.id} className="border rounded-lg p-3 bg-white space-y-2 relative">
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
                       *  caps so they stay editable without dominating. */}
                      <div className="space-y-1.5">
                        <Input
                          value={b.accountName}
                          onChange={e => updateBank(b.id, { accountName: e.target.value })}
                          placeholder="Account name"
                          disabled={loading || saving}
                          className="text-sm font-medium"
                        />
                        <Input
                          value={b.accountNumber}
                          onChange={e => updateBank(b.id, { accountNumber: e.target.value })}
                          placeholder="Account number"
                          disabled={loading || saving}
                          className="text-sm font-mono"
                        />
                        <Input
                          value={b.bankName}
                          onChange={e => updateBank(b.id, { bankName: e.target.value })}
                          placeholder="Bank name (e.g. ABA)"
                          disabled={loading || saving}
                          className="text-xs h-8"
                        />
                        <Input
                          value={b.notes}
                          onChange={e => updateBank(b.id, { notes: e.target.value })}
                          placeholder="Notes (branch, SWIFT…)"
                          disabled={loading || saving}
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
                  ))}
                </div>

                <p className="text-[11px] text-gray-500">
                  Stored in your browser for now — set them once on the machine that prints invoices.
                </p>
              </div>
            )}

            {section === 'tax' && (
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold">Tax types</h3>
                  <p className="text-xs text-gray-500">
                    Click to enable or disable. Disabled patterns won't appear in the Taxation dropdown.
                  </p>
                </div>
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
