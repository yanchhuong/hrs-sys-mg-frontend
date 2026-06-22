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
import { formatMoneyForCurrency } from '../../utils/format';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight, Settings,
  Send, Ban, Eye, ChevronDown, Printer, Pencil, Search, Info, Mail, MessageCircle, Loader2, Landmark,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

/* -------------------------------------------------------------------------- */
/* Kind / status helpers — labels, badge colours, icons                       */
/* -------------------------------------------------------------------------- */
const KIND_LABEL: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'Commercial',
  tax:         'Tax',
  credit_note: 'Credit Note',
  debit_note:  'Debit Note',
};
const KIND_BADGE_CLASS: Record<invoicesApi.InvoiceKind, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-violet-300 text-violet-700 bg-violet-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
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

/** Current-month bounds as ISO yyyy-MM-dd strings. Used to seed the
 *  toolbar date filter so HR lands on the current month's activity by
 *  default. Inlined (no date-fns) — one tiny helper keeps the import
 *  list lean and the math is locale-neutral. */
function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0);   // day 0 of next month = last day of current
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to:   `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
  };
}

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
export function Invoices() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('invoice');
  const canEdit = canUpdate('invoice');
  const canRemove = canDelete('invoice');

  const [rows, setRows] = useState<invoicesApi.Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<invoicesApi.InvoiceKind | 'all'>('all');
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  // Date-range + keyword filters — applied client-side over the rows
  // we already loaded so HR sees instant feedback when scrubbing dates
  // or typing without round-tripping for each keystroke.
  //
  // Defaults to the current calendar month so HR lands on the most
  // recent activity rather than a multi-year scroll. Clear button on
  // the toolbar empties both inputs to show everything.
  const [dateFrom, setDateFrom] = useState(() => currentMonthBounds().from);
  const [dateTo, setDateTo] = useState(() => currentMonthBounds().to);
  const [search, setSearch] = useState('');

  // Per-side Accountant settings (V92) — Sale row is independent
  // from Purchase, so toggling Discount off here doesn't flip it on
  // the Bill page. Fetched on mount; the Settings popup refreshes
  // this when the user saves.
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings>(
    accountingSettingsApi.defaultsFor('sale'));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
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

  const pagination = usePagination(groupedRows, 25);

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
          <h1 className="text-3xl font-bold">{t('nav.invoices')}</h1>
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
          {canAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Invoice
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
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={kindFilter} onValueChange={v => setKindFilter(v as typeof kindFilter)}>
              <TabsList>
                {KIND_FILTERS.map(f => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              {/* Date range — inclusive, either end may be open. Backend
                  returns the most recent rows; the range narrows the
                  loaded page so HR doesn't need to re-fetch per scrub. */}
              <Label className="text-xs text-gray-500">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              <Label className="text-xs text-gray-500">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 w-36 text-sm"
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
              <Table>
                <TableHeader>
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
                      <TableCell className="font-mono text-sm">
                        {isAdjustment && (
                          <span className="text-gray-400 mr-1.5" title="Adjusts the parent invoice above">↳</span>
                        )}
                        {inv.invoiceNo}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${KIND_BADGE_CLASS[inv.kind]}`}>
                          {KIND_LABEL[inv.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {customerById.get(inv.customerId)?.name ?? <span className="text-gray-400">(unknown)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{inv.issueDate}</TableCell>
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
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailId(inv.id)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          {/* Only root invoices (commercial / tax) can
                              carry adjustments; voided rows are sealed.
                              The dropdown skips the parent-picker step
                              in the form by setting formParentPrefill. */}
                          {canAdd && !isAdjustment && inv.status !== 'void' && (
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
                        <TableCell colSpan={2} />
                      </TableRow>
                    ))}
                  </TableFooter>
                )}
              </Table>
              {pagination.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={(pagination.currentPage - 1) * 25}
                    endIndex={Math.min(pagination.currentPage * 25, groupedRows.length)}
                    totalItems={groupedRows.length}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setFormEditing(null); setFormParentPrefill(null); } }}
        kind={formKind}
        customers={customers}
        invoices={rows}
        editing={formEditing}
        parentPrefill={formParentPrefill}
        settings={settings}
        onCreated={async () => { setFormOpen(false); setFormEditing(null); setFormParentPrefill(null); await load(); }}
      />

      {/* Sale-side Accountant settings popup. Independent from the
          Bill page's popup — each scope has its own row + audit. */}
      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="sale"
        onSaved={setSettings}
      />

      {/* Detail dialog */}
      {detailId && (
        <InvoiceDetailDialog
          invoiceId={detailId}
          customers={customers}
          canEdit={canEdit}
          settings={settings}
          onClose={() => setDetailId(null)}
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
  onCreated: () => Promise<void> | void;
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
      setCurrency(seedParent?.currency ?? 'USD');
      setExchangeRate(seedParent ? String(seedParent.exchangeRate) : '4100');
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
   *  with the dialog afterwards. */
  const createAndIssue = async () => {
    const created = await invoicesApi.create(buildPayload());
    try {
      await invoicesApi.issue(created.id);
      toast.success(`${KIND_LABEL[kind]} ${created.invoiceNo} issued`);
    } catch (e) {
      toast.warning(`${created.invoiceNo} created as draft (issue failed: ${e instanceof Error ? e.message : 'unknown'})`);
    }
    return created;
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
   *  follow-up differs. */
  const submitAndClose = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createAndIssue();
      await onCreated();
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
                className="font-mono"
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
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 8))} placeholder="USD" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exchange rate (KHR per 1 {currency || 'USD'})</Label>
              <Input
                type="number" min={0} step="0.0001"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                placeholder="4100"
              />
            </div>
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
                  <span>Total USD</span>
                  <span className="tabular-nums w-32 text-right">{fmtMoney(total, currency)}</span>
                </div>
                <div className="flex justify-end gap-6 text-gray-700">
                  <span>Total KHR <span className="text-[10px] text-gray-400">@ {Number(exchangeRate) || 0}</span></span>
                  <span className="tabular-nums w-32 text-right">KHR {totalKhr.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </div>
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
}) {
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [parentInvoice, setParentInvoice] = useState<invoicesApi.Invoice | null>(null);
  // Company info drives the print header (logo, Khmer + English name,
  // VAT TIN boxes, address, phone). Loaded once when the dialog opens —
  // soft-fail so the print still renders without it.
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  // Payments augmented with the source document they were recorded
  // against — so the unified table on a root invoice can show
  // payments + DN receipts + CN refunds in one chronological view.
  type LedgerPayment = paymentsApi.Payment & {
    documentNo: string;
    documentKind: invoicesApi.InvoiceKind;
  };
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
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
              <DialogTitle className="font-mono">{invoice?.invoiceNo ?? 'Invoice details'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !invoice ? (
                  <span className="text-xs text-gray-500">Loading invoice…</span>
                ) : (
                  <>
                    <Badge variant="outline" className={KIND_BADGE_CLASS[invoice.kind]}>
                      {KIND_LABEL[invoice.kind]}
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[invoice.status]}`}>
                      {invoice.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{invoice.issueDate}</span>
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
                <Button size="sm" variant="outline" onClick={() => { void printWithKhmerFonts(); }} title="Print invoice">
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
                    onClick={() => doAction('Invoice issued',
                      () => invoicesApi.issue(invoice.id).then(setInvoice))}
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
                  <div className="font-mono text-sm">
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
                  {invoice.items.map(it => (
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
            </div>

            {/* Notes / Terms 2-col + summary. Gated by the same tenant
                Accountant Settings as the create form — a section
                hidden on the form is hidden here too. Layout drops to
                single-column when only one side is on so the summary
                still aligns to the right. */}
            <div className={`grid gap-3 ${
              (settings.showNotes && settings.showTerms) ? 'grid-cols-2' : 'grid-cols-1'
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
                    <div className="flex justify-end gap-6 font-semibold border-t pt-1 mt-1"><span>Total USD</span><span className="tabular-nums w-32 text-right">{fmtMoney(totalUsd, 'USD')}</span></div>
                    <div className="flex justify-end gap-6 text-gray-700"><span>Total KHR <span className="text-[10px] text-gray-400">@ {invoice.exchangeRate}</span></span><span className="tabular-nums w-32 text-right">{fmtMoney(totalKhr, 'KHR')}</span></div>
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
                          <TableCell className={`font-mono text-sm ${isVoid ? 'line-through' : ''}`}>{a.invoiceNo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={KIND_BADGE_CLASS[a.kind]}>
                              {KIND_LABEL[a.kind]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{a.issueDate}</TableCell>
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
                  <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)} className="print:hidden">
                    <Plus className="h-3 w-3 mr-1" /> Record payment
                  </Button>
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
                    {payments.map(p => {
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
                        <TableCell className="text-sm">{p.paymentDate}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-600">{p.documentNo}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={chipClass}>
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{p.method}</TableCell>
                        <TableCell className="text-sm text-gray-600">{p.referenceNo ?? '—'}</TableCell>
                        {/* Currency badge + single Amount cell — the row
                         *  carries its own captured currency, and the
                         *  Amount renders in that currency (USD 2dp, KHR
                         *  0dp via fmtMoney). Sign / color match the
                         *  outflow logic above. */}
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">{p.currency}</Badge>
                        </TableCell>
                        <TableCell className={`text-right text-sm tabular-nums ${isOutflow ? 'text-red-700' : ''}`}>
                          {isOutflow ? '− ' : ''}{fmtMoney(p.amount, p.currency)}
                        </TableCell>
                        <TableCell className="text-right">
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
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
            <PrintTaxInvoice invoice={invoice} customer={customer} company={companyInfo} paid={isPaid} />
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

        {mailDialogOpen && invoice && (
          <MailInvoiceDialog
            invoice={invoice}
            customer={customer}
            company={companyInfo}
            onClose={() => setMailDialogOpen(false)}
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
            width: '14px',
            height: '16px',
            fontSize: '11px',
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
  invoice, customer, company, paid,
}: {
  invoice: invoicesApi.Invoice;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  /** When true, overlay the red rubber-stamp "PAID" on the print
   *  output. Driven by the parent's chain-aware AR == 0 check so
   *  the stamp on screen and on paper share the same trigger. */
  paid?: boolean;
}) {
  // FX rate is captured per-invoice; KHR line uses the snapshot rather
  // than today's rate so reprinting later still matches the original.
  const grandKhr = Math.round(invoice.total * (invoice.exchangeRate || 0));
  const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtKhr = (n: number) => `៛ ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  // VAT line shows only when the invoice actually has tax — the totals
  // block stays tight on zero-VAT exports / receipts.
  const showVat = invoice.taxAmount > 0;
  const vatPct = invoice.subtotal > 0 ? Math.round((invoice.taxAmount / invoice.subtotal) * 100) : 0;
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
  const showBank = banks.length > 0;

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
      {/* Header — logo on the left (blank slot when absent so the centered
       *  name doesn't drift), company name centered. No divider line
       *  below; contact / VAT TIN render in a clean centered block under. */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', gap: '16px' }}>
        <div style={{ minHeight: '52px' }}>
          {company?.logoUrl && (
            <img src={company.logoUrl} alt="" style={{ height: '52px', objectFit: 'contain' }} />
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          {/* Moul has a single weight (400). Don't request 700 here
              or the browser falls back to a substitute that doesn't
              look like Moul. The face is already heavy by design. */}
          <div className="kh-title" style={{
            fontSize: '20px',
            fontWeight: 400,
            lineHeight: 1.15,
            fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>{companyKh}</div>
          {companyEn && companyEn !== companyKh && (
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>{companyEn}</div>
          )}
        </div>
        <div />
      </div>

      {/* Company contact line — centered, plain, no border */}
      <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', lineHeight: 1.5 }}>
        {company?.address && <div>{company.address}</div>}
        {(company?.phone || company?.taxId) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
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

      {/* Centered bilingual title with side rules */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
        <div style={{ textAlign: 'center' }}>
          <div className="kh-title" style={{
            fontSize: '20px',
            fontWeight: 400,
            fontFamily: "'Moul', 'Battambang', 'Noto Sans Khmer', serif",
          }}>វិក្កយបត្រអាករ</div>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>TAX INVOICE</div>
        </div>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
      </div>

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

      {/* Items table — bilingual headers, totals folded into the same table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={thStyle} ><BiLabel kh="ល.រ." en="N°" /></th>
            <th style={{ ...thStyle, textAlign: 'left' }}><BiLabel kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en="Description" /></th>
            <th style={thStyle}><BiLabel kh="បរិមាណ" en="Quantity" /></th>
            <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="ថ្លៃឯកតា" en="Unit Price" /></th>
            <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="បញ្ចុះតម្លៃ" en="Discount" /></th>
            <th style={{ ...thStyle, textAlign: 'right' }}><BiLabel kh="ថ្លៃទំនិញ" en="Amount" /></th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, idx) => (
            <tr key={it.id}>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{idx + 1}</td>
              <td style={tdStyle}>
                <div>{it.name}</div>
                {it.description && <div style={{ fontSize: '10px', color: '#555' }}>{it.description}</div>}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{it.quantity}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtUsd(it.unitPrice)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtUsd(0)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtUsd(it.lineTotal)}</td>
            </tr>
          ))}
          {/* Totals folded into the same table — looks like the WABOOKS PDF */}
          <tr>
            <td colSpan={5} style={{ ...tdStyle, textAlign: 'right' }}>សរុប (ដុល្លារ) / Sub Total (USD)</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtUsd(invoice.subtotal)}</td>
          </tr>
          {showVat && (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, textAlign: 'right' }}>
                អាករលើតម្លៃបន្ថែម {vatPct}% (ដុល្លារ) / VAT {vatPct}% (USD)
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtUsd(invoice.taxAmount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម (ដុល្លារ) / Grand Total (USD)</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtUsd(invoice.total)}</td>
          </tr>
          <tr>
            <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>សរុបរួម (រៀល) / Grand Total (KHR)</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtKhr(grandKhr)}</td>
          </tr>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '6px' }}>
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
      </div>

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', marginTop: '60px', fontSize: '11px', textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Customer's Signature &amp; Name</div>
        </div>
        <div style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
          <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
          <div style={{ fontSize: '10px', color: '#555' }}>Seller's Signature &amp; Name</div>
        </div>
      </div>
    </div>
  );
  // createPortal's return type changed between React 17 / 18 type defs
  // and a duplicate @types/react in node_modules trips the JSX check.
  // Cast through React.ReactElement so the caller sees a valid element.
  return createPortal(tree, document.body) as unknown as React.ReactElement;
}

const thStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 6px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 6px',
  verticalAlign: 'top',
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
function MailInvoiceDialog({
  invoice, customer, company, onClose,
}: {
  invoice: invoicesApi.Invoice;
  customer?: customersApi.Customer;
  company: settingsApi.CompanyInfo | null;
  onClose: () => void;
}) {
  const fmtUsd = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const defaultSubject =
    `Invoice ${invoice.invoiceNo}${company?.name ? ` from ${company.name}` : ''}`;
  const defaultBody = [
    `Dear ${customer?.representative || customer?.name || 'Customer'},`,
    '',
    `Please find your invoice ${invoice.invoiceNo} dated ${invoice.issueDate}.`,
    `Amount due: ${fmtUsd(invoice.total)}${invoice.dueDate ? ` — due by ${invoice.dueDate}` : ''}.`,
    '',
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
  const [currency, setCurrency] = useState<paymentsApi.PaymentCurrency>(
    // Default to the invoice's own currency so the operator usually
    // just needs to confirm. KHR is one click away when the cashier
    // received riel against a USD invoice.
    invoice.currency === 'KHR' ? 'KHR' : 'USD',
  );
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<paymentsApi.PaymentMethod>('cash');
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
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setCurrency('KHR')}
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                    currency === 'KHR'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}
                >KHR</button>
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                    currency === 'USD'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}
                >USD</button>
              </div>
            </div>
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
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
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
