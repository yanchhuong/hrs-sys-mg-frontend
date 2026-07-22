import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import { SearchablePicker } from '../common/SearchablePicker';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import { AttachmentsPanel } from '../common/AttachmentsPanel';
import * as invoicesApi from '../../api/invoices';
import * as paymentsApi from '../../api/payments';
import * as customersApi from '../../api/customers';
import * as accountingSettingsApi from '../../api/accountingSettings';
import * as settingsApi from '../../api/settings';
import * as itemsApi from '../../api/items';
import { loadBankAccounts, MAX_BANK_ACCOUNTS_ON_INVOICE } from '../../utils/bankAccount';
import { addRecentLineItems, getRecentLineItems } from '../../utils/recentLineItems';
import { StockItemPicker } from '../common/StockItemPicker';
import { printWithKhmerFonts } from '../../utils/printFonts';
import { capturePrintImage } from '../../utils/capturePrintInvoice';
import { printPosReceipt } from '../../utils/posReceipt';
import { printHtmlViaIframe } from '../../utils/printHtml';
import { PaymentReceiptCard } from '../common/PaymentReceiptCard';
import * as posApi from '../../api/pos';
import * as paywayApi from '../../api/payway';
import * as currencyApi from '../../api/currencySettings';
import { invoiceTemplates, defaultTemplateConfig } from '../../api/invoiceTemplates';
import type { InvoiceTemplate, TemplateConfig } from '../../api/invoiceTemplates';
import { formatMoneyForCurrency } from '../../utils/format';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight, Settings,
  Send, Ban, Eye, ChevronDown, Printer, Pencil, Search, Info, Mail, MessageCircle, Loader2, Landmark,
  Package, CheckCircle2, Upload, FileSpreadsheet,
} from 'lucide-react';
import { BulkUploadInvoicesDialog } from '../common/BulkUploadInvoicesDialog';
import { exportListToExcel } from '../../utils/excelExport';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';
import { consumeProfitLossNavIntent } from './ProfitLossReport';
import { EncounterFormDialog } from './EncounterFormDialog';

/* -------------------------------------------------------------------------- */
/* Kind / status helpers — labels, badge colours, icons                       */
/* -------------------------------------------------------------------------- */
const KIND_LABEL: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'Commercial',
  tax:         'Tax',
  credit_note: 'Credit Note',
  debit_note:  'Debit Note',
  // Hospital / School lens: sale_invoices row with kind='medical' or
  // kind='tuition' is the same document, just presented under a
  // different sidebar entry. See [[erp-core-engine-vision]].
  medical:     'Encounter',
  tuition:     'Tuition',
};
const KIND_BADGE_CLASS: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-violet-300 text-violet-700 bg-violet-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
  medical:     'border-teal-300 text-teal-700 bg-teal-50',
  tuition:     'border-indigo-300 text-indigo-700 bg-indigo-50',
};
const STATUS_BADGE_CLASS: Record<invoicesApi.InvoiceStatus, string> = {
  draft:     'border-slate-300 text-slate-700 bg-slate-50',
  progress:  'border-blue-300 text-blue-700 bg-blue-50',
  partially: 'border-amber-300 text-amber-700 bg-amber-50',
  paid:      'border-emerald-300 text-emerald-700 bg-emerald-50',
  // Refunded = settled Credit Note (we refunded the customer). Rose
  // hue distinguishes the cash-out direction from a regular Paid
  // collection (emerald) while still reading as a positive terminal
  // state (border / fill rather than red alarm).
  refunded:  'border-rose-300 text-rose-700 bg-rose-50',
  overdue:   'border-orange-400 text-orange-800 bg-orange-50',
  void:      'border-red-300 text-red-700 bg-red-50',
};

const KIND_FILTERS: ReadonlyArray<{ value: invoicesApi.InvoiceKind | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'commercial',  label: 'Commercial' },
  { value: 'tax',         label: 'Tax' },
  { value: 'credit_note', label: 'Credit Notes' },
  { value: 'debit_note',  label: 'Debit Notes' },
];

/** Render an amount with the currency in front. USD collapses to "$"
 *  (no space — matches how customers read it on a printed invoice);
 *  other currencies keep the ISO code prefix with a space so the
 *  symbol stays unambiguous. */
const fmtMoney = (n: number, currency: string): string => {
  // Negative amounts render with a leading "− " before the currency
  // prefix ("− $55.00") instead of letting toLocaleString embed the
  // sign between the prefix and the digits ("$-55.00"). Keeps the
  // AR / Remain / Net columns consistent with the existing explicit
  // "− {fmtMoney(positive)}" patterns used for Discount / Refund
  // sub-totals across the same view.
  //
  // KHR formats with no decimals ("R17,488,013"); USD and anything
  // else gets the 2-decimal default ("$55.00") — see formatMoneyForCurrency.
  //
  // Floating-point drift can leave a chain-net value like -0.0039
  // that rounds to $0.00 but would render as "− $0.00" without
  // this guard. Snap to zero when |n| < half a cent so the sign
  // drops too. The KHR threshold uses 0.5 because KHR has no
  // decimals (anything under 0.5 KHR rounds to 0).
  const epsilon = currency === 'KHR' ? 0.5 : 0.005;
  if (Math.abs(n) < epsilon) n = 0;
  const num = formatMoneyForCurrency(Math.abs(n), currency);
  // KHR uses the riel symbol (៛) rather than the ISO code; USD
  // collapses to "$" without a space; everything else keeps the
  // ISO code + space.
  const body = currency === 'USD' ? `$${num}`
    : currency === 'KHR' ? `៛ ${num}`
    : `${currency} ${num}`;
  return n < 0 ? `− ${body}` : body;
};

/** Taxation matrix — datakey → display label + percentage. Mirrors
 *  the cross-system reference; backend service uses the same rates. */
const TAX_TYPES: ReadonlyArray<{ key: invoicesApi.InvoiceTaxType; label: string; rate: number }> = [
  { key: '1',  label: 'VAT 10%',                rate: 10 },
  { key: '2',  label: 'VAT 0%',                 rate: 0 },
  { key: '3',  label: 'Exclusive VAT',          rate: 0 },
  { key: '11', label: 'WHT Tax on Service 15%', rate: 15 },
  { key: '12', label: 'WHT Tax on Service 14%', rate: 14 },
];
const TAX_TYPE_BY_KEY: Record<string, typeof TAX_TYPES[number]> =
  TAX_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t }), {});
/** Which datakeys each kind can pick. CN/DN inherit the parent's set
 *  in service-layer guard; the UI receives the parent's kind via
 *  prop so the dropdown filters to the right subset. */
const TAX_TYPES_FOR_KIND = (kind: invoicesApi.InvoiceKind, parentKind?: invoicesApi.InvoiceKind): typeof TAX_TYPES => {
  if (kind === 'tax') return TAX_TYPES;
  if (kind === 'commercial') return TAX_TYPES.filter(t => t.key === '2' || t.key === '3');
  // Medical / Tuition — same tax subset as commercial (VAT 0% + Exclusive).
  // Hospital / School bills aren't Cambodia Tax Invoices, so the full VAT
  // matrix would be misleading. Same treatment for tuition.
  if (kind === 'medical' || kind === 'tuition') {
    return TAX_TYPES.filter(t => t.key === '2' || t.key === '3');
  }
  // CN/DN: inherit from parent's allowed set
  const effective = parentKind ?? 'tax';
  return TAX_TYPES_FOR_KIND(effective);
};

/**
 * Inline confirmation card shown below the customer picker in the
 * invoice form. Business customers expose the columns the printed
 * invoice will pick up (TIN / representative / site / address);
 * individuals show phone + address. Renders nothing when no
 * customer is selected.
 */
function CustomerInfoCard({ customer }: { customer: customersApi.Customer | undefined }) {
  if (!customer) return null;
  const rows: Array<{ label: string; value: string | null | undefined }> =
    customer.type === 'business'
      ? [
          { label: 'Company',        value: customer.name },
          { label: 'TIN',            value: customer.tin },
          { label: 'Representative', value: customer.representative },
          { label: 'Phone',          value: customer.phone },
          { label: 'Site',           value: customer.site },
          { label: 'Address',        value: customer.address },
        ]
      : [
          { label: 'Name',    value: customer.name },
          { label: 'Phone',   value: customer.phone },
          { label: 'Address', value: customer.address },
        ];
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${
      customer.type === 'business' ? 'bg-violet-50 border-violet-200' : 'bg-emerald-50 border-emerald-200'
    }`}>
      <div className="flex items-center gap-1.5 mb-1 font-medium text-[11px] uppercase tracking-wide text-gray-500">
        {customer.type === 'business' ? 'Business customer' : 'Individual customer'}
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5">
        {rows.filter(r => r.value && String(r.value).trim()).map(r => (
          <div key={r.label} className="contents">
            <div className="text-gray-500">{r.label}</div>
            <div className="text-gray-800">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page component                                                        */
/* -------------------------------------------------------------------------- */
/**
 * Sale Invoices page. When mounted with {@code presentAs='encounter'}
 * + {@code kindFilter='medical'}, becomes the Hospital's Encounter
 * page — same code path, different labels + list narrowed to the
 * medical-kind rows. Follows the same lens pattern as Patients →
 * Customers. See [[erp-core-engine-vision]]: one engine, many
 * workflows. Medical Bill IS an Invoice with kind='medical'.
 *
 * <p>When a {@code kindFilter} is fixed, the Kind tabs at the top
 * of the list are hidden and the New-button becomes a single-action
 * button (rather than the 4-way commercial/tax/CN/DN dropdown).</p>
 */
export function Invoices({
  presentAs = 'invoice',
  kindFilter: fixedKind,
}: {
  presentAs?: 'invoice' | 'encounter';
  /** When set, list is filtered to this single kind and creates
   *  default to it. Kind tabs + CN/DN dropdown items hide. */
  kindFilter?: invoicesApi.InvoiceKind;
} = {}) {
  const isEncounter = presentAs === 'encounter';
  // Terms — Hospital-branded labels for encounters. Only top-level
  // strings are swapped; deep form labels (Kind, Tax, Discount etc.)
  // stay unchanged since they're cross-vertical accounting concepts.
  const T = isEncounter ? {
    pageTitle:      'Encounters',
    newButton:      'New Encounter',
    bulkTooltip:    'Bulk upload encounters from an Excel workbook',
    exportFilename: 'Encounters',
    exportSheet:    'Encounters',
  } : {
    pageTitle:      null,                                            // fall through to t('nav.invoices')
    newButton:      'New Invoice',
    bulkTooltip:    'Bulk upload invoices from an Excel workbook',
    exportFilename: 'Invoices',
    exportSheet:    'Invoices',
  };
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  const { formatDate } = useDateFormat();
  const canAdd = canCreate('invoice');
  const canEdit = canUpdate('invoice');
  const canRemove = canDelete('invoice');

  const [rows, setRows] = useState<invoicesApi.Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  // When a fixedKind is provided (Encounter lens) the state is pinned
  // to that value + the tabs hidden. Otherwise the operator flips
  // between commercial/tax/CN/DN via the tabs.
  const [kindFilter, setKindFilter] = useState<invoicesApi.InvoiceKind | 'all'>(fixedKind ?? 'all');
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  // Date-range + keyword filters — applied client-side over the rows
  // we already loaded so HR sees instant feedback when scrubbing dates
  // or typing without round-tripping for each keystroke.
  //
  // Defaults to empty so the landing view shows every invoice; users
  // pick a range to narrow. Pagination keeps the list scroll bounded
  // even with several years of data.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // v-invoice-no-and-auto-payment — Enrollments (and other pages
  // that surface a linked invoice) hand off the target invoice
  // number via sessionStorage.invoicesFocus. Consume it once on
  // mount so a click on ENR-2026-00001's Invoice No. lands the
  // operator on this page with the search prefilled + focus
  // cleared. Any consumer wanting to link here uses the same key.
  const [search, setSearch] = useState(() => {
    try {
      const focus = sessionStorage.getItem('invoicesFocus');
      if (focus) {
        sessionStorage.removeItem('invoicesFocus');
        return focus;
      }
    } catch {
      // sessionStorage disabled — fall through
    }
    return '';
  });

  // Per-side Accountant settings (V92) — Sale row is independent
  // from Purchase, so toggling Discount off here doesn't flip it on
  // the Bill page. Fetched on mount; the Settings popup refreshes
  // this when the user saves.
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings>(
    accountingSettingsApi.defaultsFor('sale'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  /** Latched when the create form completes a successful Save & Close
   *  on a primary document — drives a one-shot image-based Telegram
   *  send in the detail dialog that opens immediately after. Cleared
   *  by the detail dialog once it fires the send (or on detail close
   *  if it never got the chance). */
  const [autoSendTelegram, setAutoSendTelegram] = useState(false);
  const [formKind, setFormKind] = useState<invoicesApi.InvoiceKind>('commercial');
  /** When set, the form dialog runs in edit-mode against this invoice
   *  instead of opening blank for a fresh create. */
  const [formEditing, setFormEditing] = useState<invoicesApi.Invoice | null>(null);
  /** When set, the form dialog opens for a CN/DN pre-pointing at this
   *  invoice id (skips the parent picker — saves a click from the
   *  inline "adjust" dropdown on each commercial/tax row). */
  const [formParentPrefill, setFormParentPrefill] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<invoicesApi.Invoice | null>(null);
  // Per-currency Received totals for the visible page — populated by a
  // single batched call after the invoices land. Splits the single
  // legacy "paidAmount" into USD + KHR columns.
  const [receivedByCurrency, setReceivedByCurrency] = useState<Record<string, Partial<Record<paymentsApi.PaymentCurrency, number>>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, custRes] = await Promise.all([
        invoicesApi.list({ kind: kindFilter === 'all' ? undefined : kindFilter, size: 200 }),
        customersApi.list({ size: 500 }),
      ]);
      const invoices = invRes.content ?? [];
      setRows(invoices);
      setCustomers(custRes.content ?? []);
      // Kick off the per-currency totals in the background — the table
      // renders the legacy total in the USD column while this resolves,
      // then refines. Soft-fail so a 403 on the payment module doesn't
      // wipe the visible list.
      paymentsApi.totalsByCurrency(invoices.map(i => i.id))
        .then(setReceivedByCurrency)
        .catch(() => setReceivedByCurrency({}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kindFilter]);

  // Cross-page nav intent from the P&L report — clicking an income
  // row on ProfitLossReport stashes the invoice id in sessionStorage
  // and switches the sidebar view; we pop the intent here and open
  // the detail dialog on mount. See [[erp-core-engine-vision]] for
  // the drilldown story.
  useEffect(() => {
    const pending = consumeProfitLossNavIntent('invoice');
    if (pending) setDetailId(pending);
  }, []);

  // One-shot fetch of the Sale-side Accountant settings. Failures
  // fall back to defaults — the page still functions, just without
  // the user's tenant-level customisation.
  useEffect(() => {
    accountingSettingsApi.get('sale').then(setSettings).catch(() => {
      setSettings(accountingSettingsApi.defaultsFor('sale'));
    });
  }, []);

  const customerById = useMemo(() => {
    const m = new Map<string, customersApi.Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  /**
   * Filter by date range + free-text keyword, then group adjustments
   * under their parents. Filters are client-side over the loaded
   * page so HR gets instant feedback. Keyword matches invoice
   * number, customer name, or notes (case-insensitive); date range
   * is inclusive and either end may be open.
   */
  const groupedRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const q = search.trim().toLowerCase();
    const passesFilters = (r: invoicesApi.Invoice): boolean => {
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const customerName = customerById.get(r.customerId)?.name?.toLowerCase() ?? '';
      return r.invoiceNo.toLowerCase().includes(q)
          || customerName.includes(q)
          || (r.notes ?? '').toLowerCase().includes(q);
    };

    // For grouping: keep an adjustment visible if it OR its parent passes.
    // The parent stays visible too in that case so the chain isn't broken.
    const parentOf = new Map<string, invoicesApi.Invoice>();
    rows.forEach(r => parentOf.set(r.id, r));
    const keepIds = new Set<string>();
    for (const r of rows) {
      if (passesFilters(r)) {
        keepIds.add(r.id);
        if (r.parentInvoiceId && parentOf.has(r.parentInvoiceId)) keepIds.add(r.parentInvoiceId);
      }
    }
    const visible = rows.filter(r => keepIds.has(r.id));

    const adjustmentsByParent = new Map<string, invoicesApi.Invoice[]>();
    const orphans: invoicesApi.Invoice[] = [];
    const rowIds = new Set(visible.map(r => r.id));
    for (const r of visible) {
      if (!r.parentInvoiceId) continue;
      if (rowIds.has(r.parentInvoiceId)) {
        if (!adjustmentsByParent.has(r.parentInvoiceId)) adjustmentsByParent.set(r.parentInvoiceId, []);
        adjustmentsByParent.get(r.parentInvoiceId)!.push(r);
      } else {
        orphans.push(r);
      }
    }
    const out: invoicesApi.Invoice[] = [];
    for (const r of visible) {
      if (r.parentInvoiceId) continue;
      out.push(r);
      const kids = adjustmentsByParent.get(r.id);
      if (kids) out.push(...kids);
    }
    return [...out, ...orphans];
  }, [rows, search, dateFrom, dateTo, customerById]);

  const pagination = usePagination(groupedRows, 10);

  // Reset pagination to page 1 whenever a filter changes so HR
  // doesn't sit on page 5 of an empty result set after narrowing the
  // date range / search. Pagination is intentionally NOT in the dep
  // array — its functions are unstable across renders and would loop.
  useEffect(() => {
    pagination.goToPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, search, kindFilter]);

  /** Per-currency sum of total / paid / remaining across the
   *  *filtered* set (not just the current page) so HR can see the
   *  receivable book at a glance. Mixed currencies stay grouped —
   *  adding USD to KHR would produce nonsense.
   *
   *  Paid is the *net* customer inflow: invoice + DN receipts add,
   *  CN refunds subtract (regardless of how the row's direction
   *  column was stored). Remain only sums root invoices since
   *  adjustments already roll up into the root's netBalance. */
  /** Currency-aware AR per root invoice — overrides the server's
   *  {@code netBalance} field which sums payment amounts currency-blind
   *  (e.g. USD 124.76 + KHR 165,000 = 165,124.76 against a USD 165
   *  invoice → wrong AR of −$164,959.76). We convert KHR↔USD using the
   *  invoice's own exchangeRate and walk the chain (root + non-void
   *  DN/CN children) summing payments per currency from the
   *  receivedByCurrency map. Falls back to the server netBalance for
   *  rows whose per-currency totals haven't loaded yet so the cell
   *  isn't blank on first paint. */
  const arByRowId = useMemo(() => {
    const out: Record<string, number> = {};
    const childrenByParent = new Map<string, invoicesApi.Invoice[]>();
    for (const r of rows) {
      if (!r.parentInvoiceId) continue;
      if (!childrenByParent.has(r.parentInvoiceId)) childrenByParent.set(r.parentInvoiceId, []);
      childrenByParent.get(r.parentInvoiceId)!.push(r);
    }
    for (const root of rows) {
      if (root.parentInvoiceId) continue;       // children handled via parent
      const rate = root.exchangeRate || 0;
      const convert = (usd: number, khr: number): number => {
        if (root.currency === 'USD') return usd + (rate > 0 ? khr / rate : 0);
        if (root.currency === 'KHR') return khr + usd * rate;
        return usd;                              // unknown currency: assume USD
      };
      const nonVoidKids = (childrenByParent.get(root.id) ?? [])
        .filter(c => c.status !== 'void');
      const sumDn = nonVoidKids
        .filter(c => c.kind === 'debit_note')
        .reduce((s, c) => s + c.total, 0);
      const sumCn = nonVoidKids
        .filter(c => c.kind === 'credit_note')
        .reduce((s, c) => s + c.total, 0);
      // Sum payments across root + every non-void child. The per-
      // currency endpoint returns signed values (credit positive,
      // debit negative). Server chain formula:
      //   inflow = root.paidAmount + ΣDN.paidAmount − Σ|CN.refund|
      // So for root + DN we add the signed value directly (credit
      // payments add, debit refunds subtract); for CN we subtract
      // the magnitude (refund out reduces inflow regardless of sign).
      let inflow = 0;
      const docs = [root, ...nonVoidKids];
      let anyMissing = false;
      for (const d of docs) {
        const t = receivedByCurrency[d.id];
        if (!t) { anyMissing = true; continue; }
        const signedUsd = convert(t.USD ?? 0, t.KHR ?? 0);
        if (d.kind === 'credit_note') {
          inflow -= Math.abs(signedUsd);
        } else {
          inflow += signedUsd;
        }
      }
      if (anyMissing) {
        // Per-currency totals still loading — fall back to the
        // server's netBalance so the cell isn't blank.
        out[root.id] = root.netBalance ?? (root.total - root.paidAmount);
      } else {
        out[root.id] = root.total + sumDn - sumCn - inflow;
      }
    }
    return out;
  }, [rows, receivedByCurrency]);

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, { total: number; paid: number; paidUsd: number; paidKhr: number; remain: number }>();
    for (const r of groupedRows) {
      // Voided rows are still rendered (struck through) so HR can see
      // *what* was cancelled, but they must not skew any footer sum —
      // not Total, not Paid, not Remain. A void is, by definition, a
      // row that doesn't exist in the ledger.
      if (r.status === 'void') continue;
      const c = r.currency || 'USD';
      if (!m.has(c)) m.set(c, { total: 0, paid: 0, paidUsd: 0, paidKhr: 0, remain: 0 });
      const slot = m.get(c)!;
      // CN total represents what we owe the customer → subtract from
      // the running Total. INV + DN add as receivables.
      slot.total += r.kind === 'credit_note' ? -r.total : r.total;
      // CN's paid is a refund — subtract magnitude so the net Paid
      // total reflects what we actually received from the customer.
      slot.paid += r.kind === 'credit_note' ? -Math.abs(r.paidAmount) : r.paidAmount;
      // Per-currency paid columns. Pull from the batched
      // /totals-by-currency map; fall back to the legacy paidAmount
      // bucketed into the row's native currency while the call is
      // still in flight so the footer isn't blank on first paint.
      const perCur = receivedByCurrency[r.id];
      const usd = perCur ? (perCur.USD ?? 0) : (c === 'USD' ? r.paidAmount : 0);
      const khr = perCur ? (perCur.KHR ?? 0) : (c === 'KHR' ? r.paidAmount : 0);
      const sign = r.kind === 'credit_note' ? -1 : 1;
      slot.paidUsd += sign * usd;
      slot.paidKhr += sign * khr;
      if (!r.parentInvoiceId) {
        // Use the currency-aware AR we computed above (which falls
        // back to netBalance when per-currency totals aren't loaded yet).
        slot.remain += arByRowId[r.id] ?? r.netBalance ?? (r.total - r.paidAmount);
      }
    }
    return [...m.entries()].map(([currency, sums]) => ({ currency, ...sums }));
  }, [groupedRows, receivedByCurrency]);

  const openCreate = (kind: invoicesApi.InvoiceKind) => {
    setFormEditing(null);
    setFormParentPrefill(null);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Open the form dialog for a credit / debit note pre-pointing at
   *  the given parent invoice. Used by the inline dropdown on each
   *  commercial / tax row so HR doesn't have to manually pick the
   *  parent in the form. */
  const openAdjustment = (parent: invoicesApi.Invoice, kind: 'credit_note' | 'debit_note') => {
    setFormEditing(null);
    setFormParentPrefill(parent.id);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Switch from the detail dialog into edit-mode on the form dialog
   *  pre-filled with this invoice. The detail dialog closes; on save
   *  the list refetches and the user lands back on the list view. */
  const openEdit = (inv: invoicesApi.Invoice) => {
    setFormEditing(inv);
    setFormParentPrefill(null);
    setFormKind(inv.kind);
    setDetailId(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await invoicesApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.invoiceNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{T.pageTitle ?? t('nav.invoices')}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* Settings popup gates Notes / Terms / Discount / Tax on
              the form. Tenant-wide setting; only users with
              invoice.update see updates persist (read is open to
              invoice.view). */}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
                  title="Accountant settings">
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => exportListToExcel({
              filename: T.exportFilename,
              sheetName: T.exportSheet,
              columns: [
                { header: 'Invoice No',    value: r => r.invoiceNo,                                         width: 18 },
                { header: 'Kind',          value: r => r.kind === 'tax' ? 'Tax'
                                                     : r.kind === 'commercial' ? 'Commercial'
                                                     : r.kind === 'credit_note' ? 'Credit Note'
                                                     : r.kind === 'debit_note'  ? 'Debit Note' : r.kind,     width: 14 },
                { header: 'Issue Date',    value: r => r.issueDate,                                          width: 12 },
                { header: 'Due Date',      value: r => r.dueDate ?? '',                                     width: 12 },
                { header: 'Customer',      value: r => customerById.get(r.customerId)?.name ?? '',          width: 30 },
                { header: 'Currency',      value: r => r.currency,                                          width: 8  },
                { header: 'Subtotal',      value: r => Number(r.subtotal ?? 0),                             width: 12 },
                { header: 'Tax',           value: r => Number(r.taxAmount ?? 0),                            width: 10 },
                { header: 'Discount',      value: r => Number(r.discountAmount ?? 0),                       width: 10 },
                { header: 'Total',         value: r => Number(r.total ?? 0),                                width: 12 },
                { header: 'Paid',          value: r => Number(r.paidAmount ?? 0),                           width: 12 },
                { header: 'Remain',        value: r => Number((r.total ?? 0) - (r.paidAmount ?? 0)),        width: 12 },
                { header: 'Status',        value: r => r.status,                                            width: 10 },
                { header: 'Notes',         value: r => r.notes ?? '',                                      width: 40 },
              ],
              rows: groupedRows,
            })}
            disabled={groupedRows.length === 0}
            size="icon"
            title={isEncounter ? 'Download the current encounter list as an Excel workbook' : 'Download the current invoice list as an Excel workbook'}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          </Button>
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title={T.bulkTooltip}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Bulk Upload
            </Button>
          )}
          {canAdd && (
            fixedKind ? (
              // Encounter lens — single-action button; the kind is
              // already pinned (medical / etc), so no dropdown of
              // sibling kinds. CN/DN are also skipped because
              // Medical Bills have no credit/debit-note siblings.
              <Button onClick={() => openCreate(fixedKind)}>
                <Plus className="h-4 w-4 mr-1.5" /> {T.newButton}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1.5" />
                    {T.newButton}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => openCreate('commercial')}>
                    <FileText className="h-4 w-4 mr-2 text-blue-600" /> Commercial Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreate('tax')}>
                    <Receipt className="h-4 w-4 mr-2 text-violet-600" /> Tax Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreate('credit_note')}>
                    <CornerDownRight className="h-4 w-4 mr-2 text-emerald-600" /> Credit Note
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openCreate('debit_note')}>
                    <CornerUpRight className="h-4 w-4 mr-2 text-amber-600" /> Debit Note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-mobile-scrollable-filter-strip — on mobile the row
              stays on ONE line and the container scrolls
              horizontally; on sm: falls back to the original
              justify-between + flex-wrap. Same treatment across
              every list page (Bills, Quotations, Vendors, ...). */}
          <div className="filter-strip">
              {/* Kind tabs — hidden when a fixedKind is pinned (Encounter
                  lens narrows the list to a single kind, so the switcher
                  would be dead controls). */}
              {!fixedKind && (
                <Tabs value={kindFilter} onValueChange={v => setKindFilter(v as typeof kindFilter)}>
                  <TabsList>
                    {KIND_FILTERS.map(f => (
                      <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {/* Date range — inclusive, either end may be open. Backend
                    returns the most recent rows; the range narrows the
                    loaded page so HR doesn't need to re-fetch per scrub. */}
                <Label className="text-xs text-gray-500">From</Label>
                <DateInput
                  value={dateFrom || null}
                  onChange={v => setDateFrom(v ?? '')}
                  max={dateTo || undefined}
                />
                <Label className="text-xs text-gray-500">To</Label>
                <DateInput
                  value={dateTo || null}
                  onChange={v => setDateTo(v ?? '')}
                  min={dateFrom || undefined}
                />
                {(dateFrom || dateTo) && (
                  <Button
                    size="sm" variant="ghost" className="h-8 text-xs"
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                  >
                    Clear
                  </Button>
                )}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search invoice no, customer, notes…"
                    className="h-8 pl-7 w-64 text-sm"
                  />
                </div>
              </div>
            </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : groupedRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No invoices yet.' : 'No invoices match your filters.'}
            </p>
          ) : (
            <>
              {/* Scrollable table container — keeps both vertical
                  overflow (long lists) and horizontal overflow (wide
                  column set) bounded to the table area instead of
                  letting the page itself scroll. The sticky TableHeader
                  + TableFooter pin the column labels and the totals
                  band while the body scrolls beneath them. */}
              <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                  <TableRow>
                    <TableHead className="w-[160px]">Invoice No.</TableHead>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right w-[110px]">Received (USD)</TableHead>
                    <TableHead className="text-right w-[110px]">Received (KHR)</TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AR
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Receivable — what the customer still owes after the full ledger (invoice + DN − CN − net payments).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[130px]">{isEncounter ? 'Cashier' : 'Seller'}</TableHead>
                    <TableHead className="text-right w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(inv => {
                    const isAdjustment = !!inv.parentInvoiceId;
                    const isVoid = inv.status === 'void';
                    // Voided rows: strike + grey out so the row reads
                    // "cancelled, ignore" at a glance. Cells still
                    // render (operators want to see *what* was voided),
                    // they just no longer count in the footer sum.
                    const rowClass = [
                      isAdjustment ? 'bg-slate-50/50' : '',
                      isVoid ? 'line-through text-gray-400' : '',
                    ].filter(Boolean).join(' ');
                    return (
                    <TableRow key={inv.id} className={rowClass}>
                      <TableCell className="tabular-nums text-sm">
                        {isAdjustment && (
                          <span className="text-gray-400 mr-1.5" title="Adjusts the parent invoice above">↳</span>
                        )}
                        {inv.invoiceNo}
                      </TableCell>
                      <TableCell>
                        {/* POS chip (V135) overrides the kind chip so
                            the list distinguishes counter sales from
                            regular invoices at a glance. */}
                        {inv.posOrderId ? (
                          <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
                            POS
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={`gap-1 ${KIND_BADGE_CLASS[inv.kind]}`}>
                            {KIND_LABEL[inv.kind]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {customerById.get(inv.customerId)?.name ?? <span className="text-gray-400">(unknown)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDate(inv.issueDate)}</TableCell>
                      {/* CN amount represents money we owe customer →
                          render signed negative in red so the column
                          and footer sum match the ledger direction. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        inv.kind === 'credit_note' ? 'text-red-700' : ''
                      }`}>
                        {inv.kind === 'credit_note'
                          ? `− ${fmtMoney(inv.total, inv.currency)}`
                          : fmtMoney(inv.total, inv.currency)}
                      </TableCell>
                      {/* Paid display rules:
                          - Adjustment with zero paid → em-dash (no
                            payment recorded yet; "$0.00" reads like
                            a real receipt and clutters the column).
                          - CN with payment → "− $X" in red (refund =
                            money out, signed for ledger clarity).
                          - INV / DN → plain gray amount. */}
                      {/* Per-currency Received columns. Pulled from the
                       *  batched /totals-by-currency call after the list
                       *  resolves. Falls back to the legacy paidAmount
                       *  in the invoice's native currency while the
                       *  batched call is still in flight so the table
                       *  isn't visibly blank on first paint. */}
                      {(() => {
                        const totals = receivedByCurrency[inv.id];
                        const loaded = !!totals;
                        const usd = loaded
                          ? (totals.USD ?? 0)
                          : (inv.currency === 'USD' ? inv.paidAmount : 0);
                        const khr = loaded
                          ? (totals.KHR ?? 0)
                          : (inv.currency === 'KHR' ? inv.paidAmount : 0);
                        const isCn = inv.kind === 'credit_note';
                        const cellClass = isCn ? 'text-red-700' : 'text-gray-600';
                        const render = (val: number, cur: 'USD' | 'KHR') => {
                          // inline-block breaks text-decoration
                          // inheritance from the parent row, so a
                          // voided row's line-through doesn't stack
                          // on top of the em-dash glyph (which would
                          // otherwise look like a double horizontal
                          // line — bad UI).
                          if (!val) return <span className="text-gray-300 inline-block">—</span>;
                          return isCn
                            ? `− ${fmtMoney(Math.abs(val), cur)}`
                            : fmtMoney(val, cur);
                        };
                        return (
                          <>
                            <TableCell className={`text-right text-sm tabular-nums ${cellClass}`}>
                              {render(usd, 'USD')}
                            </TableCell>
                            <TableCell className={`text-right text-sm tabular-nums ${cellClass}`}>
                              {render(khr, 'KHR')}
                            </TableCell>
                          </>
                        );
                      })()}
                      {/* Remain is meaningful only on the root invoice
                          — CN/DN rows already roll their balance up
                          into the parent's netBalance. Show a muted
                          em-dash on adjustment rows so the column
                          stays visually aligned. */}
                      {/* AR = currency-aware chain net. Server's
                          netBalance is currency-blind so a mixed-
                          currency payment chain produces a garbage
                          figure (e.g. − $164,959.76 on a $165 invoice
                          paid partly in KHR). arByRowId walks the chain
                          with the invoice's exchange rate; falls back
                          to netBalance on first paint. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        isAdjustment ? 'text-gray-300'
                          : (arByRowId[inv.id] ?? inv.netBalance ?? (inv.total - inv.paidAmount)) > 0 ? 'text-red-700 font-medium'
                          : 'text-gray-500'
                      }`}>
                        {isAdjustment ? '—' : fmtMoney(arByRowId[inv.id] ?? inv.netBalance ?? (inv.total - inv.paidAmount), inv.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[inv.status]}`}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 truncate max-w-[130px]" title={inv.createdByName ?? ''}>
                        {inv.createdByName ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailId(inv.id)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          {/* Only root invoices (commercial / tax) can
                              carry adjustments; voided rows are sealed.
                              The dropdown skips the parent-picker step
                              in the form by setting formParentPrefill.
                              Encounters / Tuition rows omit the CN/DN
                              button — their parent-kind isn't in the
                              rootInvoiceOptions filter, and the backend
                              CHECK constraint restricts adjustment
                              parents to commercial/tax anyway. */}
                          {canAdd && !isAdjustment && inv.status !== 'void'
                            && (inv.kind === 'commercial' || inv.kind === 'tax') && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Add adjustment note">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openAdjustment(inv, 'credit_note')}>
                                  <CornerDownRight className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Credit Note
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openAdjustment(inv, 'debit_note')}>
                                  <CornerUpRight className="h-3.5 w-3.5 mr-2 text-amber-600" /> Debit Note
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {canRemove && inv.status === 'draft' && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(inv)}
                              title="Delete draft"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
                {totalsByCurrency.length > 0 && (
                  <TableFooter>
                    {totalsByCurrency.map(t => (
                      <TableRow key={t.currency}>
                        <TableCell colSpan={4} className="text-right text-xs font-semibold text-gray-600">
                          Totals ({t.currency})
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">
                          {fmtMoney(t.total, t.currency)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                          {fmtMoney(t.paidUsd, 'USD')}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                          {fmtMoney(t.paidKhr, 'KHR')}
                        </TableCell>
                        <TableCell className={`text-right text-sm font-semibold tabular-nums ${
                          t.remain > 0 ? 'text-red-700' : 'text-gray-500'
                        }`}>
                          {fmtMoney(t.remain, t.currency)}
                        </TableCell>
                        {/* Trailing filler must span Status + Seller/Cashier +
                            Actions — 3 cells. Was 2, leaving the Actions
                            column as a visible empty rectangle on the totals
                            rows. */}
                        <TableCell colSpan={3} />
                      </TableRow>
                    ))}
                  </TableFooter>
                )}
              </Table>
              </div>
              {groupedRows.length > 0 && (
                <div className="px-1 py-0 border-t">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={pagination.startIndex}
                    endIndex={pagination.endIndex}
                    totalItems={pagination.totalItems}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog — Encounter lens uses a purpose-built
          medical form (Prescription / Services / Lab / Imaging
          sections + Diagnosis) via EncounterFormDialog; every other
          kind stays on the shared InvoiceFormDialog. */}
      {isEncounter ? (
        <EncounterFormDialog
          open={formOpen}
          onOpenChange={(o) => { setFormOpen(o); if (!o) { setFormEditing(null); setFormParentPrefill(null); } }}
          customers={customers}
          editing={formEditing}
          onCreated={async (created) => {
            setFormOpen(false);
            setFormEditing(null);
            setFormParentPrefill(null);
            await load();
            // Encounters don't chain to the Telegram auto-send — the
            // detail dialog still exposes the manual send option.
            void created;
          }}
        />
      ) : (
      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setFormEditing(null); setFormParentPrefill(null); } }}
        kind={formKind}
        customers={customers}
        invoices={rows}
        editing={formEditing}
        parentPrefill={formParentPrefill}
        settings={settings}
        onCreated={async (created) => {
          setFormOpen(false);
          setFormEditing(null);
          setFormParentPrefill(null);
          await load();
          // Chain to the image-based Telegram send when the form
          // returns a freshly-issued (status=progress) primary
          // document. Opens the detail dialog with autoSendTelegram=true
          // — the dialog mounts the print template, captures it as
          // PNG, and fires sendTelegram. Adjustments (CN/DN) and
          // anything still in draft skip this chain.
          if (created && created.status === 'progress'
              && (created.kind === 'commercial' || created.kind === 'tax')) {
            setAutoSendTelegram(true);
            setDetailId(created.id);
          }
        }}
      />
      )}

      {/* Sale-side Accountant settings popup. Independent from the
          Bill page's popup — each scope has its own row + audit. */}
      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="sale"
        onSaved={setSettings}
      />

      {/* Bulk upload from Excel — parses on the FE and POSTs each
          invoice through the standard create endpoint with the
          concurrency cap used by the Employee importer. */}
      <BulkUploadInvoicesDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        customers={customers}
        existingInvoiceNos={rows.map(r => r.invoiceNo)}
        onImported={() => { void load(); }}
      />

      {/* Detail dialog */}
      {detailId && (
        <InvoiceDetailDialog
          invoiceId={detailId}
          customers={customers}
          canEdit={canEdit}
          settings={settings}
          autoSendTelegram={autoSendTelegram}
          onAutoSendConsumed={() => setAutoSendTelegram(false)}
          onClose={() => { setDetailId(null); setAutoSendTelegram(false); }}
          onChanged={() => { void load(); }}
          onEdit={openEdit}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.invoiceNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete is only allowed on drafts — the row is removed completely.
              For issued invoices use Void instead so the legal record stays auditable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-invoice dialog                                                      */
/* -------------------------------------------------------------------------- */
interface FormItem {
  name: string;
  /** Free-form specification (DB column: description). */
  description?: string;
  /** UOM string. */
  unit?: string;
  quantity: string;
  unitPrice: string;
  /** Stock item FK when this line was picked from the catalog. Drives
   *  the V118 Phase-2 server-side decrement of {@code stock_items.stock_qty}.
   *  Lines typed ad-hoc leave this null and don't touch inventory. */
  stockItemId?: string | null;
  /** Holds the raw text the user is typing in the Total cell while
   *  that cell has focus. Lets the input stay controlled without
   *  glitching against the round-trip rounded value (the canonical
   *  state is still {@link #unitPrice}; we back-compute it on every
   *  total keystroke). Cleared on blur. */
  totalEditing?: string;
}

const blankItem: FormItem = { name: '', description: '', unit: '', quantity: '1', unitPrice: '0', stockItemId: null };

// StockItemPicker moved to ../common/StockItemPicker so Quotations
// and Vouchers can mount the same picker without duplicating the
// popover + search logic.

function InvoiceFormDialog({
  open, onOpenChange, kind, customers, invoices, editing, parentPrefill, settings, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: invoicesApi.InvoiceKind;
  customers: customersApi.Customer[];
  invoices: invoicesApi.Invoice[];
  /** When set, the dialog runs in edit mode against this invoice
   *  instead of creating a new one. Submit calls PUT /invoices/{id}
   *  instead of POST /invoices. */
  editing?: invoicesApi.Invoice | null;
  /** When set on a create-mode open, seeds parentInvoiceId so the
   *  parent picker is pre-filled. Used by the inline "adjust"
   *  dropdown on commercial / tax rows. */
  parentPrefill?: string | null;
  /** Tenant-wide toggles driving which optional sections of the form
   *  render (Notes / Terms / Discount / Tax). Comes from the
   *  Accountant Settings popup; falls back to "all on" if the
   *  parent didn't pass it. */
  settings: accountingSettingsApi.AccountingSettings;
  /** Fired after Save & Close. The {@code created} arg carries the
   *  just-persisted invoice so the parent can chain a follow-up
   *  (open detail, fire the image-based Telegram). Undefined when
   *  the source path doesn't have a row to forward (e.g. "Save & add
   *  new" which keeps the dialog open). */
  onCreated: (created?: invoicesApi.Invoice) => Promise<void> | void;
}) {
  const isAdjustment = kind === 'credit_note' || kind === 'debit_note';
  const isEdit = !!editing;

  const [customerId, setCustomerId] = useState('');
  const [parentInvoiceId, setParentInvoiceId] = useState('');
  /** Document number — pre-filled from /invoices/next-number on open
   *  for fresh creates and from the row on edit. Free-form input so
   *  HR can override the auto-sequential when needed (e.g. matching
   *  an external paper invoice). */
  const [invoiceNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  // Tenant currency settings (V166). Drives the Currency dropdown
  // options + the default currency / exchange rate for fresh
  // invoices. Refetched every time the dialog OPENS — the tenant
  // currency pair can change via Settings > Currency while this form
  // was still mounted, and we want the fresh values on the next open.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    if (!open) return;
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, [open]);
  const currencyOptions = currencyApi.enabledCurrencies(currencySettings);
  const [items, setItems] = useState<FormItem[]>([{ ...blankItem }]);
  // Catalog cache for the per-line stock-item picker (V118 Phase-2).
  // Loaded lazily the first time the user opens the picker so the dialog's
  // initial render stays light when the operator is just adding ad-hoc lines.
  const [stockCatalog, setStockCatalog] = useState<itemsApi.Item[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Per-tenant gate from the Items → Settings dialog (V120). When
  // false, the catalog picker icon is hidden and lines fall back to
  // the free-text Item column. Soft-fail to false on 403 so a tenant
  // without stock permissions doesn't see a broken picker.
  const [pickerEnabled, setPickerEnabled] = useState(false);
  useEffect(() => {
    itemsApi.getUsageSettings()
      .then(s => setPickerEnabled(s.enabledForInvoice))
      .catch(() => setPickerEnabled(false));
  }, []);
  // Recent-line-items dropdown — surfaces the last 5 names HR typed
  // across all three doc forms (invoice / quotation / voucher).
  // `focusedItemIdx` tracks which row's Item input is currently
  // active; the dropdown only renders for that row + only when the
  // name is empty (no point suggesting recents over their own typing).
  const [focusedItemIdx, setFocusedItemIdx] = useState<number | null>(null);
  const [recentItems, setRecentItems] = useState(() => getRecentLineItems());
  const ensureCatalog = async () => {
    if (catalogLoaded) return;
    try {
      const res = await itemsApi.list({ size: 200 });
      setStockCatalog(res.content ?? []);
    } catch {
      // Silent fail: a 403 (no stock perm) just leaves the picker empty —
      // free-text lines still work.
    } finally {
      setCatalogLoaded(true);
    }
  };
  const [taxType, setTaxType] = useState<invoicesApi.InvoiceTaxType | ''>('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountType, setDiscountType] = useState<invoicesApi.DiscountType>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens. In edit mode, hydrate from the
  // invoice being edited; otherwise blank state for a fresh create,
  // and kick off a /next-number fetch so the doc-number input shows
  // the auto-generated default without waiting for the user to type.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(editing.customerId);
      setParentInvoiceId(editing.parentInvoiceId ?? '');
      setInvoiceNo(editing.invoiceNo);
      setIssueDate(editing.issueDate);
      setDueDate(editing.dueDate ?? '');
      setCurrency(editing.currency);
      setExchangeRate(String(editing.exchangeRate));
      setItems(editing.items.length === 0
        ? [{ ...blankItem }]
        : editing.items.map(it => ({
            name: it.name,
            description: it.description ?? '',
            unit: it.unit ?? '',
            quantity: String(it.quantity),
            unitPrice: String(it.unitPrice),
            stockItemId: it.stockItemId ?? null,
          })));
      setTaxType((editing.taxType ?? '') as invoicesApi.InvoiceTaxType | '');
      setTaxAmount(String(editing.taxAmount));
      setDiscountType(editing.discountType ?? 'amount');
      setDiscountValue(String(editing.discountValue ?? editing.discountAmount));
      setNotes(editing.notes ?? '');
      setTerms(editing.terms ?? '');
    } else {
      // For a CN/DN opened via the inline dropdown, seed the parent
      // (and customer + currency + taxType) from the parent invoice
      // so HR doesn't re-pick them.
      const seedParent = parentPrefill ? invoices.find(i => i.id === parentPrefill) : undefined;
      setCustomerId(seedParent?.customerId ?? '');
      setParentInvoiceId(parentPrefill ?? '');
      setInvoiceNo('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setCurrency(seedParent?.currency ?? currencySettings?.primaryCurrency ?? 'USD');
      setExchangeRate(seedParent
        ? String(seedParent.exchangeRate)
        : String(currencySettings?.secondaryRate ?? 4100));
      setItems([{ ...blankItem }]);
      setTaxType((seedParent?.taxType ?? '') as invoicesApi.InvoiceTaxType | '');
      setTaxAmount('0');
      setDiscountType('amount');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
      // Fetch the preview after state resets — race-protected so a
      // rapid kind switch doesn't land the wrong value.
      let cancelled = false;
      invoicesApi.nextNumber(kind)
        .then(res => { if (!cancelled) setInvoiceNo(res.invoiceNo); })
        .catch(() => { /* non-fatal — user can type their own */ });
      return () => { cancelled = true; };
    }
  }, [open, kind, editing, parentPrefill, invoices]);

  // Follow-up sync: when the tenant currency settings arrive AFTER
  // the reset effect above ran (network race on first open), pin the
  // form's currency + exchange rate to the tenant defaults. Skip in
  // edit mode (row's own currency wins) and CN/DN parent-prefill
  // (parent's currency wins).
  useEffect(() => {
    if (!open || editing || parentPrefill || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
    setExchangeRate(String(currencySettings.secondaryRate ?? 4100));
  }, [open, editing, parentPrefill, currencySettings]);

  const rootInvoiceOptions = useMemo(() =>
    invoices.filter(i => (i.kind === 'commercial' || i.kind === 'tax') && i.status !== 'void'),
    [invoices]
  );

  const subtotal = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  // When a Taxation pattern is selected, tax = subtotal × rate (server
  // applies the same formula on save); the manual Tax input is locked.
  // Otherwise fall back to whatever the user typed.
  const computedTax = taxType
    ? subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100
    : (Number(taxAmount) || 0);
  // Discount is either a flat amount or a % of subtotal. The toggle
  // determines which; server applies the same formula on save.
  const computedDiscount = discountType === 'percent'
    ? subtotal * (Number(discountValue) || 0) / 100
    : (Number(discountValue) || 0);
  const total = subtotal + computedTax - computedDiscount;

  const updateItem = (idx: number, patch: Partial<FormItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addItem = () => setItems(prev => [...prev, { ...blankItem }]);
  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /** Build the request payload from the current form state. Used by
   *  every save flow (create / update / save & add new). */
  const buildPayload = (): invoicesApi.InvoiceRequest => ({
    kind,
    parentInvoiceId: isAdjustment ? parentInvoiceId : undefined,
    invoiceNo: invoiceNo.trim() || undefined,
    customerId,
    issueDate,
    dueDate: dueDate || undefined,
    currency,
    exchangeRate: Number(exchangeRate) || 1,
    taxType: (taxType || null) as invoicesApi.InvoiceTaxType | null,
    // computedTax mirrors what the server will write — sending it
    // keeps the printed amount in sync if someone reads the request
    // body before the server's recompute lands.
    taxAmount: computedTax,
    discountType,
    discountValue: Number(discountValue) || 0,
    discountAmount: computedDiscount,
    notes: notes || undefined,
    terms: terms || undefined,
    items: items.map(it => ({
      name: it.name.trim(),
      description: it.description?.trim() || undefined,
      unit: it.unit?.trim() || undefined,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      stockItemId: it.stockItemId || undefined,
    })),
  });

  const validate = (): boolean => {
    if (!customerId) { toast.error('Customer is required'); return false; }
    if (isAdjustment && !parentInvoiceId) { toast.error('Pick the invoice this note adjusts'); return false; }
    if (items.length === 0 || items.some(it => !it.name.trim())) {
      toast.error('Each line item needs a name');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let saved: invoicesApi.Invoice;
      if (isEdit && editing) {
        saved = await invoicesApi.update(editing.id, buildPayload());
        toast.success(`${editing.invoiceNo} updated`);
      } else {
        saved = await invoicesApi.create(buildPayload());
        toast.success(`${KIND_LABEL[kind]} created as draft`);
      }
      // Push the just-saved names into the cross-doc "recent items"
      // cache so the typeahead surfaces them on the next form open.
      addRecentLineItems(items.map(it => ({
        name: it.name,
        unit: it.unit,
        unitPrice: Number(it.unitPrice) || undefined,
      })));
      setRecentItems(getRecentLineItems());
      // Auto-send via Telegram when the Invoice Settings toggle is
      // on. Text-only path here — the print template isn't mounted
      // in the form context so html2canvas would find no element.
      // The detail dialog's Send → Telegram button still captures
      // the image when the operator triggers it manually.
      if (settings.autoSendTelegram) {
        try {
          const res = await invoicesApi.sendTelegram(saved.id);
          if (res.status === 'sent') {
            toast.success('Sent to customer via Telegram');
          } else if (res.status === 'not_linked') {
            toast.info('Customer hasn\'t connected their Telegram yet — saved without sending.');
          } else if (res.status === 'failed') {
            toast.error(`Telegram send failed: ${res.message ?? 'unknown error'}`);
          }
        } catch (e) {
          // Auto-send failures shouldn't block the save flow — the
          // invoice already persisted, only the side-channel
          // delivery missed. Surface as a warning, then continue.
          toast.error(e instanceof Error ? e.message : 'Telegram auto-send failed');
        }
      }
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const totalKhr = total * (Number(exchangeRate) || 0);

  /** Create → issue chain, used by both "Save & add new" and
   *  "Save & close" so the two share the exact same skip-draft path.
   *  Returns the created row (with status flipped to progress when
   *  the issue step succeeds) so the caller can decide what to do
   *  with the dialog afterwards.
   *
   *  <p>Both legs pass {@code notifyTelegram=false} — when the tenant
   *  has the auto-issue setting on, the BE creates the row directly
   *  in {@code progress} and would otherwise text-only-Telegram the
   *  customer. We suppress that here so the parent can follow up
   *  with the image-based sendPhoto (matching the Send → Telegram
   *  button). The double-issue guard checks the returned status —
   *  the BE may have already issued, in which case calling issue()
   *  a second time would 409 with "Only draft can be issued".</p> */
  const createAndIssue = async () => {
    const created = await invoicesApi.create(buildPayload(), false);
    if (created.status === 'progress') {
      // BE auto-issued at create time (tenant has auto-issue on).
      // Nothing else to do — return the already-issued row.
      toast.success(`${KIND_LABEL[kind]} ${created.invoiceNo} issued`);
      return created;
    }
    try {
      const issued = await invoicesApi.issue(created.id, false);
      toast.success(`${KIND_LABEL[kind]} ${issued.invoiceNo} issued`);
      return issued;
    } catch (e) {
      toast.warning(`${created.invoiceNo} created as draft (issue failed: ${e instanceof Error ? e.message : 'unknown'})`);
      return created;
    }
  };

  /** Save the current entry as a *progress* invoice and keep the
   *  dialog open with a freshly-armed form so the bookkeeper can
   *  chain entries without re-opening. Customer + dates carry over;
   *  lines + amounts reset. onCreated is intentionally NOT called
   *  here — the parent uses it to close the dialog, and we want it
   *  to stay open. The list is refreshed when the dialog is closed
   *  via Cancel / Save & close. */
  const submitAndNew = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createAndIssue();
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  /** Save the current entry as a *progress* invoice and close the
   *  dialog. Same skip-draft path as Save & add new; only the
   *  follow-up differs. Forwards the just-created invoice to the
   *  parent so it can decide whether to chain the auto-send-Telegram
   *  flow (open the detail dialog briefly to capture the print
   *  template into a PNG and sendPhoto). */
  const submitAndClose = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createAndIssue();
      await onCreated(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-[1260px] beats the dialog default `sm:max-w-lg` —
          without the sm: prefix the variant rule keeps winning above
          the 640px breakpoint. */}
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/* Tooltip hosts the long copy on hover so the title bar
              stays compact. Visible label is the short title; the
              DialogDescription below is sr-only for Radix' a11y. */}
          <DialogTitle className="flex items-center gap-1.5">
            {isEdit ? `Edit ${editing?.invoiceNo}` : `New ${KIND_LABEL[kind]}`}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={`${KIND_LABEL[kind]} form description`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {isAdjustment
                  ? 'Adjustment note against the parent invoice. Totals re-compute as you change line items.'
                  : 'Capture the line items, taxation, and discount. Totals re-compute as you type.'}
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isAdjustment
              ? 'Adjustment note against the parent invoice. Totals re-compute as you change line items.'
              : 'Capture the line items, taxation, and discount. Totals re-compute as you type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isAdjustment && (
            <div className="space-y-1.5">
              <Label className="text-xs">Adjusts invoice *</Label>
              <Select value={parentInvoiceId} onValueChange={setParentInvoiceId}>
                <SelectTrigger><SelectValue placeholder="Pick the original invoice" /></SelectTrigger>
                <SelectContent>
                  {rootInvoiceOptions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No commercial or tax invoices to adjust
                    </SelectItem>
                  ) : rootInvoiceOptions.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoiceNo} — {KIND_LABEL[i.kind]} — {fmtMoney(i.total, i.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer picker on the left, document number on the
              right. The number input is pre-filled by /next-number
              when the dialog opens — HR can keep the sequential default
              or type their own (e.g. matching a paper invoice). Edit
              mode hydrates the existing row's number; changes flow
              through PUT and the unique (tenant, invoice_no)
              constraint catches conflicts. */}
          <div className="grid grid-cols-[1fr_280px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer *</Label>
              <SearchablePicker
                value={customerId}
                onChange={setCustomerId}
                placeholder="Pick customer"
                searchPlaceholder="Search by name, phone, or TIN…"
                allowClear={false}
                options={customers.map(c => ({
                  value: c.id,
                  label: c.name,
                  secondary: c.type === 'business'
                    ? `Business · ${c.tin ?? c.phone ?? ''}`
                    : `Individual · ${c.phone ?? ''}`,
                  searchKey: `${c.name} ${c.phone ?? ''} ${c.tin ?? ''} ${c.representative ?? ''}`,
                }))}
              />
              {/* Business customers carry extra info that HR needs to
                  see on the invoice (TIN / representative / address);
                  individuals show their phone + address. The card is
                  a quick-glance review so the bookkeeper can confirm
                  the right party is selected before saving. */}
              <CustomerInfoCard customer={customers.find(c => c.id === customerId)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {kind === 'credit_note' ? 'Credit Note No.'
                  : kind === 'debit_note' ? 'Debit Note No.'
                  : 'Invoice No.'}
              </Label>
              <Input
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                className="tabular-nums"
                placeholder="Auto-generated"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            {/* Gated on `currencySettings` being loaded to avoid a
                brief USD/KHR flash from the enabledCurrencies fallback
                while the fetch is in flight. */}
            {currencySettings && currencyOptions.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Exchange-rate field renders only when the tenant has
                a secondary currency AND it differs from the form's
                selected currency. Same-currency conversion has no
                meaning, so hide the field to keep the form focused. */}
            {currencySettings?.secondaryCurrency && currency !== currencySettings.secondaryCurrency && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Exchange rate ({currencySettings.secondaryCurrency} per 1 {currency || 'USD'})
                </Label>
                <Input
                  type="number" min={0} step="0.0001"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(e.target.value)}
                  placeholder={String(currencySettings?.secondaryRate ?? 4100)}
                />
              </div>
            )}
          </div>

          {/* Line items editor — Item / Specification / UOM / Qty /
              Unit price / Line total. Specification is a free-form
              detail ("Coke 330ml can" / "WD-40 1L spray", etc.); UOM
              is the unit it's sold in. Both feed the printed invoice
              line and stay snapshotted on the row at issue time. */}
          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Line items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 px-1">
              <div className="col-span-3">Item</div>
              <div className="col-span-3">Specification</div>
              <div className="col-span-1">UOM</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {items.map((it, idx) => {
              const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 flex items-center gap-1">
                    {/* Stock-catalog picker (V118 Phase-2). Gated by
                        the per-tenant Items → Settings toggle (V120) —
                        hidden when the tenant hasn't opted in for
                        Invoice. Free-text Item column always works. */}
                    {pickerEnabled && (
                      <StockItemPicker
                        catalog={stockCatalog}
                        loaded={catalogLoaded}
                        onOpen={ensureCatalog}
                        selectedId={it.stockItemId ?? ''}
                        onPick={si => updateItem(idx, {
                          stockItemId: si.id,
                          name: si.name,
                          unit: si.unit ?? it.unit ?? '',
                          unitPrice: String(si.unitPrice ?? 0),
                          totalEditing: undefined,
                        })}
                      />
                    )}
                    <div className="relative flex-1">
                      <Input
                        className="h-8 text-sm w-full"
                        value={it.name}
                        onChange={e => updateItem(idx, {
                          name: e.target.value,
                          // Hand-editing the name unlinks it from the
                          // catalog item — otherwise the server would
                          // still decrement the (now-mismatched) stock row.
                          stockItemId: null,
                        })}
                        onFocus={() => setFocusedItemIdx(idx)}
                        // Delay so a mousedown on a suggestion can
                        // register before the blur tears down the
                        // dropdown. mousedown handler also calls
                        // preventDefault, but the timeout is the safety
                        // net for keyboard / touch focus transitions.
                        onBlur={() => setTimeout(() => setFocusedItemIdx(p => p === idx ? null : p), 120)}
                        placeholder="Item or service name"
                      />
                      {/* Recent-items typeahead. Renders only when this
                          row is focused AND empty — once HR starts
                          typing we get out of the way (catalog picker
                          icon + free-text input handle the rest). */}
                      {focusedItemIdx === idx && !it.name && recentItems.length > 0 && (
                        <div className="absolute top-full left-0 mt-1 w-72 z-20 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
                          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-400 border-b">
                            Recent
                          </div>
                          {recentItems.map(r => (
                            <button
                              key={r.name}
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 border-b last:border-b-0"
                              // mousedown + preventDefault keeps the
                              // input's focus alive long enough for
                              // the click handler to fire reliably.
                              onMouseDown={e => {
                                e.preventDefault();
                                updateItem(idx, {
                                  name: r.name,
                                  unit: r.unit ?? it.unit ?? '',
                                  unitPrice: r.unitPrice != null ? String(r.unitPrice) : it.unitPrice,
                                  totalEditing: undefined,
                                  stockItemId: null,
                                });
                                setFocusedItemIdx(null);
                              }}
                            >
                              <div className="font-medium truncate">{r.name}</div>
                              <div className="text-[11px] text-gray-500 flex justify-between gap-2">
                                <span>{r.unit ?? 'pcs'}</span>
                                <span className="tabular-nums">
                                  {(r.unitPrice ?? 0).toFixed(2)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <Input
                    className="col-span-3 h-8 text-sm"
                    value={it.description ?? ''}
                    onChange={e => updateItem(idx, { description: e.target.value })}
                    placeholder="Model, size, variant…"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm"
                    value={it.unit ?? ''}
                    onChange={e => updateItem(idx, { unit: e.target.value })}
                    placeholder="pcs"
                  />
                  <Input
                    className="col-span-1 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={it.quantity}
                    onChange={e => updateItem(idx, {
                      quantity: e.target.value,
                      // Changing qty invalidates a stale Total
                      // override — fall back to the canonical
                      // qty × unitPrice display.
                      totalEditing: undefined,
                    })}
                  />
                  <Input
                    className="col-span-2 h-8 text-sm text-right"
                    type="number" min={0} step="0.01"
                    value={it.unitPrice}
                    onChange={e => updateItem(idx, {
                      unitPrice: e.target.value,
                      // Switching focus to Unit Price → Total returns
                      // to the computed-from-unitPrice path.
                      totalEditing: undefined,
                    })}
                  />
                  {/* Total cell is editable too — typing here
                      back-computes unitPrice = total ÷ qty. While the
                      Total input has focus we display the raw user
                      string verbatim (totalEditing) so the cursor
                      doesn't jump as the rounded round-trip value
                      changes; on blur we drop back to the canonical
                      qty×unitPrice display. */}
                  <Input
                    className="col-span-1 h-8 text-sm text-right tabular-nums"
                    type="number" min={0} step="0.01"
                    value={it.totalEditing !== undefined
                      ? it.totalEditing
                      : lineTotal.toFixed(2)}
                    onChange={e => {
                      const raw = e.target.value;
                      const total = Number(raw);
                      const qty = Number(it.quantity) || 0;
                      // Keep enough precision on the back-computed
                      // unitPrice so that for divisible totals the
                      // displayed lineTotal lands exactly back on what
                      // the user typed (e.g. qty=3, total=100 → uP
                      // = 33.3333 → display = 99.9999). Stored as a
                      // string so React doesn't rerun toFixed weirdly.
                      const nextUnitPrice = qty > 0 && raw !== '' && Number.isFinite(total)
                        ? String(total / qty)
                        : it.unitPrice;
                      updateItem(idx, {
                        unitPrice: nextUnitPrice,
                        totalEditing: raw,
                      });
                    }}
                    onBlur={() => updateItem(idx, { totalEditing: undefined })}
                  />
                  <Button
                    size="sm" variant="ghost"
                    className="col-span-1 h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    title="Remove line"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Tax controls — pick a Taxation pattern from the
              cross-system reference; server applies subtotal × rate.
              Commercial / CN-DN-against-commercial → just VAT 0% +
              Exclusive VAT. Tax / CN-DN-against-tax → all five. */}
          {/* Tax + Discount row. Each cell is gated by the tenant
              Accountant Settings — flip a toggle off in the Settings
              popup and the matching cell vanishes here. Row only
              renders if at least one cell is visible. */}
          {(settings.showTax || settings.showDiscount) && (
          <div className="grid grid-cols-3 gap-3">
            {settings.showTax && (
            <div className="space-y-1.5">
              <Label className="text-xs">Taxation</Label>
              <Select
                value={taxType || '_none'}
                onValueChange={v => setTaxType(v === '_none' ? '' : v as invoicesApi.InvoiceTaxType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {TAX_TYPES_FOR_KIND(
                    kind,
                    parentPrefill
                      ? (invoices.find(i => i.id === parentPrefill)?.kind)
                      : (editing?.parentInvoiceId
                          ? invoices.find(i => i.id === editing.parentInvoiceId)?.kind
                          : undefined),
                  )
                    // Tenant-enabled set from the Settings popup acts
                    // as a second filter on top of the kind-based one.
                    // Keep the existing value visible during edit even
                    // if it's since been disabled — preserves the row
                    // without forcing a re-pick on every open.
                    .filter(t => settings.taxTypesEnabled.includes(t.key) || t.key === editing?.taxType)
                    .map(t => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            {settings.showTax && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Tax {taxType && TAX_TYPE_BY_KEY[taxType] && (
                  <span className="text-[10px] text-gray-400">@ {TAX_TYPE_BY_KEY[taxType].rate}%</span>
                )}
              </Label>
              <Input
                type="number" min={0} step="0.01"
                value={taxType
                  ? (subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100).toFixed(2)
                  : taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                disabled={!!taxType}
                title={taxType ? 'Auto-computed from the taxation type' : ''}
              />
            </div>
            )}
            {settings.showDiscount && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Discount {discountType === 'percent' && (
                  <span className="text-[10px] text-gray-400">→ {fmtMoney(computedDiscount, currency)}</span>
                )}
              </Label>
              {/* Input + segmented type toggle on the right end. The
                  $ button = flat money-off, % button = percent of
                  subtotal. Server recomputes discount_amount on save. */}
              <div className="flex">
                <Input
                  type="number" min={0} step="0.01"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="rounded-r-none"
                />
                <div className="inline-flex border border-l-0 rounded-r-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDiscountType('amount')}
                    className={`px-3 text-sm ${discountType === 'amount'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Flat money-off"
                  >$</button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-3 text-sm border-l ${discountType === 'percent'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Percentage of subtotal"
                  >%</button>
                </div>
              </div>
            </div>
            )}
          </div>
          )}

          {/* Two-column layout: Notes on the left (internal memo),
              Terms + Summary stacked on the right (customer-facing
              terms above the totals card). Same shape on create,
              edit, and detail surfaces. */}
          {/* Notes / Terms 2-col + summary. Notes is the internal memo,
              Terms is customer-facing. Either or both can be hidden
              via the Accountant Settings popup. When only one is on
              we drop to a single-column layout so the visible textarea
              gets full width. */}
          <div className={`grid gap-3 ${
            (settings.showNotes && settings.showTerms) ? 'grid-cols-2' : 'grid-cols-1'
          }`}>
            {settings.showNotes && (
            <div className="space-y-1.5 flex flex-col">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={8}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Internal note or memo (not printed on the invoice)"
                className="flex-1 resize-none"
              />
            </div>
            )}
            <div className="space-y-3 flex flex-col">
              {settings.showTerms && (
              <div className="space-y-1.5 flex-1 flex flex-col">
                <Label className="text-xs">Terms &amp; conditions</Label>
                <Textarea
                  rows={3}
                  value={terms} onChange={e => setTerms(e.target.value)}
                  placeholder="Payment terms, bank details, or disclaimers — printed on the invoice"
                  className="flex-1 resize-none"
                />
              </div>
              )}
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(subtotal, currency)}</span>
                </div>
                {settings.showTax && (
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Tax</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(computedTax, currency)}</span>
                </div>
                )}
                {settings.showDiscount && (
                <div className="flex justify-end gap-6">
                  <span className="text-gray-600">Discount</span>
                  <span className="tabular-nums w-32 text-right">− {fmtMoney(computedDiscount, currency)}</span>
                </div>
                )}
                <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1">
                  <span>Total {currency}</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(total, currency)}</span>
                </div>
                {/* Secondary-currency total — same visibility rule as
                    the exchange-rate input: hidden when the tenant has
                    no secondary configured, or when the invoice's
                    currency IS the secondary (nothing to convert into). */}
                {currencySettings?.secondaryCurrency && currency !== currencySettings.secondaryCurrency && (
                  <div className="flex justify-end gap-6 text-gray-700">
                    <span>
                      Total {currencySettings.secondaryCurrency}
                      {' '}<span className="text-[10px] text-gray-400">@ {Number(exchangeRate) || 0}</span>
                    </span>
                    <span className="tabular-nums w-32 text-right">
                      {currencySettings.secondaryCurrency} {totalKhr.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {/* Save & add new and Save & close both skip Draft and issue
              directly to Progress — only available on create, since on
              edit the row already exists with a final state. */}
          {!isEdit && (
            <>
              <Button variant="outline" onClick={submitAndNew} disabled={saving} title="Save as Progress and reset the form for the next entry">
                {saving ? 'Saving…' : 'Save & add new'}
              </Button>
              <Button variant="outline" onClick={submitAndClose} disabled={saving} title="Save as Progress and close the dialog">
                {saving ? 'Saving…' : 'Save & close'}
              </Button>
            </>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create draft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail dialog — read-only view + actions + payments                        */
/* -------------------------------------------------------------------------- */
function InvoiceDetailDialog({
  invoiceId, customers, canEdit, settings, onClose, onChanged, onEdit,
  autoSendTelegram, onAutoSendConsumed,
}: {
  invoiceId: string;
  customers: customersApi.Customer[];
  canEdit: boolean;
  /** Tenant Accountant settings — same flags that drive the create
   *  form gate the View Details popup too, so a section that's
   *  hidden on the form (e.g. Discount off) also disappears here. */
  settings: accountingSettingsApi.AccountingSettings;
  onClose: () => void;
  onChanged: () => void;
  /** Called when the user clicks Edit. The parent should close this
   *  dialog and open the form dialog in edit-mode with the invoice. */
  onEdit: (inv: invoicesApi.Invoice) => void;
  /** When true, the dialog fires a one-shot image-based Telegram
   *  send right after the invoice + company info finish loading.
   *  Used by the Save & Close path so the customer receives the
   *  rendered invoice (sendPhoto) instead of the BE's text-only
   *  fallback. */
  autoSendTelegram?: boolean;
  /** Callback to flip {@code autoSendTelegram} off in the parent so
   *  the send never fires twice (e.g. on a re-render). */
  onAutoSendConsumed?: () => void;
}) {
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [parentInvoice, setParentInvoice] = useState<invoicesApi.Invoice | null>(null);
  const { formatDate } = useDateFormat();
  // Tenant-wide currency settings — drives the secondary-total row's
  // visibility + label on the totals block below. The invoice itself
  // stores only its own currency + exchange rate; the secondary code
  // (KHR / KRW / …) comes from the current tenant setting so the
  // detail view uses the same vocabulary the form does.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  // Company info drives the print header (logo, Khmer + English name,
  // VAT TIN boxes, address, phone). Loaded once when the dialog opens —
  // soft-fail so the print still renders without it.
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  /** Tenant's active default invoice template. Null until the API
   *  responds; the print component falls back to the built-in config
   *  in that window (and permanently when the tenant has no custom
   *  default active). */
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate | null>(null);
  // Payments augmented with the source document they were recorded
  // against — so the unified table on a root invoice can show
  // payments + DN receipts + CN refunds in one chronological view.
  type LedgerPayment = paymentsApi.Payment & {
    documentNo: string;
    documentKind: invoicesApi.InvoiceKind;
  };
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  /** Pagination over the line items + the unified payments ledger
   *  inside the detail dialog. Same Cash-Advance-style usePagination
   *  hook the list pages use, so the UX feels identical when an
   *  invoice carries a long line list or has been adjusted many
   *  times via CN/DN. Resets to page 1 whenever the source array
   *  reference flips (after a payment add / void). */
  const itemsPagination = usePagination(invoice?.items ?? [], 10);
  const paymentsPagination = usePagination(payments, 10);
  /** Pending payment to show the customer receipt card for. Set on
   *  the row's "Receipt" button; cleared when the dialog closes. */
  const [receiptForPayment, setReceiptForPayment] = useState<LedgerPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  /** Auto-minted PayWay session for this invoice — populated on load
   *  when the backend has one saved. Used to attach the checkout URL
   *  to outgoing Mail / Telegram invoice sends so the customer
   *  receives a payable link alongside the invoice itself. */
  const [paymentLink, setPaymentLink] = useState<paywayApi.PurchaseSession | null>(null);
  // Dedicated flag for the Telegram send so the dropdown trigger
  // can show a spinner + block double-clicks without also locking
  // out the Edit / Void / Record-payment actions that share `busy`.
  const [telegramBusy, setTelegramBusy] = useState(false);

  /** Manual "Send via Telegram" trigger. Hits the synchronous
   *  send endpoint so the operator sees an immediate toast for the
   *  three outcomes that matter: delivered, customer not linked,
   *  or agent unreachable.
   *
   *  <p>Captures the currently-mounted print template DOM as a PNG
   *  before calling the API so the customer receives the actual
   *  WABOOKS layout via Telegram sendPhoto. Capture failures fall
   *  back silently to a plain text message — never blocks the
   *  send.</p> */
  const sendViaTelegram = async () => {
    if (!invoice || telegramBusy) return;
    setTelegramBusy(true);
    try {
      const imageDataUrl = await capturePrintImage();
      const res = await invoicesApi.sendTelegram(invoice.id, imageDataUrl ?? undefined);
      switch (res.status) {
        case 'sent':
          toast.success(`Invoice ${invoice.invoiceNo} sent via Telegram`);
          break;
        case 'not_linked':
          toast.error('Customer hasn\'t connected their Telegram yet — share the link from the Customers page first.');
          break;
        case 'disabled':
          toast.error('Telegram delivery isn\'t configured on this server.');
          break;
        case 'failed':
          toast.error(`Telegram send failed: ${res.message ?? 'unknown error'}`);
          break;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Telegram send failed');
    } finally {
      setTelegramBusy(false);
    }
  };

  const customer = invoice ? customers.find(c => c.id === invoice.customerId) : undefined;

  /** Print routing (V135): POS-origin invoices render the thermal
   *  receipt; everything else uses the standard Khmer-fonts invoice
   *  print. Looks up the POS order + POS settings + items catalog
   *  on demand so the receipt has the cash-tendered / change / queue
   *  number / per-line notes the regular Invoice payload doesn't
   *  carry. Falls back to the invoice print if the lookup fails so
   *  the operator always gets a printable artefact. */
  const printInvoiceOrReceipt = async (inv: invoicesApi.Invoice) => {
    if (!inv.posOrderId) {
      await printWithKhmerFonts();
      return;
    }
    try {
      const [order, settings, items] = await Promise.all([
        posApi.getByInvoice(inv.id),
        accountingSettingsApi.get('pos'),
        itemsApi.list({ size: 500 }),
      ]);
      const ok = printPosReceipt({
        order,
        settings,
        items: items.content,
        shopNameFallback: companyInfo?.name ?? undefined,
      });
      if (!ok) toast.error('Could not open the print dialog.');
    } catch (e) {
      console.warn('POS receipt lookup failed, falling back to invoice print', e);
      await printWithKhmerFonts();
    }
  };

  // USD-equivalent AR — collapses USD + (KHR ÷ rate) payments against
  // Total USD (= invoice.total + ΣDN − ΣCN). Used both by the AR row in
  // the summary block and to gate the Record-payment button: as long as
  // there's outstanding AR, allow more payments even if the server-side
  // status flipped to "paid" via the legacy currency-blind sum.
  const arUsd: number = (() => {
    if (!invoice) return 0;
    const isCn = invoice.kind === 'credit_note';
    const nonVoidAdj = (invoice.adjustments ?? []).filter(a => a.status !== 'void');
    const sumDn = nonVoidAdj.filter(a => a.kind === 'debit_note').reduce((s, a) => s + a.total, 0);
    const sumCn = nonVoidAdj.filter(a => a.kind === 'credit_note').reduce((s, a) => s + a.total, 0);
    // Sign convention flips on a CN: for invoice / DN, credit-direction
    // payments settle the AR (customer paid us); for a CN, the
    // settlement direction is DEBIT (we refunded the customer). Without
    // this flip a fully-refunded $55 CN reads AR = $55 − (−$55) = $110.
    const sumByCurrency = (cur: 'USD' | 'KHR') => payments
      .filter(p => p.currency === cur)
      .reduce((s, p) => {
        const settles = isCn ? p.direction === 'debit' : p.direction === 'credit';
        return s + (settles ? p.amount : -p.amount);
      }, 0);
    const receivedUsd = sumByCurrency('USD');
    const receivedKhr = sumByCurrency('KHR');
    const rate = invoice.exchangeRate || 0;
    const receivedTotalUsd = receivedUsd + (rate > 0 ? receivedKhr / rate : 0);
    return invoice.total + sumDn - sumCn - receivedTotalUsd;
  })();

  const load = async () => {
    setLoading(true);
    try {
      const inv = await invoicesApi.get(invoiceId);
      setInvoice(inv);
      // Build the list of documents that contribute payments to this
      // dialog: the invoice itself + each non-void adjustment if this
      // is a root invoice. For an adjustment view (CN/DN) we just
      // fetch its own payments.
      const sources: { id: string; invoiceNo: string; kind: invoicesApi.InvoiceKind }[] = [
        { id: inv.id, invoiceNo: inv.invoiceNo, kind: inv.kind },
      ];
      if (!inv.parentInvoiceId) {
        for (const a of inv.adjustments ?? []) {
          if (a.status !== 'void') {
            sources.push({ id: a.id, invoiceNo: a.invoiceNo, kind: a.kind });
          }
        }
      }
      const payArrays = await Promise.all(
        sources.map(s =>
          // 4xx is normal when the user has no payment:view; swallow rather
          // than tossing a toast for the read-only audit panel.
          paymentsApi.listForInvoice(s.id).catch(() => [] as paymentsApi.Payment[]),
        ),
      );
      const combined: LedgerPayment[] = [];
      payArrays.forEach((arr, idx) => {
        const src = sources[idx];
        for (const p of arr) {
          combined.push({ ...p, documentNo: src.invoiceNo, documentKind: src.kind });
        }
      });
      // Sort chronological so the table reads like a ledger.
      combined.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      setPayments(combined);
      // If this is an adjustment, follow the parent edge so the
      // "Adjusts invoice" row can show the human-readable number
      // instead of a raw UUID. Soft-fail — a deleted parent
      // (theoretically impossible since we block delete with kids)
      // shouldn't crash the read.
      if (inv.parentInvoiceId) {
        invoicesApi.get(inv.parentInvoiceId)
          .then(setParentInvoice)
          .catch(() => setParentInvoice(null));
      } else {
        setParentInvoice(null);
      }
      // Look up an existing PayWay paylink for this invoice. The
      // server auto-mints on issue when ABA PayWay is configured,
      // so most issued invoices come back with a ready URL. Soft-
      // fail — a missing endpoint or 4xx just means "no link yet"
      // and the operator can still mint manually via the button.
      try {
        const link = await paywayApi.findInvoicePaymentLink(inv.id);
        setPaymentLink(link);
      } catch {
        setPaymentLink(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoiceId]);
  useEffect(() => {
    settingsApi.getCompanyInfo().then(setCompanyInfo).catch(() => setCompanyInfo(null));
  }, []);
  /** Fetch the active default template on mount. 404 → null → the
   *  print component uses the built-in config. */
  useEffect(() => {
    invoiceTemplates.getDefault('invoice')
      .then(setInvoiceTemplate)
      .catch(() => setInvoiceTemplate(null));
  }, []);

  /** Auto-send-Telegram one-shot — used by the Save & Close create
   *  path. Waits for the invoice + company info to load (the print
   *  template needs both to render fully), gives the DOM one paint
   *  cycle, then captures the print template as a PNG and fires
   *  sendTelegram. The {@code autoSentRef} guard makes sure a parent
   *  re-render or a {@code load()} refresh never fires the send
   *  twice. */
  const autoSentRef = React.useRef(false);
  useEffect(() => {
    if (!autoSendTelegram) return;
    if (autoSentRef.current) return;
    if (!invoice || !companyInfo) return;            // wait for both
    if (invoice.status !== 'progress') return;       // skip drafts / voids
    autoSentRef.current = true;
    const handle = setTimeout(async () => {
      try {
        const imageDataUrl = await capturePrintImage();
        const res = await invoicesApi.sendTelegram(invoice.id, imageDataUrl ?? undefined);
        if (res.status === 'sent') {
          toast.success(`Invoice ${invoice.invoiceNo} sent via Telegram`);
        } else if (res.status === 'not_linked') {
          toast.info('Customer has not connected Telegram yet — share the link from Customers.');
        } else if (res.status === 'disabled') {
          // Telegram not configured — stay quiet on auto-send so the
          // operator isn't spammed every time they save.
        } else {
          toast.error(`Telegram send failed: ${res.message ?? 'unknown error'}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Telegram send failed');
      } finally {
        onAutoSendConsumed?.();
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [autoSendTelegram, invoice, companyInfo, onAutoSendConsumed]);

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  // AR == 0 (snap-to-zero) means the chain is balanced. Use the
  // same epsilon as fmtMoney so the stamp and the AR figure agree
  // on what "settled" means.
  const isPaid = invoice ? Math.abs(arUsd) < 0.005 && invoice.status !== 'draft' && invoice.status !== 'void' : false;

  return (
    <Dialog open onOpenChange={onClose}>
      {/* DO NOT add `relative` here — shadcn's DialogContent base
          class is `fixed top-[50%] left-[50%]` for centering, and
          `relative` overrides `fixed` (Tailwind later-wins on the
          same property) which causes the dialog to mount off-screen
          below the page flow. The stamp's absolute positioning
          anchors to DialogContent because `fixed` is already a
          positioned ancestor — no extra `relative` needed. */}
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        {/* Stamp lives at DialogContent root so it overlays the whole
            preview area regardless of where the user scrolls inside.
            Only shown for non-draft/void invoices with AR ≈ 0. */}
        <PaidStamp show={isPaid} />
        {/* Header is always rendered so Radix' DialogTitle requirement
            is satisfied even during the brief load. Action buttons +
            badges only appear once invoice is in. */}
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="tabular-nums">{invoice?.invoiceNo ?? 'Invoice details'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !invoice ? (
                  <span className="text-xs text-gray-500">Loading invoice…</span>
                ) : (
                  <>
                    {/* POS-origin invoices (V135) display "POS" as
                        the type chip — the underlying kind is still
                        commercial / tax for ledger purposes, but for
                        the operator the source matters more than the
                        kind. */}
                    {invoice.posOrderId ? (
                      <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                        POS
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={KIND_BADGE_CLASS[invoice.kind]}>
                        {KIND_LABEL[invoice.kind]}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[invoice.status]}`}>
                      {invoice.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{formatDate(invoice.issueDate)}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {/* mr-8 reserves room for the dialog's built-in close (X)
                button which sits at top:1rem right:1rem inside the
                DialogContent. print:hidden drops the whole action row
                from the Print output so the printed page only carries
                the invoice itself, not the management controls.
                The whole row is gated on `invoice` so the buttons
                don't render before data is in. */}
            {invoice && (
              <div className="flex gap-1.5 mr-8 print:hidden">
                <Button size="sm" variant="outline" onClick={() => { void printInvoiceOrReceipt(invoice); }} title="Print invoice">
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm" variant="outline"
                      disabled={invoice.status === 'draft' || telegramBusy}
                      title={invoice.status === 'draft'
                        ? 'Issue the invoice before sending'
                        : 'Send invoice to the customer'}
                    >
                      {telegramBusy ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1" />
                      )}
                      {telegramBusy ? 'Sending…' : 'Send'}
                      <ChevronDown className="h-3 w-3 ml-1.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setMailDialogOpen(true)}>
                      <Mail className="h-4 w-4 mr-2 text-blue-600" />
                      Email
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        // Keep the menu's auto-close from firing the
                        // handler twice, then drive the spinner
                        // ourselves via telegramBusy.
                        e.preventDefault();
                        if (!telegramBusy) void sendViaTelegram();
                      }}
                      disabled={telegramBusy}
                    >
                      <MessageCircle className="h-4 w-4 mr-2 text-sky-600" />
                      Telegram
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Edit available only on draft + progress per the
                    legal-document rule — paid / partially / overdue /
                    void rows must be adjusted via a credit or debit
                    note, not by rewriting the original. */}
                {canEdit && (invoice.status === 'draft' || invoice.status === 'progress') && (
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => onEdit(invoice)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                {canEdit && invoice.status === 'draft' && (
                  <Button size="sm" disabled={busy}
                    onClick={() => doAction('Invoice issued', async () => {
                      // Issue with notify=false so the BE skips its
                      // text-only fallback; we follow up below with
                      // an image-based sendPhoto so the customer
                      // receives the rendered invoice instead of a
                      // plain text summary.
                      const issued = await invoicesApi.issue(invoice.id, false);
                      setInvoice(issued);
                      // Give the dialog one paint cycle to swap in
                      // the new status + re-render the print template
                      // before capturePrintImage walks the DOM.
                      await new Promise(r => setTimeout(r, 120));
                      try {
                        const imageDataUrl = await capturePrintImage();
                        await invoicesApi.sendTelegram(invoice.id, imageDataUrl ?? undefined);
                      } catch {
                        // Soft-fail — the issue itself succeeded; a
                        // delivery hiccup is logged on the BE and the
                        // operator can retry from Send → Telegram.
                      }
                    })}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" /> Issue
                  </Button>
                )}
                {canEdit && invoice.status !== 'void' && invoice.status !== 'draft' && (
                  <Button size="sm" variant="outline" disabled={busy}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => doAction('Invoice voided',
                      () => invoicesApi.voidInvoice(invoice.id).then(setInvoice))}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> Void
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {loading || !invoice ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : (
          <>
            {/* Two-column header row: meta info on the left, big AR
                callout on the right. The callout sits in the area
                under the action buttons so HR sees the outstanding
                figure at a glance the moment they open the dialog
                — colour-coded by sign so red = customer owes,
                amber = refund pending, emerald = balanced. */}
            <div className="flex items-start justify-between gap-6">
              <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-sm flex-1 min-w-0">
              <div className="text-gray-500">Customer</div>
              <div>{customer?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
              <div className="text-gray-500">Due date</div>
              <div>{invoice.dueDate ?? '—'}</div>
              <div className="text-gray-500">Currency</div>
              <div>{invoice.currency}</div>
              {settings.showTax && (
                <>
                  <div className="text-gray-500">Taxation</div>
                  <div>
                    {invoice.taxType && TAX_TYPE_BY_KEY[invoice.taxType]
                      ? `${TAX_TYPE_BY_KEY[invoice.taxType].label} (${TAX_TYPE_BY_KEY[invoice.taxType].rate}%)`
                      : <span className="text-gray-400 italic">None</span>}
                  </div>
                </>
              )}
              {invoice.parentInvoiceId && (
                <>
                  <div className="text-gray-500">Adjusts invoice</div>
                  <div className="tabular-nums text-sm">
                    {parentInvoice
                      ? parentInvoice.invoiceNo
                      : <span className="text-gray-400 text-xs italic">loading…</span>}
                  </div>
                </>
              )}
              </div>
              {/* AR callout — top-right corner under the action buttons.
                  mr-8 reserves the same gutter the action-button row
                  uses so the callout's right edge lines up with the
                  buttons and stays clear of the dialog's built-in X
                  (top:1rem right:1rem inside DialogContent).
                  Sign-coloured: red = customer owes, amber = refund
                  pending, emerald = balanced. */}
              <div className="text-right shrink-0 mr-8 print:hidden">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">AR ({invoice.currency})</div>
                <div className={`text-3xl font-bold mt-1 tabular-nums ${
                  arUsd > 0 ? 'text-rose-700'
                    : arUsd < 0 ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}>
                  {fmtMoney(arUsd, invoice.currency)}
                </div>
              </div>
            </div>

            {/* Line items — Specification + UOM surfaced as their own
                columns so the read view matches what the create dialog
                captures and what the printed invoice will eventually
                show. */}
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead className="w-[80px]">UOM</TableHead>
                    <TableHead className="text-right w-[80px]">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsPagination.paginatedItems.map(it => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.description || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{it.unit || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{it.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(it.unitPrice, invoice.currency)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(it.lineTotal, invoice.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoice.items.length > 0 && (
                <div className="px-1 py-0 border-t">
                  <Pagination
                    currentPage={itemsPagination.currentPage}
                    totalPages={itemsPagination.totalPages}
                    onPageChange={itemsPagination.goToPage}
                    startIndex={itemsPagination.startIndex}
                    endIndex={itemsPagination.endIndex}
                    totalItems={itemsPagination.totalItems}
                  />
                </div>
              )}
            </div>

            {/* Notes stays fixed-left; the right column carries the
                Terms & Conditions card (when on) + the summary. So:
                  - Notes ON  → 2-col (left = Notes, right = T&C + Summary)
                  - Notes ON, T&C OFF → still 2-col (Summary shifts up
                    into T&C's slot per operator's expectation).
                  - Notes OFF → 1-col (nothing on the left; T&C + Summary
                    stack in the center). */}
            <div className={`grid gap-3 ${
              settings.showNotes ? 'grid-cols-2' : 'grid-cols-1'
            }`}>
              {settings.showNotes && (
              <div className="bg-slate-50 rounded-md p-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                {invoice.notes ? (
                  <div className="whitespace-pre-wrap">{invoice.notes}</div>
                ) : (
                  <div className="text-gray-400 italic text-xs">No notes recorded for this invoice.</div>
                )}
              </div>
              )}
              <div className="space-y-3">
                {settings.showTerms && (
                <div className="bg-slate-50 rounded-md p-3 text-sm">
                  <div className="text-xs text-gray-500 mb-1">Terms &amp; conditions</div>
                  {invoice.terms ? (
                    <div className="whitespace-pre-wrap">{invoice.terms}</div>
                  ) : (
                    <div className="text-gray-400 italic text-xs">No terms recorded for this invoice.</div>
                  )}
                </div>
                )}
                {/* Net-balance summary using the full ledger formula:
                    total + ΣDN − ΣCN − payments. Void children are
                    excluded server-side. When no adjustments exist
                    the DN/CN lines fold away so the summary stays
                    compact for the common single-document case. */}
                {(() => {
                  const nonVoidAdj = (invoice.adjustments ?? [])
                    .filter(a => a.status !== 'void');
                  const sumDn = nonVoidAdj
                    .filter(a => a.kind === 'debit_note')
                    .reduce((s, a) => s + a.total, 0);
                  const sumCn = nonVoidAdj
                    .filter(a => a.kind === 'credit_note')
                    .reduce((s, a) => s + a.total, 0);
                  // Per-currency Received totals — each payment row stays in
                  // the currency the cashier captured. For invoice / DN
                  // settlement direction is CREDIT (customer pays us);
                  // for a Credit Note settlement direction is DEBIT (we
                  // refund the customer). The "settles" flag picks the
                  // right sign by kind so a refunded CN reads AR = 0
                  // instead of double-counting the refund.
                  const isCn = invoice.kind === 'credit_note';
                  const sumByCurrency = (cur: 'USD' | 'KHR') => payments
                    .filter(p => p.currency === cur)
                    .reduce((s, p) => {
                      const settles = isCn ? p.direction === 'debit' : p.direction === 'credit';
                      return s + (settles ? p.amount : -p.amount);
                    }, 0);
                  const receivedUsd = sumByCurrency('USD');
                  const receivedKhr = sumByCurrency('KHR');
                  const rate = invoice.exchangeRate || 0;
                  // Total USD-equivalent received — KHR converted at the
                  // invoice's snapshot rate so the AR collapses to one
                  // number even when payments came in on both rails.
                  const receivedTotalUsd = receivedUsd + (rate > 0 ? receivedKhr / rate : 0);
                  const totalUsd = invoice.total + sumDn - sumCn;
                  const totalKhr = totalUsd * rate;
                  const arUsd = totalUsd - receivedTotalUsd;
                  return (
                  <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                    <div className="flex justify-end gap-6"><span className="text-gray-600">Subtotal</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.subtotal, invoice.currency)}</span></div>
                    {settings.showTax && (
                    <div className="flex justify-end gap-6"><span className="text-gray-600">Tax</span><span className="tabular-nums w-32 text-right">{fmtMoney(invoice.taxAmount, invoice.currency)}</span></div>
                    )}
                    {settings.showDiscount && (
                    <div className="flex justify-end gap-6">
                      <span className="text-gray-600">
                        Discount
                        {invoice.discountType === 'percent' && (
                          <span className="text-[10px] text-gray-400 ml-1">@ {invoice.discountValue}%</span>
                        )}
                      </span>
                      <span className="tabular-nums w-32 text-right">− {fmtMoney(invoice.discountAmount, invoice.currency)}</span>
                    </div>
                    )}
                    <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total {invoice.currency}</span><span className="tabular-nums w-32 text-right">{fmtMoney(totalUsd, invoice.currency)}</span></div>
                    {/* Secondary-currency total — visible only when
                        the tenant has a secondary configured AND
                        the invoice's own currency isn't that
                        secondary (nothing meaningful to convert into). */}
                    {currencySettings?.secondaryCurrency && invoice.currency !== currencySettings.secondaryCurrency && (
                      <div className="flex justify-end gap-6 text-gray-700"><span>Total {currencySettings.secondaryCurrency} <span className="text-[10px] text-gray-400">@ {invoice.exchangeRate}</span></span><span className="tabular-nums w-32 text-right">{fmtMoney(totalKhr, currencySettings.secondaryCurrency)}</span></div>
                    )}
                    {sumDn > 0 && (
                      <div className="flex justify-end gap-6 text-amber-700"><span>Debit notes</span><span className="tabular-nums w-32 text-right">{fmtMoney(sumDn, invoice.currency)}</span></div>
                    )}
                    {sumCn > 0 && (
                      <div className="flex justify-end gap-6 text-emerald-700"><span>Credit notes</span><span className="tabular-nums w-32 text-right">− {fmtMoney(sumCn, invoice.currency)}</span></div>
                    )}
                    <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AR (USD)
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Receivable in USD — Total USD minus all payments received. KHR payments are converted to USD at the invoice's snapshot exchange rate.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className={`tabular-nums w-32 text-right ${arUsd > 0 ? 'text-red-700' : ''}`}>{fmtMoney(arUsd, 'USD')}</span>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Adjustments panel — Credit / Debit Notes attached to
                this invoice. Shown only on root invoices (CN/DN
                themselves have no children). Void rows render with a
                muted strikethrough so the audit trail stays visible
                without inflating the net-balance math. */}
            {!invoice.parentInvoiceId && (invoice.adjustments ?? []).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Credit / Debit Notes</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[120px]">Issue Date</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoice.adjustments ?? []).map(a => {
                      const isVoid = a.status === 'void';
                      const sign = a.kind === 'credit_note' ? '−' : '+';
                      return (
                        <TableRow key={a.id} className={isVoid ? 'text-gray-400' : ''}>
                          <TableCell className={`tabular-nums text-sm ${isVoid ? 'line-through' : ''}`}>{a.invoiceNo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={KIND_BADGE_CLASS[a.kind]}>
                              {KIND_LABEL[a.kind]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{formatDate(a.issueDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[a.status]}`}>
                              {a.status}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums ${isVoid ? 'line-through' : ''} ${
                            !isVoid && a.kind === 'credit_note' ? 'text-emerald-700' : !isVoid && a.kind === 'debit_note' ? 'text-amber-700' : ''
                          }`}>
                            {sign} {fmtMoney(a.total, invoice.currency)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Payments panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Payments</Label>
                {/* Allow recording another payment whenever there's
                    outstanding USD AR — even if the server-side status
                    flipped to "paid" via the legacy currency-blind sum
                    (a KHR-only payment counted at face value as USD).
                    Drafts and voids stay locked since there's nothing
                    to settle against. */}
                {canEdit && invoice.status !== 'draft' && invoice.status !== 'void' && arUsd > 0.005 && (
                  <div className="flex items-center gap-2 print:hidden">
                    {/* The old "Payment Link" button opened an on-screen
                        dialog with the QR + URL — but the ops team wants
                        the link delivered TO THE CUSTOMER via Telegram or
                        email as part of the invoice send, not viewed on
                        the merchant's own screen. The link is still
                        auto-minted on issue in the backend and stitched
                        into outgoing Telegram / mail bodies (see the
                        send handlers), so no manual step is needed. */}
                    <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" /> Record payment
                    </Button>
                  </div>
                )}
              </div>
              {payments.length === 0 ? (
                <p className="text-xs text-gray-500">No payments recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[140px]">Document</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="w-[80px]">Currency</TableHead>
                      <TableHead className="text-right w-[120px]">Amount</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsPagination.paginatedItems.map(p => {
                      // Label + sign depend on the document the payment
                      // was recorded against, not on the dialog's
                      // current view — so a unified payments table on
                      // a root invoice can label each row correctly:
                      //   Credit Note   → "Refund"   (− outflow)
                      //   Debit Note    → "Received" (+ inflow)
                      //   Invoice/root  → "+ Credit" / "− Debit" per direction
                      const isCnSrc = p.documentKind === 'credit_note';
                      const isDnSrc = p.documentKind === 'debit_note';
                      const isDebit = p.direction === 'debit';
                      const isOutflow = isCnSrc || (!isDnSrc && isDebit);
                      const typeLabel = isCnSrc ? 'Refund'
                        : isDnSrc ? 'Received'
                        : (isDebit ? '− Debit' : '+ Credit');
                      const chipClass = isOutflow
                        ? 'border-red-300 text-red-700 bg-red-50'
                        : 'border-emerald-300 text-emerald-700 bg-emerald-50';
                      return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{formatDate(p.paymentDate)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-gray-600">{p.documentNo}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={chipClass}>
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {p.method === 'khqr' ? 'KHQR' : p.method}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{p.referenceNo ?? '—'}</TableCell>
                        {/* Currency badge + single Amount cell — the row
                         *  carries its own captured currency, and the
                         *  Amount renders in that currency (USD 2dp, KHR
                         *  0dp via fmtMoney). Sign / color match the
                         *  outflow logic above. */}
                        <TableCell>
                          <Badge variant="outline" className="tabular-nums text-[10px]">{p.currency}</Badge>
                        </TableCell>
                        <TableCell className={`text-right text-sm tabular-nums ${isOutflow ? 'text-red-700' : ''}`}>
                          {isOutflow ? '− ' : ''}{fmtMoney(p.amount, p.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-0.5">
                            {/* Customer-receipt preview. Opens the card-
                                style template the operator can print
                                or share. Hidden in print so the live
                                receipt itself doesn't carry the
                                action button. */}
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 print:hidden"
                              onClick={() => setReceiptForPayment(p)}
                              title="View / print receipt"
                            >
                              <Receipt className="h-3 w-3" />
                            </Button>
                            {canEdit && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 print:hidden"
                                onClick={() => doAction('Payment removed',
                                  () => paymentsApi.remove(p.id))}
                                title="Delete payment"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {payments.length > 0 && (
                <div className="px-1 py-0 border-t">
                  <Pagination
                    currentPage={paymentsPagination.currentPage}
                    totalPages={paymentsPagination.totalPages}
                    onPageChange={paymentsPagination.goToPage}
                    startIndex={paymentsPagination.startIndex}
                    endIndex={paymentsPagination.endIndex}
                    totalItems={paymentsPagination.totalItems}
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-3 print:hidden">
              <AttachmentsPanel docType="invoice" docId={invoice.id}
                                readOnly={invoice.status === 'void' || !canEdit} />
            </div>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>

            {/* Print-only Cambodian Tax Invoice (WABOOKS layout).
             *  Screen renders the editable dashboard above; window.print()
             *  swaps to the body-level portal below via @media print:
             *  display:none on everything else lets a long invoice flow
             *  top-to-bottom and paginate naturally across A4 sheets. */}
            <style>{`
              @media print {
                html, body { background: white !important; }
                body > *:not(.print-tax-invoice) { display: none !important; }
                body > .print-tax-invoice {
                  display: block !important;
                  position: relative !important;
                  padding: 14mm !important;
                  color: black !important;
                  /* Khmer body uses Battambang; titles get Moul (a
                   *  Khmer display face) via .kh-title below. Latin
                   *  text falls through to the system stack. */
                  font-family: 'Battambang', 'Noto Sans Khmer', system-ui, sans-serif !important;
                }
                .print-tax-invoice .kh-title {
                  font-family: 'Moul', 'Battambang', 'Noto Sans Khmer', serif !important;
                  font-weight: 400 !important;
                  letter-spacing: 0.5px;
                }
                @page { margin: 0; size: A4; }
              }
            `}</style>
            <PrintTaxInvoice invoice={invoice} customer={customer} company={companyInfo} paid={isPaid} currencySettings={currencySettings} template={invoiceTemplate} />
          </>
        )}

        {payDialogOpen && invoice && (
          <RecordPaymentDialog
            invoice={invoice}
            onClose={() => setPayDialogOpen(false)}
            onSaved={async () => {
              setPayDialogOpen(false);
              await load();
              onChanged();
            }}
          />
        )}

        {/* PaymentLinkDialog removed — the auto-minted link is now
            delivered via Telegram / mail invoice sends instead of
            through a merchant-side popup. */}

        {mailDialogOpen && invoice && (
          <MailInvoiceDialog
            invoice={invoice}
            customer={customer}
            company={companyInfo}
            paymentLinkUrl={paymentLink?.checkoutUrl ?? null}
            onClose={() => setMailDialogOpen(false)}
          />
        )}

        {receiptForPayment && invoice && (
          <PaymentReceiptDialog
            payment={receiptForPayment}
            invoice={invoice}
            customer={customer}
            company={companyInfo}
            onClose={() => setReceiptForPayment(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Cambodian Tax Invoice print template (WABOOKS layout)                       */
/* -------------------------------------------------------------------------- */

/**
 * Rubber-stamp PAID overlay. Used in both the on-screen invoice
 * detail popup AND the print template — same look, different
 * positioning controlled by the parent's relative container.
 * Renders only when {@code show} is true; an em-pty stamp wastes
 * tree depth. Pure presentation, no hooks.
 *
 * <p>Style choices: double red border + bold serif uppercase +
 * slight rotation mimic a real rubber stamp without needing an
 * SVG asset. {@code pointer-events-none} so it never blocks clicks
 * underneath; {@code select-none} keeps it out of accidental
 * highlight + copy.</p>
 */
function PaidStamp({ show, variant = 'popup' }: { show: boolean; variant?: 'popup' | 'print' }) {
  if (!show) return null;
  // Two anchor positions for the same stamp:
  //   • popup  — top-right of DialogContent, next to the action row.
  //   • print  — lower on the page, over the Invoice N° / Issue
  //     Date / Payment Due Date meta block on the right column of
  //     the customer block, so the title and the body table stay
  //     unobstructed (user spec).
  const positioning: React.CSSProperties = variant === 'print'
    ? { top: '170px', right: '40px' }
    : { top: '40px', right: '60px' };
  return (
    <div
      aria-hidden="true"
      className="paid-stamp pointer-events-none select-none"
      style={{
        position: 'absolute',
        ...positioning,
        transform: 'rotate(-14deg)',
        transformOrigin: 'top right',
        border: '4px double #dc2626',
        borderRadius: '8px',
        padding: '6px 22px',
        color: '#dc2626',
        fontSize: '48px',
        fontWeight: 900,
        letterSpacing: '6px',
        textTransform: 'uppercase',
        fontFamily: '"Times New Roman", Georgia, serif',
        opacity: 0.85,
        lineHeight: 1,
        zIndex: 10,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      PAID
    </div>
  );
}

/** Split a Cambodian VAT TIN into per-character boxes. Pattern is letter
 *  + 3 digits + "-" + 9 digits (e.g. L001-105018384) but we accept any
 *  string and just render each character — the regulator's only
 *  requirement is one cell per character, the dash included. */
function VatTinBoxes({ tin }: { tin: string }) {
  const chars = tin.trim().split('');
  // Layout switched from inline-flex + inline-block to flex with
  // explicit no-wrap, flex-shrink:0 + box-sizing:border-box on each
  // cell — under html2canvas the previous shape rendered every digit
  // on its own line because inline-block descendants inside an
  // inline-flex parent aren't measured consistently. The new shape
  // also renders identically in native print, so this isn't a
  // capture-only workaround.
  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'nowrap',
        gap: '2px',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {chars.map((c, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            width: '16px',
            height: '18px',
            fontSize: '11px',
            // lineHeight:1 makes the glyph height equal the font size so
            // the flex-center actually sits the character on the cell's
            // visual midline. Without this, the inherited line-height
            // (~1.4) pads above/below the glyph and the character drops
            // toward the bottom border.
            lineHeight: 1,
            // Tabular numerals + Arial keep each digit + the letter on
            // the same advance width so the cells line up uniformly
            // under html2canvas (different fonts can fall back to
            // proportional metrics and break the grid).
            fontFamily: 'Arial, sans-serif',
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center',
            border: c === '-' ? 'none' : '1px solid #000',
            boxSizing: 'border-box',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

/** Compact bilingual label cell — Khmer above, smaller English under. */
function BiLabel({ kh, en }: { kh: string; en: string }) {
  return (
    <div style={{ lineHeight: 1.15 }}>
      <div style={{ fontSize: '11px' }}>{kh}</div>
      <div style={{ fontSize: '9px', color: '#555' }}>{en}</div>
    </div>
  );
}

function PrintTaxInvoice({
  invoice, customer, company, paid, currencySettings, template,
}: {
  invoice: invoicesApi.Invoice;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  /** When true, overlay the red rubber-stamp "PAID" on the print
   *  output. Driven by the parent's chain-aware AR == 0 check so
   *  the stamp on screen and on paper share the same trigger. */
  paid?: boolean;
  /** Tenant currency settings — decides whether the secondary
   *  Grand Total row prints and what code / symbol it uses. */
  currencySettings?: currencyApi.CurrencySettings | null;
  /** Tenant's active default invoice template. Null when the tenant
   *  hasn't promoted a custom template — we then use the built-in
   *  config so the print output stays identical to the pre-template
   *  behaviour. */
  template?: InvoiceTemplate | null;
}) {
  /* Merge the tenant template config with the built-in defaults so
   * every knob has a value regardless of whether the tenant has a
   * partial custom config. Header / columns / footer default groups
   * are merged shallowly (deep enough — none of them nest further). */
  const defaults = defaultTemplateConfig();
  const cfg: TemplateConfig = template?.config ?? {};
  const cfgHeader  = { ...defaults.header,       ...(cfg.header ?? {}) };
  const cfgCols    = { ...defaults.columns,      ...(cfg.columns ?? {}) };
  const cfgLabels  = { ...defaults.columnLabels, ...(cfg.columnLabels ?? {}) };
  const cfgFooter  = { ...defaults.footer,       ...(cfg.footer ?? {}) };
  // Primary currency comes from the invoice itself (per-doc snapshot);
  // secondary comes from tenant settings so it can be USD/KHR/KRW.
  const primaryCode = invoice.currency || 'USD';
  const secondaryCode = currencySettings?.secondaryCurrency ?? null;
  const showSecondary = !!secondaryCode && secondaryCode !== primaryCode;
  const grandSecondary = showSecondary
    ? Math.round(invoice.total * (invoice.exchangeRate || 0))
    : 0;
  const primarySym = currencyApi.currencySymbol(primaryCode);
  const secondarySym = secondaryCode ? currencyApi.currencySymbol(secondaryCode) : '';
  // KHR-family codes print without decimals; other currencies keep 2dp.
  const fmtPrimary = (n: number) =>
    primaryCode === 'KHR' || primaryCode === 'KRW'
      ? `${primarySym} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `${primarySym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtSecondary = (n: number) =>
    secondaryCode === 'KHR' || secondaryCode === 'KRW'
      ? `${secondarySym} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `${secondarySym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // VAT / Discount lines show only when non-zero — the totals block
  // stays tight on zero-VAT exports / no-discount invoices. When
  // either is > 0 the operator MUST see it broken out, otherwise
  // "Sub Total $3 → Grand Total $2" reads like a bug.
  const showVat      = invoice.taxAmount > 0;
  const showDiscount = (invoice.discountAmount ?? 0) > 0;
  const vatPct = invoice.subtotal > 0 ? Math.round((invoice.taxAmount / invoice.subtotal) * 100) : 0;
  const discountPct = invoice.discountType === 'percent'
    ? Math.round(Number(invoice.discountValue ?? 0))
    : (invoice.subtotal > 0 ? Math.round(((invoice.discountAmount ?? 0) / invoice.subtotal) * 100) : 0);
  // Issue / due dates rendered as DD-MM-YYYY to match the WABOOKS sample.
  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
  };
  const companyKh = company?.legalName?.trim() || company?.name || '';
  const companyEn = company?.name || '';
  // Bank info comes from the Settings popup's localStorage store. Render
  // the block only when the admin has actually filled something in — an
  // empty config shouldn't print a "Payment method" header followed by
  // four blank lines.
  // Bank cards from the Settings popup. Filter out the truly-empty rows
  // (newly-added card the admin never filled in) so they don't print as
  // ghost columns. Then narrow to the rows the operator ticked "Show on
  // invoice" — the printed footer only has room for two cards side by
  // side. If nothing is ticked yet (legacy data, pre-V112 setup) we
  // fall back to the first MAX so HR's existing setup keeps printing.
  const filledBanks = loadBankAccounts('sale').filter(
    b => b.bankName || b.accountName || b.accountNumber || b.notes || b.qrDataUrl,
  );
  const ticked = filledBanks.filter(b => b.showOnInvoice);
  const banks = (ticked.length > 0 ? ticked : filledBanks).slice(0, MAX_BANK_ACCOUNTS_ON_INVOICE);
  // Banking gated by template config too — a receipt-style template
  // might switch it off even when the tenant has bank cards saved.
  const showBank = banks.length > 0 && cfgFooter.showBanking !== false;

  const tree = (
    <div className="print-tax-invoice" style={{
      fontSize: '12px',
      color: '#000',
      display: 'none',
      position: 'relative',
      // Inline so the print engine applies it regardless of how it
      // ranks @media print rules vs Google-Fonts-supplied @font-face
      // declarations. Battambang has Khmer + Latin coverage so it
      // handles both scripts in the body; titles override to Moul
      // for the heavy display feel.
      fontFamily: "'Battambang', 'Noto Sans Khmer', system-ui, sans-serif",
    }}>
      {/* PAID stamp overlay — gated by the chain-aware AR == 0 check
          passed in from the parent. The "print" variant anchors the
          stamp lower on the page so it sits over the Invoice N° /
          Issue Date / Payment Due Date block on the right column. */}
      <PaidStamp show={!!paid} variant="print" />
      {/* Header — three-slot grid driven by the template config so
       *  logo position (left/middle/right) + size + shape reflect the
       *  operator's Templates choices. Company block centres on the
       *  full page width regardless of slot occupancy. */}
      {(() => {
        const logoPos   = cfgHeader.logoPosition ?? 'left';
        const logoShape = cfgHeader.logoShape    ?? 'rectangle';
        const logoSize  = Math.min(120, Math.max(24, cfgHeader.logoSize ?? 60));
        const logoDims  =
          logoShape === 'circle'   ? { width: logoSize, height: logoSize, borderRadius: 9999 }
          : logoShape === 'square' ? { width: logoSize, height: logoSize, borderRadius: 4 }
          :                          { width: Math.round(logoSize * 90 / 40), height: logoSize, borderRadius: 4 };
        const slot   = cfgHeader.showLogo && company?.logoUrl ? Math.max(60, logoDims.width + 16) : 0;
        const Logo   = () => cfgHeader.showLogo && company?.logoUrl ? (
          <img
            src={company.logoUrl}
            alt=""
            style={{
              width: logoDims.width, height: logoDims.height,
              borderRadius: logoDims.borderRadius, objectFit: 'contain',
            }}
          />
        ) : null;
        const CompanyBlock = () => !cfgHeader.showCompanyBlock ? null : (
          <div style={{ textAlign: 'center' }}>
            <div className="kh-title" style={{
              fontSize: '20px', fontWeight: 400, lineHeight: 1.15,
              fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
            }}>{companyKh}</div>
            {companyEn && companyEn !== companyKh && (
              <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>{companyEn}</div>
            )}
            {company?.address && (
              <div style={{ marginTop: '4px', fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{company.address}</div>
            )}
            {(company?.phone || company?.taxId) && (
              <div style={{
                marginTop: '2px', fontSize: '11px', lineHeight: 1.5,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: '16px', flexWrap: 'wrap',
              }}>
                {company?.phone && <span>{company.phone}</span>}
                {company?.taxId && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <BiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
                    <VatTinBoxes tin={company.taxId} />
                  </span>
                )}
              </div>
            )}
          </div>
        );
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `${slot}px 1fr ${slot}px`,
            alignItems: 'center',
            gap: '12px',
            minHeight: Math.max(60, logoDims.height + 4),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
              {logoPos === 'left' && <Logo />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              {logoPos === 'middle' && <Logo />}
              <CompanyBlock />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {logoPos === 'right' && <Logo />}
            </div>
          </div>
        );
      })()}

      {/* Centered bilingual title with side rules. Per-kind so a
          Commercial invoice prints "INVOICE" / "វិក្កយបត្រ" rather
          than the legacy "TAX INVOICE" header that used to fire for
          every kind. CN / DN carry their own banner so the recipient
          sees at a glance which document this is. */}
      {(() => {
        /* Template config lets the tenant override the printed
         * English title (e.g. "COMMERCIAL INVOICE"). Kh side stays
         * per-doc-kind. Only kicks in on the regular INVOICE kind —
         * CN / DN keep their fixed banners so the recipient still
         * sees at a glance which document this is. */
        const templateTitle = (cfgHeader.title ?? '').trim();
        const kindTitle = invoice.kind === 'tax'
          ? { kh: 'វិក្កយបត្រអាករ',     en: 'TAX INVOICE' }
          : invoice.kind === 'credit_note'
          ? { kh: 'លិខិតឥណទាន',         en: 'CREDIT NOTE' }
          : invoice.kind === 'debit_note'
          ? { kh: 'លិខិតឥណពន្ធ',         en: 'DEBIT NOTE' }
          : { kh: 'វិក្កយបត្រ', en: (templateTitle || 'INVOICE').toUpperCase() };
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
            <div style={{ flex: 1, borderTop: '1px solid #000' }} />
            <div style={{ textAlign: 'center' }}>
              <div className="kh-title" style={{
                fontSize: '20px',
                fontWeight: 400,
                fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
              }}>{kindTitle.kh}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>{kindTitle.en}</div>
            </div>
            <div style={{ flex: 1, borderTop: '1px solid #000' }} />
          </div>
        );
      })()}

      {/* Customer block (left) + Invoice meta (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '32px', rowGap: '6px', fontSize: '11px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><BiLabel kh="ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន" en="Company Name / Customer" /></div>
          <div style={{ fontWeight: 600 }}>{customer?.name ?? ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><BiLabel kh="លេខរៀងវិក្កយបត្រ" en="Invoice N°" /></div>
          <div style={{ fontFamily: 'monospace' }}>{invoice.invoiceNo}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><BiLabel kh="អាសយដ្ឋាន" en="Address" /></div>
          <div>{customer?.address ?? ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><BiLabel kh="កាលបរិច្ឆេទ" en="Issue Date" /></div>
          <div>{fmtDate(invoice.issueDate)}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '140px' }}><BiLabel kh="ទូរស័ព្ទលេខ , ឈ្មោះអ្នកតំណាង" en="Telephone No. , Representative" /></div>
          <div>{[customer?.phone, customer?.representative].filter(Boolean).join(', ')}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ minWidth: '120px' }}><BiLabel kh="ថ្ងៃផុតកំណត់បង់ប្រាក់" en="Payment Due Date" /></div>
          <div>{fmtDate(invoice.dueDate)}</div>
        </div>
        {customer?.tin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / span 2' }}>
            <BiLabel kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
            <VatTinBoxes tin={customer.tin} />
          </div>
        )}
      </div>

      {/* Items table — bilingual headers, totals folded into the same
       *  table. Cells carry only borderTop+borderLeft; the table tag
       *  closes the perimeter with borderBottom+borderRight. That
       *  guarantees a single 1px line on every edge under both native
       *  rendering and html2canvas (the Telegram photo capture),
       *  whereas relying on borderCollapse:collapse leaves doubled
       *  perimeter lines under html2canvas. */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        borderSpacing: 0,
        borderBottom: '1px solid #000',
        borderRight: '1px solid #000',
        fontSize: '11px',
      }}>
        <thead>
          {/* Column toggles + custom labels come from the tenant's
              active invoice template. Discount column stays fixed
              per-doc (there's no template knob for it — it prints
              only in the per-line context, not as a togglable
              column). */}
          <tr>
            <th style={thStyle}><BiLabel kh="ល.រ." en="N°" /></th>
            {cfgCols.item      && <th style={{ ...thStyle, textAlign: 'left' }}><BiLabel kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en={cfgLabels.item ?? 'Description'} /></th>}
            {cfgCols.uom       && <th style={thStyle}><BiLabel kh="ឯកតា" en={cfgLabels.uom ?? 'UOM'} /></th>}
            {cfgCols.quantity  && <th style={thStyle}><BiLabel kh="បរិមាណ" en={cfgLabels.quantity ?? 'Quantity'} /></th>}
            {cfgCols.unitPrice && <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="ថ្លៃឯកតា" en={cfgLabels.unitPrice ?? 'Unit Price'} /></th>}
            <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="បញ្ចុះតម្លៃ" en="Discount" /></th>
            {cfgCols.total     && <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="ថ្លៃទំនិញ" en={cfgLabels.total ?? 'Amount'} /></th>}
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, idx) => (
            <tr key={it.id}>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{idx + 1}</td>
              {cfgCols.item && (
                <td style={tdStyle}>
                  <div>{it.name}</div>
                  {it.description && <div style={{ fontSize: '10px', color: '#555' }}>{it.description}</div>}
                </td>
              )}
              {cfgCols.uom       && <td style={{ ...tdStyle, textAlign: 'center' }}>{it.unit ?? ''}</td>}
              {cfgCols.quantity  && <td style={{ ...tdStyle, textAlign: 'center' }}>{it.quantity}</td>}
              {cfgCols.unitPrice && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPrimary(it.unitPrice)}</td>}
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPrimary(0)}</td>
              {cfgCols.total     && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPrimary(it.lineTotal)}</td>}
            </tr>
          ))}
          {/* Totals folded into the same table. colSpan tracks how
              many data columns the template turned on so the label
              stays flush-right and the value lines up with the
              Amount column. */}
          {(() => {
            const dataCols =
              1 /* N° */ +
              (cfgCols.item ? 1 : 0) + (cfgCols.uom ? 1 : 0) +
              (cfgCols.quantity ? 1 : 0) + (cfgCols.unitPrice ? 1 : 0) +
              1 /* Discount column always prints */;
            const totalsSpan = cfgCols.total ? dataCols : Math.max(1, dataCols);
            const AmountCell = ({ value, bold }: { value: string; bold?: boolean }) =>
              cfgCols.total
                ? <td style={{ ...tdStyle, textAlign: 'right', ...(bold ? { fontWeight: 700 } : {}) }}>{value}</td>
                : null;
            return (
              <>
                <tr>
                  <td colSpan={totalsSpan} style={{ ...tdStyle, textAlign: 'right' }}>សរុប ({primaryCode}) / Sub Total ({primaryCode})</td>
                  <AmountCell value={fmtPrimary(invoice.subtotal)} />
                </tr>
                {showDiscount && (
                  <tr>
                    <td colSpan={totalsSpan} style={{ ...tdStyle, textAlign: 'right' }}>
                      បញ្ចុះតម្លៃ{invoice.discountType === 'percent' && discountPct > 0 ? ` ${discountPct}%` : ''} ({primaryCode}) / Discount{invoice.discountType === 'percent' && discountPct > 0 ? ` ${discountPct}%` : ''} ({primaryCode})
                    </td>
                    <AmountCell value={`− ${fmtPrimary(invoice.discountAmount ?? 0)}`} />
                  </tr>
                )}
                {showVat && (
                  <tr>
                    <td colSpan={totalsSpan} style={{ ...tdStyle, textAlign: 'right' }}>
                      អាករលើតម្លៃបន្ថែម {vatPct}% ({primaryCode}) / VAT {vatPct}% ({primaryCode})
                    </td>
                    <AmountCell value={fmtPrimary(invoice.taxAmount)} />
                  </tr>
                )}
                <tr>
                  <td colSpan={totalsSpan} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({primaryCode}) / Grand Total ({primaryCode})</td>
                  <AmountCell value={fmtPrimary(invoice.total)} bold />
                </tr>
                {showSecondary && (
                  <tr>
                    <td colSpan={totalsSpan} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម ({secondaryCode}) / Grand Total ({secondaryCode})</td>
                    <AmountCell value={fmtSecondary(grandSecondary)} bold />
                  </tr>
                )}
              </>
            );
          })()}
        </tbody>
      </table>

      {/* Notes block — text on the left, optional KHRQR on the right so
       *  customers can scan to pay. Bank info comes from the Settings
       *  popup's "Bank Account" tab and only renders when configured. */}
      <div style={{ marginTop: '14px', fontSize: '11px', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>សម្គាល់ / Notes</div>
        {invoice.notes && (
          <div style={{ whiteSpace: 'pre-wrap' }}>{invoice.notes}</div>
        )}
        {showBank && (
          <>
            <div style={{ color: '#555', marginTop: invoice.notes ? '6px' : '0' }}>
              ** គណនីសម្រាប់បង់ប្រាក់ / Payment method:
            </div>
            {/* KHQR-card layout (customer-facing). The uploaded image
                is the full branded KHQR card so we render it edge-to-
                edge with no extra frame — wrapping it would put a
                white box around a red brand panel and look amateur.
                Bank name sits above (with icon), account number +
                account holder name below in uppercase, matching the
                screenshot HR pinned in chat. */}
            {/* KHQR row — right-aligned so the two-card block sits
                under the Notes / Payment method label with negative
                space on the LEFT, matching where the tenant expects
                the "please pay here" panel. `banks` is already
                capped at MAX_BANK_ACCOUNTS_ON_INVOICE (= 2). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '6px', justifyContent: 'flex-end' }}>
              {banks.map(b => (
                <div
                  key={b.id}
                  style={{
                    width: '40mm',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {b.bankName && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#1e3a8a',
                    }}>
                      <Landmark style={{ width: 12, height: 12 }} />
                      {b.bankName}
                    </div>
                  )}
                  {b.qrDataUrl ? (
                    <img
                      src={b.qrDataUrl}
                      alt="KHQR"
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '1 / 1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#999', fontSize: '9px', border: '1px dashed #ddd', borderRadius: '8px',
                    }}>
                      (no QR)
                    </div>
                  )}
                  {b.accountNumber && (
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#111', letterSpacing: '0.3px' }}>
                      {b.accountNumber}
                    </div>
                  )}
                  {b.accountName && (
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {b.accountName}
                    </div>
                  )}
                  {b.notes && (
                    <div style={{ fontSize: '9px', color: '#666' }}>{b.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {(invoice.exchangeRate || 0) > 0 && (
          <div style={{ marginTop: '6px' }}>អត្រាប្តូរប្រាក់ / Exchange rate : {invoice.exchangeRate}</div>
        )}
        {/* Template-configurable thank-you line + terms line. Both
            live under Notes so they end up near the bottom of the
            document without competing with banking. */}
        {cfgFooter.showThankYou && (cfgFooter.thankYouText ?? '').trim() && (
          <div style={{ marginTop: '8px', fontWeight: 600 }}>{cfgFooter.thankYouText}</div>
        )}
        {cfgFooter.showTerms && (
          <div style={{ marginTop: '6px', fontStyle: 'italic', color: '#666' }}>
            Terms &amp; Conditions apply.
          </div>
        )}
      </div>

      {/* Signatures — the marginTop is the actual pen-room where the
       *  customer / seller signs. paddingTop under the border keeps
       *  the labels off the line. Template config decides whether to
       *  print each side; when both are off the block is dropped
       *  entirely and the printed page ends after the totals. */}
      {(() => {
        const showCust = cfgFooter.showCustomerSignature !== false;
        const showSell = cfgFooter.showSellerSignature   !== false;
        if (!showCust && !showSell) return null;
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: (showCust && showSell) ? '1fr 1fr' : '1fr',
            gap: '64px', marginTop: '110px', fontSize: '11px', textAlign: 'center',
          }}>
            {showCust && (
              <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
                <div style={{ fontSize: '10px', color: '#555' }}>Customer's Signature &amp; Name</div>
              </div>
            )}
            {showSell && (
              <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
                <div style={{ fontSize: '10px', color: '#555' }}>Seller's Signature &amp; Name</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
  // createPortal's return type changed between React 17 / 18 type defs
  // and a duplicate @types/react in node_modules trips the JSX check.
  // Cast through React.ReactElement so the caller sees a valid element.
  return createPortal(tree, document.body) as unknown as React.ReactElement;
}

// Borders use a "top + left only" pattern so adjacent cells never
// double up under html2canvas (which doesn't fully honour
// border-collapse: collapse). The table closes the perimeter with
// borderBottom + borderRight in its inline style; the cells fill the
// inside lines. boxSizing: border-box keeps padding from bumping the
// 1px border outside the cell width.
const thStyle: React.CSSProperties = {
  borderTop: '1px solid #000',
  borderLeft: '1px solid #000',
  padding: '4px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontWeight: 600,
  boxSizing: 'border-box',
};
const tdStyle: React.CSSProperties = {
  borderTop: '1px solid #000',
  borderLeft: '1px solid #000',
  padding: '4px 6px',
  verticalAlign: 'middle',
  boxSizing: 'border-box',
};

/* -------------------------------------------------------------------------- */
/* Send-invoice-by-email dialog                                                */
/* -------------------------------------------------------------------------- */
/**
 * Compose + dispatch via the user's own mail client (mailto: URL). Keeps
 * the system free of SMTP plumbing — HR drives the actual send from
 * Gmail / Outlook / Apple Mail, and any signature / template / PDF
 * attachment they normally use just works.
 *
 * The dialog pre-fills To from the existing payments table if the
 * customer's email isn't on file (Customer entity has no email column
 * yet), Subject from the invoice number, and Body from a short summary
 * the seller can edit before sending.
 */
/* -------------------------------------------------------------------------- */
/* Customer payment receipt — card preview + print                            */
/* -------------------------------------------------------------------------- */

/** Card-style "thanks for paying" receipt the cashier hands back to a
 *  customer after they pay against an invoice. The card itself lives
 *  in {@link PaymentReceiptCard}; this dialog wires it to a Print
 *  window and supplies the values from the invoice + payment + tenant
 *  Settings → Company row. */
function PaymentReceiptDialog({
  payment, invoice, customer, company, onClose,
}: {
  payment: paymentsApi.Payment & { documentNo: string };
  invoice: invoicesApi.Invoice;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Friendly date formatter — "08 Feb 2025" style matches the
  // mockup. Falls back to the raw string when the date can't parse.
  const fmtDate = (raw: string | null | undefined) => {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const money = (v: number, c: paymentsApi.PaymentCurrency = 'USD') =>
    c === 'KHR'
      ? `៛ ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${v.toFixed(2)}`;

  // Items strip — read from the invoice's lines. Each row carries the
  // line total in the row's currency (the invoice is mono-currency).
  const items = (invoice.items ?? []).map(l => ({
    name: l.name,
    note: l.description ?? null,
    quantityHint: l.quantity > 0 && l.unit
      ? `${l.quantity} x ${l.unit}`
      : (l.quantity > 0 ? `Qty ${l.quantity}` : null),
    amount: money(l.lineTotal ?? 0),
  }));

  const print = () => {
    const node = cardRef.current;
    if (!node) return;
    const ok = printHtmlViaIframe(
      `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${payment.documentNo}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; }
      </style></head><body>${node.outerHTML}</body></html>`
    );
    if (!ok) toast.error('Could not open the print dialog.');
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-blue-600" />
            Customer receipt
          </DialogTitle>
          <DialogDescription className="text-xs">
            Card-style payment slip. Print to hand to the customer or screenshot to share.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 px-4 py-4 flex justify-center">
          <PaymentReceiptCard
            ref={cardRef}
            logoUrl={company?.logoUrl ?? null}
            companyName={company?.name ?? 'Your Company'}
            addressLine1={company?.address ?? null}
            addressLine2={company?.phone ?? null}
            totalDue={money(invoice.total ?? 0)}
            dueOn={invoice.dueDate ? `Due on ${fmtDate(invoice.dueDate)}` : null}
            customerName={customer?.name ?? 'Walk-in'}
            receiptNo={payment.documentNo}
            dateText={fmtDate(payment.paymentDate)}
            items={items}
            subtotal={money(invoice.subtotal ?? 0)}
            totalDueFooter={money(invoice.total ?? 0)}
            paidAmount={money(payment.amount, payment.currency)}
            stampDate={fmtDate(payment.paymentDate)}
            showPaidStamp
          />
        </div>

        <DialogFooter className="px-5 py-3 border-t gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={print}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MailInvoiceDialog({
  invoice, customer, company, paymentLinkUrl, onClose,
}: {
  invoice: invoicesApi.Invoice;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  /** PayWay hosted-checkout URL for this invoice (if any). Auto-
   *  bundled into the mail body so the customer can pay in one tap
   *  without waiting for a separate share step. Only http(s) URLs
   *  are useful in an email — deep-link schemes are filtered out
   *  earlier in the pipeline. */
  paymentLinkUrl?: string | null;
  onClose: () => void;
}) {
  const fmtUsd = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const defaultSubject =
    `Invoice ${invoice.invoiceNo}${company?.name ? ` from ${company.name}` : ''}`;
  const payLine = paymentLinkUrl
    ? [`Pay online: ${paymentLinkUrl}`, '']
    : [];
  const defaultBody = [
    `Dear ${customer?.representative || customer?.name || 'Customer'},`,
    '',
    `Please find your invoice ${invoice.invoiceNo} dated ${invoice.issueDate}.`,
    `Amount due: ${fmtUsd(invoice.total)}${invoice.dueDate ? ` — due by ${invoice.dueDate}` : ''}.`,
    '',
    ...payLine,
    'A printed copy is attached. Let us know if you have any questions.',
    '',
    `Regards,${company?.name ? `\n${company.name}` : ''}`,
  ].join('\n');

  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [subject, setSubject] = useState<string>(defaultSubject);
  const [body, setBody] = useState<string>(defaultBody);

  const handleSend = () => {
    if (!to.trim()) {
      toast.error('Recipient email is required');
      return;
    }
    // Encode each field separately so commas and Khmer characters
    // survive the URL roundtrip on every mail client.
    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('body', body);
    if (cc.trim()) params.set('cc', cc.trim());
    // mailto: needs the address before the query string — URLSearchParams
    // doesn't encode '@', which mail clients want intact.
    const href = `mailto:${encodeURIComponent(to.trim())}?${params.toString()}`;
    window.location.href = href;
    toast.success('Opened your mail client — review and send.');
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Send invoice by email
          </DialogTitle>
          <DialogDescription>
            Opens your default mail client (Gmail / Outlook / Apple Mail) with
            the message pre-filled. Print → Save as PDF first if you want to
            attach the invoice itself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>To <span className="text-red-500">*</span></Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Cc</Label>
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend}>
            <Send className="h-4 w-4 mr-1.5" /> Open in mail client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Record-payment dialog                                                      */
/* -------------------------------------------------------------------------- */
function RecordPaymentDialog({
  invoice, onClose, onSaved,
}: {
  invoice: invoicesApi.Invoice;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Outstanding uses the ledger's net balance when available; falls
  // back to the simple total - paid otherwise. For a Credit Note the
  // chain net is negative (a refund is pending, e.g. AR=−$55), and
  // the natural default amount to refund is the absolute value of
  // that imbalance. For regular Invoice / Tax / DN rows the net is
  // positive (customer still owes) and the default is the positive
  // outstanding amount. Math.abs() covers both because the dialog's
  // amount field is unsigned — direction is picked by the toggle.
  const net = invoice.netBalance ?? (invoice.total - invoice.paidAmount);
  const isCn = invoice.kind === 'credit_note';
  const outstanding = isCn ? Math.abs(net) : Math.max(0, net);
  // Default direction depends on what's being settled:
  //   Credit Note  → debit  (we refund the customer)
  //   Debit Note   → credit (customer pays extra)
  //   Invoice      → credit (customer pays)
  // HR can still flip it via the toggle for unusual cases.
  const [direction, setDirection] = useState<paymentsApi.PaymentDirection>(
    invoice.kind === 'credit_note' ? 'debit' : 'credit'
  );
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  // Tenant currency settings drive which payment-currency buttons
  // render — a single-currency tenant sees no picker at all. Payment
  // options intersect the tenant's enabled currencies with what the
  // backend accepts (USD | KHR only for now — KRW payments would
  // require a backend regex/enum update).
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  const payCurrencyOptions = currencySettings
    ? currencyApi.enabledCurrencies(currencySettings).filter(c => c === 'USD' || c === 'KHR')
    : [];
  const [currency, setCurrency] = useState<paymentsApi.PaymentCurrency>(
    // Default to the invoice's own currency when it's payment-
    // supported; otherwise fall back to USD so the payload validates.
    invoice.currency === 'KHR' ? 'KHR' : 'USD',
  );
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Default to Bank transfer — most invoice payments land via PayWay
  // or a customer wire, so 'bank' matches the operator's typical
  // Record Payment intent. The picker still exposes Cash for
  // over-the-counter cases.
  const [method, setMethod] = useState<paymentsApi.PaymentMethod>('bank');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      await paymentsApi.create({
        invoiceId: invoice.id,
        paymentDate,
        amount: amt,
        currency,
        method,
        direction,
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
      });
      toast.success(direction === 'debit' ? 'Refund recorded' : 'Payment recorded');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Against {invoice.invoiceNo} — outstanding {fmtMoney(outstanding, invoice.currency)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Direction toggle — credit is the normal case (customer
              paid us); debit covers refunding a credit note (we paid
              the customer back). The signed sum feeds the invoice's
              net Paid total. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('credit')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  direction === 'credit'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="text-base leading-none">+</span> Credit · money in
              </button>
              <button
                type="button"
                onClick={() => setDirection('debit')}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  direction === 'debit'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="text-base leading-none">−</span> Debit · refund out
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount *</Label>
              {/* Step / min track the currency — riel has no sub-units,
               *  so KHR amounts step by 1 and reject decimals; USD keeps
               *  the cents-grade 0.01 step. */}
              <Input
                type="number"
                min={currency === 'KHR' ? '1' : '0.01'}
                step={currency === 'KHR' ? '1' : '0.01'}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            {/* Payment currency buttons — one per enabled currency in
                tenant Settings. Hidden entirely when the tenant has
                only one enabled currency (no choice to make). */}
            {payCurrencyOptions.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <div className={`grid gap-1 ${payCurrencyOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {payCurrencyOptions.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c as paymentsApi.PaymentCurrency)}
                      className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                        currency === c
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={v => setMethod(v as paymentsApi.PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* KHQR sits at the top — it's what the PayWay push
                      auto-stamps and the operator's typical
                      Record-Payment path when the customer scanned
                      the invoice's QR code. */}
                  <SelectItem value="khqr">KHQR</SelectItem>
                  <SelectItem value="bank">Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Credit/Debit</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference number</Label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Bank ref / cheque no / auth code" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
