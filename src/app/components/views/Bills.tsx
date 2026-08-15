import { useEffect, useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { DateInput } from '../common/DateInput';
import { SearchablePicker } from '../common/SearchablePicker';
import { LinkifiedText } from '../common/LinkifiedText';
import { AccountingSettingsDialog } from '../common/AccountingSettingsDialog';
import { AttachmentsPanel } from '../common/AttachmentsPanel';
import * as accountingSettingsApi from '../../api/accountingSettings';
import * as billsApi from '../../api/bills';
import * as billPaymentsApi from '../../api/billPayments';
import * as usersApi from '../../api/users';
import { formatMoneyForCurrency } from '../../utils/format';
import { printWithKhmerFonts } from '../../utils/printFonts';
import * as vendorsApi from '../../api/vendors';
import * as itemsApi from '../../api/items';
import * as currencyApi from '../../api/currencySettings';
import { StockItemPicker } from '../common/StockItemPicker';
import { CameraBarcodeScanner } from '../common/CameraBarcodeScanner';
import { consumeProfitLossNavIntent } from './ProfitLossReport';
import {
  Plus, Trash2, RefreshCw, FileText, Receipt, CornerDownRight, CornerUpRight, Settings,
  Send, Ban, Eye, ChevronDown, Printer, Pencil, Search, Info, Upload, FileSpreadsheet,
  ScanBarcode,
} from 'lucide-react';
import { BulkUploadBillsDialog } from '../common/BulkUploadBillsDialog';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';
import { exportListToExcel } from '../../utils/excelExport';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { useI18n } from '../../i18n/I18nContext';

/* -------------------------------------------------------------------------- */
/* Kind / status helpers — labels, badge colours, icons                       */
/* -------------------------------------------------------------------------- */
/** Bills come in one root flavour ("Bill") plus the two adjustment
 *  shapes — there's no Commercial vs Tax split like the sale side
 *  has. The schema still uses `commercial` as the root kind so the
 *  ledger logic and the parent_bill_id CHECK constraint stay
 *  aligned; it just reads as "Bill" everywhere in the UI, and we
 *  refuse `tax` on the create dropdown / filter so no one creates a
 *  Bill of the other shape by accident. */
const KIND_LABEL: Record<billsApi.BillKind, string> = {
  commercial:  'Bill',
  tax:         'Bill',
  credit_note: 'Credit Note',
  debit_note:  'Debit Note',
};
const KIND_BADGE_CLASS: Record<billsApi.BillKind, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-blue-300 text-blue-700 bg-blue-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
};
/** V98 simplified the Bill workflow to Progress / Paid (+ Void
 *  terminal). Legacy draft / partially / overdue values still appear
 *  in unmigrated data; the badge map shares the Progress style so
 *  the visible status reads consistently. */
const STATUS_BADGE_CLASS: Record<billsApi.BillStatus, string> = {
  // Amber for pending — reads as "waiting on approvers" without
  // leaning on red (which we reserve for void). V177.
  pending:   'border-amber-300 text-amber-700 bg-amber-50',
  draft:     'border-blue-300 text-blue-700 bg-blue-50',
  progress:  'border-blue-300 text-blue-700 bg-blue-50',
  partially: 'border-blue-300 text-blue-700 bg-blue-50',
  paid:      'border-emerald-300 text-emerald-700 bg-emerald-50',
  // Returned = settled purchase Credit Note (vendor refunded us).
  // Sky hue separates the cash-in-from-vendor direction from a
  // regular Paid bill (emerald = we paid the vendor).
  returned:  'border-sky-300 text-sky-700 bg-sky-50',
  overdue:   'border-blue-300 text-blue-700 bg-blue-50',
  void:      'border-red-300 text-red-700 bg-red-50',
};
const STATUS_LABEL: Record<billsApi.BillStatus, string> = {
  pending:   'pending',
  draft:     'progress',
  progress:  'progress',
  partially: 'progress',
  paid:      'paid',
  returned:  'returned',
  overdue:   'progress',
  void:      'void',
};

const KIND_FILTERS: ReadonlyArray<{ value: billsApi.BillKind | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'commercial',  label: 'Bills' },
  { value: 'credit_note', label: 'Credit Notes' },
  { value: 'debit_note',  label: 'Debit Notes' },
];

/** Render an amount with the currency in front. USD collapses to "$"
 *  (no space — matches how customers read it on a printed invoice);
 *  other currencies keep the ISO code prefix with a space so the
 *  symbol stays unambiguous. */
/** Constrain a raw input to a decimal shape: digits + at most one
 *  dot + up to `decimals` fractional digits (default 2). Same helper
 *  used on Invoices / Quotations / Vouchers. */
const maskDecimal = (raw: string, decimals = 2): string => {
  let s = raw.replace(/[^\d.]/g, '');
  const first = s.indexOf('.');
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = s.split('.');
  return decPart !== undefined ? `${intPart}.${decPart.slice(0, decimals)}` : s;
};

const fmtMoney = (n: number, currency: string): string => {
  // Negative amounts render as "− $X" (leading minus + unsigned
  // amount) so they line up with the explicit "− {fmtMoney(positive)}"
  // labels used for Discount / Refund elsewhere in this view.
  // KHR formats with no decimals; USD / other keep 2dp — see
  // formatMoneyForCurrency.
  //
  // Snap floating-point drift to zero so a chain-net like -0.0039
  // doesn't render as "− $0.00".
  const epsilon = currency === 'KHR' ? 0.5 : 0.005;
  if (Math.abs(n) < epsilon) n = 0;
  const num = formatMoneyForCurrency(Math.abs(n), currency);
  const body = currency === 'USD' ? `$${num}`
    : currency === 'KHR' ? `៛ ${num}`
    : `${currency} ${num}`;
  return n < 0 ? `− ${body}` : body;
};

/** Taxation matrix — datakey → display label + percentage. Mirrors
 *  the cross-system reference; backend service uses the same rates. */
const TAX_TYPES: ReadonlyArray<{ key: billsApi.BillTaxType; label: string; rate: number }> = [
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
/** Bills only have one root kind — treated as a full "Tax Bill" so
 *  every taxation pattern is available. CN/DN against a Bill inherit
 *  the same full set. parentKind is kept in the signature for API
 *  parity with the Invoices surface but has no effect here. */
const TAX_TYPES_FOR_KIND = (_kind: billsApi.BillKind, _parentKind?: billsApi.BillKind): typeof TAX_TYPES => {
  return TAX_TYPES;
};

/**
 * Inline confirmation card shown below the customer picker in the
 * invoice form. Business vendors expose the columns the printed
 * invoice will pick up (TIN / representative / site / address);
 * individuals show phone + address. Renders nothing when no
 * customer is selected.
 */
function VendorInfoCard({ vendor }: { vendor: vendorsApi.Vendor | undefined }) {
  if (!vendor) return null;
  const rows: Array<{ label: string; value: string | null | undefined }> =
    vendor.type === 'business'
      ? [
          { label: 'Company',        value: vendor.name },
          { label: 'TIN',            value: vendor.tin },
          { label: 'Representative', value: vendor.representative },
          { label: 'Phone',          value: vendor.phone },
          { label: 'Site',           value: vendor.site },
          { label: 'Address',        value: vendor.address },
        ]
      : [
          { label: 'Name',    value: vendor.name },
          { label: 'Phone',   value: vendor.phone },
          { label: 'Address', value: vendor.address },
        ];
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${
      vendor.type === 'business' ? 'bg-violet-50 border-violet-200' : 'bg-emerald-50 border-emerald-200'
    }`}>
      <div className="flex items-center gap-1.5 mb-1 font-medium text-[11px] uppercase tracking-wide text-gray-500">
        {vendor.type === 'business' ? 'Business vendor' : 'Individual vendor'}
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
export function Bills() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete, canView } = useAuth();
  const { formatDate } = useDateFormat();
  const canAdd = canCreate('bill');
  const canEdit = canUpdate('bill');
  const canRemove = canDelete('bill');

  const [rows, setRows] = useState<billsApi.Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<billsApi.BillKind | 'all'>('all');
  const [vendors, setVendors] = useState<vendorsApi.Vendor[]>([]);
  // Date-range + keyword filters — applied client-side over the rows
  // we already loaded so HR sees instant feedback when scrubbing dates
  // or typing without round-tripping for each keystroke.
  //
  // Defaults to empty so the landing view shows every bill; users
  // pick a range to narrow. Pagination keeps the list scroll bounded
  // even with several years of data.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Per-side Accountant settings (V92) — Purchase row is independent
  // from Sale. Each side has its own toggles, prefixes, and audit
  // trail. Fetched on mount; refreshed when the popup saves.
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings>(
    accountingSettingsApi.defaultsFor('purchase'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<billsApi.BillKind>('commercial');
  /** When set, the form dialog runs in edit-mode against this invoice
   *  instead of opening blank for a fresh create. */
  const [formEditing, setFormEditing] = useState<billsApi.Bill | null>(null);
  /** When set, the form dialog opens for a CN/DN pre-pointing at this
   *  invoice id (skips the parent picker — saves a click from the
   *  inline "adjust" dropdown on each commercial/tax row). */
  const [formParentPrefill, setFormParentPrefill] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<billsApi.Bill | null>(null);
  // Per-currency Paid totals for the visible page. Values come back
  // signed the same as sumForBill (credit positive, debit negative);
  // the table flips the sign when rendering so "Paid" reads positive
  // for the typical "we paid the vendor" case.
  const [paidByCurrency, setPaidByCurrency] = useState<Record<string, Partial<Record<billPaymentsApi.PaymentCurrency, number>>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, custRes] = await Promise.all([
        billsApi.list({ kind: kindFilter === 'all' ? undefined : kindFilter, size: 200 }),
        vendorsApi.list({ size: 500 }),
      ]);
      const bills = invRes.content ?? [];
      setRows(bills);
      setVendors(custRes.content ?? []);
      // Skip for roles without bill:view (endpoint is behind the same
      // gate as the Bills list on the BE) — the empty totals map is a
      // fine fallback and the network tab stays clean.
      if (canView('bill')) {
        billPaymentsApi.totalsByCurrency(bills.map(b => b.id))
          .then(setPaidByCurrency)
          .catch(() => setPaidByCurrency({}));
      } else {
        setPaidByCurrency({});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kindFilter]);

  // Cross-page nav intent from the P&L report — clicking an expense
  // Bill row on ProfitLossReport stashes the bill id in sessionStorage
  // and switches the sidebar view; we pop the intent here and open
  // the detail dialog on mount.
  useEffect(() => {
    const pending = consumeProfitLossNavIntent('bill');
    if (pending) setDetailId(pending);
  }, []);

  // One-shot fetch of the Purchase-side Accountant settings.
  // Independent from the Sale-side row on the Invoice page.
  useEffect(() => {
    accountingSettingsApi.get('purchase').then(setSettings).catch(() => {
      setSettings(accountingSettingsApi.defaultsFor('purchase'));
    });
  }, []);

  const vendorById = useMemo(() => {
    const m = new Map<string, vendorsApi.Vendor>();
    vendors.forEach(c => m.set(c.id, c));
    return m;
  }, [vendors]);

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
    const passesFilters = (r: billsApi.Bill): boolean => {
      if (dateFrom && r.issueDate < dateFrom) return false;
      if (dateTo   && r.issueDate > dateTo)   return false;
      if (!q) return true;
      const vendorName = vendorById.get(r.vendorId)?.name?.toLowerCase() ?? '';
      return r.billNo.toLowerCase().includes(q)
          || vendorName.includes(q)
          || (r.notes ?? '').toLowerCase().includes(q);
    };

    // For grouping: keep an adjustment visible if it OR its parent passes.
    // The parent stays visible too in that case so the chain isn't broken.
    const parentOf = new Map<string, billsApi.Bill>();
    rows.forEach(r => parentOf.set(r.id, r));
    const keepIds = new Set<string>();
    for (const r of rows) {
      if (passesFilters(r)) {
        keepIds.add(r.id);
        if (r.parentBillId && parentOf.has(r.parentBillId)) keepIds.add(r.parentBillId);
      }
    }
    const visible = rows.filter(r => keepIds.has(r.id));

    const adjustmentsByParent = new Map<string, billsApi.Bill[]>();
    const orphans: billsApi.Bill[] = [];
    const rowIds = new Set(visible.map(r => r.id));
    for (const r of visible) {
      if (!r.parentBillId) continue;
      if (rowIds.has(r.parentBillId)) {
        if (!adjustmentsByParent.has(r.parentBillId)) adjustmentsByParent.set(r.parentBillId, []);
        adjustmentsByParent.get(r.parentBillId)!.push(r);
      } else {
        orphans.push(r);
      }
    }
    const out: billsApi.Bill[] = [];
    for (const r of visible) {
      if (r.parentBillId) continue;
      out.push(r);
      const kids = adjustmentsByParent.get(r.id);
      if (kids) out.push(...kids);
    }
    return [...out, ...orphans];
  }, [rows, search, dateFrom, dateTo, vendorById]);

  const pagination = usePagination(groupedRows, 25);

  // Reset pagination to page 1 whenever a filter changes so HR
  // doesn't sit on a stale page after narrowing the results.
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
  /** Currency-aware AP per root bill — overrides the server's
   *  {@code netBalance} which sums payment amounts currency-blind
   *  (e.g. USD 100 + KHR 410,000 against a USD 200 bill produces a
   *  garbage figure). Convert KHR↔USD via the bill's own exchangeRate
   *  and walk the chain (root + non-void DN/CN children). On the
   *  purchase side, debit-direction payments are cash OUT (we paid
   *  the vendor), credit-direction are vendor refunds. paidByCurrency
   *  returns positive USD / KHR magnitudes from debit payments
   *  (matches the per-currency Paid columns on the list). Falls back
   *  to the server netBalance for rows whose per-currency totals
   *  haven't loaded yet. */
  const apByRowId = useMemo(() => {
    const out: Record<string, number> = {};
    const childrenByParent = new Map<string, billsApi.Bill[]>();
    for (const r of rows) {
      if (!r.parentBillId) continue;
      if (!childrenByParent.has(r.parentBillId)) childrenByParent.set(r.parentBillId, []);
      childrenByParent.get(r.parentBillId)!.push(r);
    }
    for (const root of rows) {
      if (root.parentBillId) continue;
      const rate = root.exchangeRate || 0;
      const convert = (usd: number, khr: number): number => {
        if (root.currency === 'USD') return usd + (rate > 0 ? khr / rate : 0);
        if (root.currency === 'KHR') return khr + usd * rate;
        return usd;
      };
      const nonVoidKids = (childrenByParent.get(root.id) ?? [])
        .filter(c => c.status !== 'void');
      const sumDn = nonVoidKids
        .filter(c => c.kind === 'debit_note')
        .reduce((s, c) => s + c.total, 0);
      const sumCn = nonVoidKids
        .filter(c => c.kind === 'credit_note')
        .reduce((s, c) => s + c.total, 0);
      // Server chain formula on the purchase side uses magnitudes:
      //   outflow = |root.paid| + Σ|DN.paid| − Σ|CN.refund|
      // The per-currency endpoint returns signed values (credit
      // positive = vendor refund, debit negative = we paid). For
      // root + DN we add the magnitude (any cash we sent out counts);
      // for CN we subtract the magnitude (vendor refund reduces our
      // net outflow, which raises our AP back up toward the gross).
      let outflow = 0;
      const docs = [root, ...nonVoidKids];
      let anyMissing = false;
      for (const d of docs) {
        const t = paidByCurrency[d.id];
        if (!t) { anyMissing = true; continue; }
        const signedUsd = convert(t.USD ?? 0, t.KHR ?? 0);
        const mag = Math.abs(signedUsd);
        if (d.kind === 'credit_note') {
          outflow -= mag;
        } else {
          outflow += mag;
        }
      }
      if (anyMissing) {
        out[root.id] = root.netBalance ?? (root.total - root.paidAmount);
      } else {
        out[root.id] = root.total + sumDn - sumCn - outflow;
      }
    }
    return out;
  }, [rows, paidByCurrency]);

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, { total: number; paid: number; paidUsd: number; paidKhr: number; remain: number }>();
    for (const r of groupedRows) {
      const c = r.currency || 'USD';
      if (!m.has(c)) m.set(c, { total: 0, paid: 0, paidUsd: 0, paidKhr: 0, remain: 0 });
      const slot = m.get(c)!;
      // CN total represents what we owe the customer → subtract from
      // the running Total. INV + DN add as receivables.
      slot.total += r.kind === 'credit_note' ? -r.total : r.total;
      // paidAmount is already a signed sum (credit = + cash in,
      // debit = − cash out), so the column total is just the
      // arithmetic sum.
      slot.paid += r.paidAmount;
      // Per-currency paid columns. Pull from the batched
      // /totals-by-currency map; fall back to the legacy paidAmount
      // bucketed into the row's native currency while loading.
      const perCur = paidByCurrency[r.id];
      const usd = perCur ? (perCur.USD ?? 0) : (c === 'USD' ? r.paidAmount : 0);
      const khr = perCur ? (perCur.KHR ?? 0) : (c === 'KHR' ? r.paidAmount : 0);
      slot.paidUsd += usd;
      slot.paidKhr += khr;
      if (!r.parentBillId) {
        // Use the currency-aware AP so the footer matches what the
        // per-row AP column shows.
        slot.remain += apByRowId[r.id] ?? r.netBalance ?? (r.total - r.paidAmount);
      }
    }
    return [...m.entries()].map(([currency, sums]) => ({ currency, ...sums }));
  }, [groupedRows, paidByCurrency, apByRowId]);

  const openCreate = (kind: billsApi.BillKind) => {
    setFormEditing(null);
    setFormParentPrefill(null);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Open the form dialog for a credit / debit note pre-pointing at
   *  the given parent invoice. Used by the inline dropdown on each
   *  commercial / tax row so HR doesn't have to manually pick the
   *  parent in the form. */
  const openAdjustment = (parent: billsApi.Bill, kind: 'credit_note' | 'debit_note') => {
    setFormEditing(null);
    setFormParentPrefill(parent.id);
    setFormKind(kind);
    setFormOpen(true);
  };

  /** Switch from the detail dialog into edit-mode on the form dialog
   *  pre-filled with this invoice. The detail dialog closes; on save
   *  the list refetches and the user lands back on the list view. */
  const openEdit = (inv: billsApi.Bill) => {
    setFormEditing(inv);
    setFormParentPrefill(null);
    setFormKind(inv.kind);
    setDetailId(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await billsApi.remove(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.billNo}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold">{t('nav.bills')}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* Settings popup — same tenant-wide toggles as the Invoice
              page (Notes / Terms / Discount / Tax). */}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
                  title="Accountant settings">
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => exportListToExcel({
              filename: 'Bills',
              sheetName: 'Bills',
              columns: [
                { header: 'Bill No',    value: r => r.billNo,                                          width: 18 },
                { header: 'Kind',       value: r => r.kind === 'tax' ? 'Tax'
                                                  : r.kind === 'commercial' ? 'Commercial'
                                                  : r.kind === 'credit_note' ? 'Credit Note'
                                                  : r.kind === 'debit_note'  ? 'Debit Note' : r.kind,   width: 14 },
                { header: 'Issue Date', value: r => r.issueDate,                                       width: 12 },
                { header: 'Due Date',   value: r => r.dueDate ?? '',                                  width: 12 },
                { header: 'Vendor',     value: r => vendorById.get(r.vendorId)?.name ?? '',           width: 30 },
                { header: 'Currency',   value: r => r.currency,                                       width: 8  },
                { header: 'Subtotal',   value: r => Number(r.subtotal ?? 0),                          width: 12 },
                { header: 'Tax',        value: r => Number(r.taxAmount ?? 0),                         width: 10 },
                { header: 'Discount',   value: r => Number(r.discountAmount ?? 0),                    width: 10 },
                { header: 'Total',      value: r => Number(r.total ?? 0),                             width: 12 },
                { header: 'Paid',       value: r => Number(r.paidAmount ?? 0),                        width: 12 },
                { header: 'Remain',     value: r => Number((r.total ?? 0) - (r.paidAmount ?? 0)),     width: 12 },
                { header: 'Status',     value: r => r.status,                                         width: 10 },
                { header: 'Notes',      value: r => r.notes ?? '',                                   width: 40 },
              ],
              rows: groupedRows,
            })}
            disabled={groupedRows.length === 0}
            size="icon"
            title="Download the current bill list as an Excel workbook"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          </Button>
          {canAdd && (
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(true)}
              title="Bulk upload bills from an Excel workbook"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Bulk Upload
            </Button>
          )}
          {canAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Bill
                  <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {/* Bills have a single root kind ("Bill") — no
                    Commercial / Tax split like the sale side. The
                    Bill row gets all five tax patterns. */}
                <DropdownMenuItem onClick={() => openCreate('commercial')}>
                  <FileText className="h-4 w-4 mr-2 text-blue-600" /> Bill
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
          {/* v-mobile-scrollable-filter-strip — on mobile the row
              stays on ONE line and the container scrolls
              horizontally; on sm: falls back to the original
              justify-between + flex-wrap. */}
          <div className="filter-strip">
            <select
              value={kindFilter}
              onChange={e => setKindFilter(e.target.value as typeof kindFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Filter by kind"
            >
              {KIND_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
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
                  placeholder="Search bill no, vendor, notes…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={8} columns={7} />
          ) : groupedRows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No bills yet.' : 'No bills match your filters.'}
            </p>
          ) : (
            <>
              {/* Scrollable container — vertical + horizontal overflow
                  stays inside the table area so the page never
                  side-scrolls and the column labels stay pinned. */}
              <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                  <TableRow>
                    <TableHead className="w-[160px]">Bill No.</TableHead>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right w-[110px]">Paid (USD)</TableHead>
                    <TableHead className="text-right w-[110px]">Paid (KHR)</TableHead>
                    <TableHead className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AP
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Payable — what we still owe the vendor after the full ledger (bill + DN − CN − net payments).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="text-right w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(inv => {
                    const isAdjustment = !!inv.parentBillId;
                    return (
                    <TableRow key={inv.id} className={isAdjustment ? 'bg-slate-50/50' : ''}>
                      <TableCell className="tabular-nums text-sm">
                        {isAdjustment && (
                          <span className="text-gray-400 mr-1.5" title="Adjusts the parent bill above">↳</span>
                        )}
                        {inv.billNo}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${KIND_BADGE_CLASS[inv.kind]}`}>
                          {KIND_LABEL[inv.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {vendorById.get(inv.vendorId)?.name ?? <span className="text-gray-400">(unknown)</span>}
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
                      {/* Sign-aware render — Bill payments carry a
                          signed sum (credit = + money in, debit = −
                          money out). CN with a credit-direction
                          payment is the vendor refunding us, so the
                          column reads + $X in emerald. CN with a
                          debit-direction payment (rare — we paid out
                          on a CN) reads − $X in rose. Non-CN rows
                          almost always carry a negative paid (we
                          paid vendor) — keep the existing render. */}
                      {/* Per-currency Paid columns. Values are signed
                       *  the same as sumForBill (credit = +money in,
                       *  debit = −money out). The render flips the
                       *  sign so "Paid" shows positive for the common
                       *  case of we-paid-vendor (stored as negative). */}
                      {(() => {
                        const totals = paidByCurrency[inv.id];
                        const loaded = !!totals;
                        const usd = loaded
                          ? (totals.USD ?? 0)
                          : (inv.currency === 'USD' ? inv.paidAmount : 0);
                        const khr = loaded
                          ? (totals.KHR ?? 0)
                          : (inv.currency === 'KHR' ? inv.paidAmount : 0);
                        const render = (val: number, cur: 'USD' | 'KHR') => {
                          // val < 0 = we paid vendor (typical); render
                          // as "+ $X" in emerald because that's the
                          // intuitive "we've paid this much" reading.
                          // val > 0 = vendor refunded us → "− $X" rose.
                          if (val === 0) {
                            return <span className="text-gray-300">—</span>;
                          }
                          if (val < 0) {
                            return <span className="text-emerald-700">{fmtMoney(Math.abs(val), cur)}</span>;
                          }
                          return <span className="text-red-700">− {fmtMoney(val, cur)}</span>;
                        };
                        return (
                          <>
                            <TableCell className="text-right text-sm tabular-nums">{render(usd, 'USD')}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{render(khr, 'KHR')}</TableCell>
                          </>
                        );
                      })()}
                      {/* Remain is meaningful only on the root invoice
                          — CN/DN rows already roll their balance up
                          into the parent's netBalance. Show a muted
                          em-dash on adjustment rows so the column
                          stays visually aligned. */}
                      {/* AP = currency-aware chain net. Server's
                          netBalance is currency-blind so a mixed-
                          currency payment chain produces garbage
                          (e.g. − $164,959.76 on a USD bill paid in
                          KHR). apByRowId walks the chain via the
                          bill's exchangeRate; falls back to the
                          server netBalance on first paint. */}
                      <TableCell className={`text-right text-sm tabular-nums ${
                        isAdjustment ? 'text-gray-300'
                          : (apByRowId[inv.id] ?? inv.netBalance ?? (inv.total - inv.paidAmount)) > 0 ? 'text-red-700 font-medium'
                          : 'text-gray-500'
                      }`}>
                        {isAdjustment ? '—' : fmtMoney(apByRowId[inv.id] ?? inv.netBalance ?? (inv.total - inv.paidAmount), inv.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[inv.status]}`}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
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
                          {fmtMoney(Math.abs(t.paidUsd), 'USD')}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                          {fmtMoney(Math.abs(t.paidKhr), 'KHR')}
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

      {/* Create / edit dialog */}
      <BillFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setFormEditing(null); setFormParentPrefill(null); } }}
        kind={formKind}
        vendors={vendors}
        bills={rows}
        editing={formEditing}
        parentPrefill={formParentPrefill}
        settings={settings}
        onCreated={async () => { setFormOpen(false); setFormEditing(null); setFormParentPrefill(null); await load(); }}
      />

      {/* Purchase-side Accountant settings popup. Independent from
          the Sale-side row — each scope has its own audit trail. */}
      <AccountingSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        scope="purchase"
        onSaved={setSettings}
      />

      {/* Bulk upload from Excel — mirrors the Invoice bulk flow.
          Auto-creates missing vendors on submit (Business when TIN
          present, Individual otherwise) and reloads the list on any
          successful import. */}
      <BulkUploadBillsDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        vendors={vendors}
        existingBillNos={rows.map(r => r.billNo)}
        onImported={() => { void load(); }}
      />

      {/* Detail dialog */}
      {detailId && (
        <BillDetailDialog
          billId={detailId}
          vendors={vendors}
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
            <AlertDialogTitle>Delete {deleteTarget?.billNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hard delete is only allowed on drafts — the row is removed completely.
              For issued bills use Void instead so the legal record stays auditable.
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
  /** Linked stock_items.id when the line was picked from the catalog —
   *  null for hand-typed names. Used by the server to decrement the
   *  Stock IN/OUT ledger only when a real item is referenced. */
  stockItemId?: string | null;
}

const blankItem: FormItem = { name: '', description: '', unit: '', quantity: '1', unitPrice: '0', stockItemId: null };

function BillFormDialog({
  open, onOpenChange, kind, vendors, bills, editing, parentPrefill, settings, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: billsApi.BillKind;
  vendors: vendorsApi.Vendor[];
  bills: billsApi.Bill[];
  /** When set, the dialog runs in edit mode against this invoice
   *  instead of creating a new one. Submit calls PUT /invoices/{id}
   *  instead of POST /invoices. */
  editing?: billsApi.Bill | null;
  /** When set on a create-mode open, seeds parentBillId so the
   *  parent picker is pre-filled. Used by the inline "adjust"
   *  dropdown on commercial / tax rows. */
  parentPrefill?: string | null;
  /** Tenant-wide toggles driving which optional sections of the form
   *  render (Notes / Terms / Discount / Tax). Shared with the
   *  Invoice page — same endpoint backs both. */
  settings: accountingSettingsApi.AccountingSettings;
  onCreated: () => Promise<void> | void;
}) {
  const isAdjustment = kind === 'credit_note' || kind === 'debit_note';
  const isEdit = !!editing;

  const [vendorId, setVendorId] = useState('');
  const [parentBillId, setParentInvoiceId] = useState('');
  /** Document number — pre-filled from /invoices/next-number on open
   *  for fresh creates and from the row on edit. Free-form input so
   *  HR can override the auto-sequential when needed (e.g. matching
   *  an external paper invoice). */
  const [billNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('4100');
  // Tenant currency settings (V166). Drives the dropdown options +
  // the default currency / exchange rate for fresh bills.
  //
  // Refetched every time the dialog OPENS — the tenant currency pair
  // can change via Bill Settings > Currency while this form was still
  // mounted, and we want the fresh values on the next open rather
  // than waiting for a page reload.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    if (!open) return;
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, [open]);
  const currencyOptions = currencyApi.enabledCurrencies(currencySettings);
  const [items, setItems] = useState<FormItem[]>([{ ...blankItem }]);
  // Stock-catalog picker (parity with Invoices / Quotations). Loaded
  // lazily the first time the user opens the picker. Gated by the
  // per-tenant Items → Settings dialog toggle (enabledForBill); when
  // off, lines stay free-text only.
  const [stockCatalog, setStockCatalog] = useState<itemsApi.Item[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [pickerEnabled, setPickerEnabled] = useState(false);
  /** V302 phase 2 — barcode feature gate for the scan input above
   *  the line-items table. */
  const [barcodeFeatureOn, setBarcodeFeatureOn] = useState(false);
  useEffect(() => {
    itemsApi.getUsageSettings()
      .then(s => {
        setPickerEnabled(s.enabledForBill);
        setBarcodeFeatureOn(s.enabledForBarcode);
      })
      .catch(() => { setPickerEnabled(false); setBarcodeFeatureOn(false); });
  }, []);
  const ensureCatalog = async () => {
    if (catalogLoaded) return;
    try {
      const res = await itemsApi.list({ size: 1000 });
      setStockCatalog(res.content ?? []);
    } catch {
      // Silent fail — free-text still works.
    } finally {
      setCatalogLoaded(true);
    }
  };
  const [taxType, setTaxType] = useState<billsApi.BillTaxType | ''>('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountType, setDiscountType] = useState<billsApi.DiscountType>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);
  // Chain-approver picker state (V172, Phase 3b). Empty = skip chain,
  // bill flows through legacy draft → issued → paid states.
  const [users, setUsers] = useState<usersApi.User[]>([]);
  const [approver1, setApprover1] = useState('');
  const [approver2, setApprover2] = useState('');
  const [approver3, setApprover3] = useState('');

  // Reset whenever the dialog opens. In edit mode, hydrate from the
  // invoice being edited; otherwise blank state for a fresh create,
  // and kick off a /next-number fetch so the doc-number input shows
  // the auto-generated default without waiting for the user to type.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVendorId(editing.vendorId);
      setParentInvoiceId(editing.parentBillId ?? '');
      setInvoiceNo(editing.billNo);
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
      setTaxType((editing.taxType ?? '') as billsApi.BillTaxType | '');
      setTaxAmount(String(editing.taxAmount));
      setDiscountType(editing.discountType ?? 'amount');
      setDiscountValue(String(editing.discountValue ?? editing.discountAmount));
      setNotes(editing.notes ?? '');
      setTerms(editing.terms ?? '');
    } else {
      // For a CN/DN opened via the inline dropdown, seed the parent
      // (and customer + currency + taxType) from the parent invoice
      // so HR doesn't re-pick them.
      const seedParent = parentPrefill ? bills.find(i => i.id === parentPrefill) : undefined;
      setVendorId(seedParent?.vendorId ?? '');
      setParentInvoiceId(parentPrefill ?? '');
      setInvoiceNo('');
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate('');
      setCurrency(seedParent?.currency ?? currencySettings?.primaryCurrency ?? 'USD');
      setExchangeRate(seedParent
        ? String(seedParent.exchangeRate)
        : String(currencySettings?.secondaryRate ?? 4100));
      setItems([{ ...blankItem }]);
      setTaxType((seedParent?.taxType ?? '') as billsApi.BillTaxType | '');
      setTaxAmount('0');
      setDiscountType('amount');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
      setApprover1('');
      setApprover2('');
      setApprover3('');
      // Fetch the preview after state resets — race-protected so a
      // rapid kind switch doesn't land the wrong value.
      let cancelled = false;
      billsApi.nextNumber(kind)
        .then(res => { if (!cancelled) setInvoiceNo(res.billNo); })
        .catch(() => { /* non-fatal — user can type their own */ });
      return () => { cancelled = true; };
    }
  }, [open, kind, editing, parentPrefill, bills]);

  // Users list feeds the Approver dropdowns. Only fetched on a NEW
  // bill AND when the tenant flipped Show Approval on in Bill
  // Settings (V175). 403 silently → empty picker; the operator can
  // still create without approvers.
  useEffect(() => {
    if (!open || editing || !settings.showApproval) return;
    void (async () => {
      try {
        const res = await usersApi.list({ size: 500 });
        setUsers(res.data ?? []);
      } catch {
        setUsers([]);
      }
    })();
  }, [open, editing, settings.showApproval]);

  // Follow-up sync: when the tenant currency settings arrive AFTER
  // the reset effect above ran (network race on first open), pin the
  // form's currency + exchange rate to the tenant defaults. Skip in
  // edit mode (the row's own currency wins) and when a parent
  // adjustment is being created (parent's currency wins).
  useEffect(() => {
    if (!open || editing || parentPrefill || !currencySettings) return;
    setCurrency(currencySettings.primaryCurrency);
    setExchangeRate(String(currencySettings.secondaryRate ?? 4100));
  }, [open, editing, parentPrefill, currencySettings]);

  const rootBillOptions = useMemo(() =>
    bills.filter(i => (i.kind === 'commercial' || i.kind === 'tax') && i.status !== 'void'),
    [bills]
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
  /** Row index whose scan icon opened the camera. On decode we look
   *  up the barcode and fill THAT row (matches Invoice's per-row UX). */
  const [scanTargetIdx, setScanTargetIdx] = useState<number | null>(null);

  /** Fill an existing item row with a scanned catalog entry. */
  const fillItemFromBarcode = async (idx: number, code: string) => {
    try {
      const si = await itemsApi.getByBarcode(code.trim());
      updateItem(idx, {
        stockItemId: si.id,
        name: si.name,
        unit: si.unit ?? '',
        unitPrice: String(si.unitPrice ?? 0),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `No item found for barcode ${code}`);
    }
  };

  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /** Build the request payload from the current form state. Used by
   *  every save flow (create / update / save & add new). */
  const buildPayload = (): billsApi.BillRequest => {
    // Chain approvers — ordered, dedup, drop blanks. Only sent on
    // create; update ignores the field server-side.
    const orderedApprovers: string[] = [];
    const seen = new Set<string>();
    for (const raw of [approver1, approver2, approver3]) {
      const v = raw?.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      orderedApprovers.push(v);
    }
    return {
      kind,
      parentBillId: isAdjustment ? parentBillId : undefined,
      billNo: billNo.trim() || undefined,
      vendorId,
      issueDate,
      dueDate: dueDate || undefined,
      currency,
      exchangeRate: Number(exchangeRate) || 1,
      taxType: (taxType || null) as billsApi.BillTaxType | null,
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
      ...(isEdit ? {} : { approverUserIds: orderedApprovers.length > 0 ? orderedApprovers : undefined }),
    };
  };

  const validate = (): boolean => {
    if (!vendorId) { toast.error('Vendor is required'); return false; }
    if (isAdjustment && !parentBillId) { toast.error('Pick the invoice this note adjusts'); return false; }
    if (items.length === 0 || items.some(it => !it.name.trim())) {
      toast.error('Each line item needs a name');
      return false;
    }
    return true;
  };

  /** Create → issue chain so a new Bill lands directly in Progress
   *  (the V98 / user-requested two-state model: Progress → Paid).
   *  Edit mode keeps the row's existing status — no auto-flip on
   *  edit, only on first save. If the issue step ever 4xx's the
   *  row is still on disk as draft and HR can promote from the
   *  list page; we toast a warning rather than a hard error. */
  const createAsProgress = async () => {
    const created = await billsApi.create(buildPayload());
    try {
      await billsApi.issue(created.id);
    } catch (e) {
      toast.warning(`${created.billNo} saved as draft (issue failed: ${e instanceof Error ? e.message : 'unknown'})`);
    }
    return created;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await billsApi.update(editing.id, buildPayload());
        toast.success(`${editing.billNo} updated`);
      } else {
        const created = await createAsProgress();
        toast.success(`${KIND_LABEL[kind]} ${created.billNo} created`);
      }
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const totalKhr = total * (Number(exchangeRate) || 0);

  /** Save as Progress + reset the form so HR can chain entries
   *  without re-opening the dialog. Same status path as submit. */
  const submitAndNew = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createAsProgress();
      toast.success(`${KIND_LABEL[kind]} ${created.billNo} created`);
      setItems([{ ...blankItem }]);
      setTaxAmount('0');
      setDiscountValue('0');
      setNotes('');
      setTerms('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create bill');
    } finally {
      setSaving(false);
    }
  };

  /** Save as Progress + close the dialog. */
  const submitAndClose = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createAsProgress();
      toast.success(`${KIND_LABEL[kind]} ${created.billNo} created`);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create bill');
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
          <DialogTitle>{isEdit ? `Edit ${editing?.billNo}` : `New ${KIND_LABEL[kind]}`}</DialogTitle>
          <DialogDescription>
            {isAdjustment
              ? 'Record an adjustment against the parent bill — lines and tax recompute the totals.'
              : 'Capture a vendor bill. Lines and tax type drive the totals; saving as Issued moves it into AP.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isAdjustment && (
            <div className="space-y-1.5">
              <Label className="text-xs">Adjusts bill *</Label>
              <Select value={parentBillId} onValueChange={setParentInvoiceId}>
                <SelectTrigger><SelectValue placeholder="Pick the original bill" /></SelectTrigger>
                <SelectContent>
                  {rootBillOptions.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No commercial or tax bills to adjust
                    </SelectItem>
                  ) : rootBillOptions.map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.billNo} — {KIND_LABEL[i.kind]} — {fmtMoney(i.total, i.currency)}
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
              <Label className="text-xs">Vendor *</Label>
              <SearchablePicker
                value={vendorId}
                onChange={setVendorId}
                placeholder="Pick vendor"
                searchPlaceholder="Search by name, phone, or TIN…"
                allowClear={false}
                options={vendors.map(c => ({
                  value: c.id,
                  label: c.name,
                  secondary: c.type === 'business'
                    ? `Business · ${c.tin ?? c.phone ?? ''}`
                    : `Individual · ${c.phone ?? ''}`,
                  searchKey: `${c.name} ${c.phone ?? ''} ${c.tin ?? ''} ${c.representative ?? ''}`,
                }))}
              />
              {/* Business vendors carry extra info that HR needs to
                  see on the invoice (TIN / representative / address);
                  individuals show their phone + address. The card is
                  a quick-glance review so the bookkeeper can confirm
                  the right party is selected before saving. */}
              <VendorInfoCard vendor={vendors.find(c => c.id === vendorId)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {kind === 'credit_note' ? 'Credit Note No.'
                  : kind === 'debit_note' ? 'Debit Note No.'
                  : 'Bill No.'}
              </Label>
              <Input
                value={billNo}
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
            {/* Currency picker only appears when the tenant has more
                than one enabled currency — a single-currency tenant has
                nothing to choose, so the field is hidden and `currency`
                stays pinned to the primary. Gated on `currencySettings`
                being loaded to avoid a brief USD/KHR flash from the
                enabledCurrencies fallback while the fetch is in flight. */}
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
                selected currency. Same-currency conversion (KHR bill
                with secondary=KHR) has no meaning, so hide the field
                entirely to keep the form focused. */}
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
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs font-semibold shrink-0">Line items</Label>
              <Button size="sm" variant="outline" onClick={addItem} className="shrink-0 text-blue-600 hover:text-blue-700">
                <Plus className="h-3 w-3 mr-1" /> Add line
              </Button>
            </div>
            {/* Column widths mirror Invoice — Total gets col-span-2 for
                 4-digit thousands; Specification gives up one slot. */}
            <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 px-1">
              <div className="col-span-3">Item</div>
              <div className="col-span-2">Specification</div>
              <div className="col-span-1">UOM</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {items.map((it, idx) => {
              const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 flex items-center gap-1">
                    {/* Stock-catalog picker — gated by the per-tenant
                        Items → Settings toggle (enabledForBill). Free-
                        text Item input always works. */}
                    {pickerEnabled && (
                      <StockItemPicker
                        catalog={stockCatalog}
                        loaded={catalogLoaded}
                        onOpen={ensureCatalog}
                        selectedId={it.stockItemId ?? ''}
                        // v-picker-stock-scope — bills are INCOMING
                        // purchases; the line increments stock on save
                        // (deductionEnabled rows), so we don't require
                        // existing on-hand. Any active item is a valid
                        // "we bought X of these" line.
                        requireStock={false}
                        onPick={si => updateItem(idx, {
                          stockItemId: si.id,
                          name: si.name,
                          unit: si.unit ?? it.unit ?? '',
                          unitPrice: String(si.unitPrice ?? 0),
                        })}
                      />
                    )}
                    <Input
                      className="h-8 text-sm flex-1"
                      value={it.name}
                      onChange={e => updateItem(idx, {
                        name: e.target.value,
                        // Hand-editing the name unlinks it from the
                        // catalog row — keeps stock decrement consistent.
                        stockItemId: null,
                      })}
                      placeholder="Item or service name"
                    />
                    {/* Per-row barcode scan icon after Item name —
                        matches Invoice / Quotation / Voucher. */}
                    {barcodeFeatureOn && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="shrink-0 h-8 w-8"
                        onClick={() => setScanTargetIdx(idx)}
                        title="Scan barcode into this row"
                        aria-label="Scan barcode into this row"
                      >
                        <ScanBarcode className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Input
                    className="col-span-2 h-8 text-sm"
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
                    className="col-span-1 h-8 text-sm text-right tabular-nums"
                    inputMode="decimal"
                    value={it.quantity}
                    onChange={e => updateItem(idx, { quantity: maskDecimal(e.target.value) })}
                  />
                  <Input
                    className="col-span-2 h-8 text-sm text-right tabular-nums"
                    inputMode="decimal"
                    value={it.unitPrice}
                    onChange={e => updateItem(idx, { unitPrice: maskDecimal(e.target.value, 4) })}
                  />
                  <div className="col-span-2 text-right text-sm tabular-nums px-2">
                    {lineTotal.toFixed(2)}
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="col-span-1 text-red-600"
                    onClick={() => removeItem(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Tax controls — pick a Taxation pattern from the
              cross-system reference; server applies subtotal × rate.
              Commercial / CN-DN-against-commercial → just VAT 0% +
              Exclusive VAT. Tax / CN-DN-against-tax → all five. */}
          {/* Tax + Discount row gated by tenant Accountant Settings —
              flip the matching toggle off in the Settings popup and
              the cell vanishes here. */}
          {(settings.showTax || settings.showDiscount) && (
          <div className="grid grid-cols-3 gap-3">
            {settings.showTax && (
            <div className="space-y-1.5">
              <Label className="text-xs">Taxation</Label>
              <Select
                value={taxType || '_none'}
                onValueChange={v => setTaxType(v === '_none' ? '' : v as billsApi.BillTaxType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {TAX_TYPES_FOR_KIND(
                    kind,
                    parentPrefill
                      ? (bills.find(i => i.id === parentPrefill)?.kind)
                      : (editing?.parentBillId
                          ? bills.find(i => i.id === editing.parentBillId)?.kind
                          : undefined),
                  )
                    // Tenant-enabled set from the Settings popup acts
                    // as a second filter. Keep the existing value
                    // visible during edit even if it's since been
                    // disabled — preserves the row without forcing
                    // a re-pick on every open.
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
              <Label className="text-xs block text-right">
                Tax {taxType && TAX_TYPE_BY_KEY[taxType] && (
                  <span className="text-[10px] text-gray-400">@ {TAX_TYPE_BY_KEY[taxType].rate}%</span>
                )}
              </Label>
              <Input
                inputMode="decimal"
                value={taxType
                  ? (subtotal * (TAX_TYPE_BY_KEY[taxType]?.rate ?? 0) / 100).toFixed(2)
                  : taxAmount}
                onChange={e => setTaxAmount(maskDecimal(e.target.value))}
                disabled={!!taxType}
                title={taxType ? 'Auto-computed from the taxation type' : ''}
                className="tabular-nums text-right"
              />
            </div>
            )}
            {settings.showDiscount && (
            <div className="space-y-1.5">
              {/* Label mirrors the input+toggle row so its right edge
                  ends at the input's right edge. */}
              <div className="flex items-center gap-2">
                <Label className="text-xs flex-1 text-right block">
                  Discount {discountType === 'percent' && (
                    <span className="text-[10px] text-gray-400">→ {fmtMoney(computedDiscount, currency)}</span>
                  )}
                </Label>
                <div className="shrink-0 inline-flex invisible" aria-hidden="true">
                  <span className="px-3 py-1.5 text-sm">$</span>
                  <span className="px-3 py-1.5 text-sm border-l">%</span>
                </div>
              </div>
              {/* Input + segmented type toggle with a small gap between
                  so the digits don't press against the $/% chip. */}
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={discountValue}
                  onChange={e => setDiscountValue(maskDecimal(e.target.value))}
                  className="flex-1 tabular-nums text-right"
                />
                <div className="inline-flex border rounded-md overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setDiscountType('amount')}
                    className={`px-3 py-1.5 text-sm ${discountType === 'amount'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Flat money-off"
                  >$</button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-3 py-1.5 text-sm border-l ${discountType === 'percent'
                      ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    title="Percentage of subtotal"
                  >%</button>
                </div>
              </div>
            </div>
            )}
          </div>
          )}

          {/* Notes / Terms 2-col + summary. Either or both can be
              hidden via the Accountant Settings popup. When only one
              is on we drop to single-column so the visible textarea
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
                    the exchange-rate input above: hidden when the
                    tenant has no secondary configured, or when the
                    bill's currency IS the secondary (nothing to
                    convert into). */}
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

          {/* Chain approvers — manual-assign chain (V172, Phase 3b).
              Only shown on create AND when Show Approval is on in
              Bill Settings (V175). */}
          {!isEdit && settings.showApproval && (
            <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-3 bg-gray-50/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Approvers (optional, ordered — up to {settings.approverCount ?? 3})</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Approvers help"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      Leave blank to skip approval. Otherwise the bill waits until each picked approver acts, in order.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {(approver1 || approver2 || approver3) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-gray-500"
                    onClick={() => { setApprover1(''); setApprover2(''); setApprover3(''); }}
                    type="button"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {[
                { label: '1st', value: approver1, set: setApprover1 },
                { label: '2nd', value: approver2, set: setApprover2 },
                { label: '3rd', value: approver3, set: setApprover3 },
              ].slice(0, settings.approverCount ?? 3).map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-6 shrink-0">{slot.label}</span>
                  <div className="flex-1">
                    <SearchablePicker
                      value={slot.value}
                      onChange={slot.set}
                      placeholder="— none —"
                      emptyLabel="— none —"
                      searchPlaceholder="Search users by email or role…"
                      options={users
                        .filter(u => u.isActive)
                        .filter(u => u.id !== approver1 || slot.value === approver1)
                        .filter(u => u.id !== approver2 || slot.value === approver2)
                        .filter(u => u.id !== approver3 || slot.value === approver3)
                        .map(u => ({
                          value: u.id,
                          label: u.email,
                          secondary: u.role,
                          searchKey: `${u.email} ${u.role}`,
                        }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {/* Save & add new and Save & close both save as Draft on
              the Bill side — Bills are recorded as drafts during data
              entry and promoted to Progress / Paid explicitly once
              the spend is confirmed. Only on create; edit shows a
              single Save changes button instead. */}
          {!isEdit && (
            <>
              <Button variant="outline" onClick={submitAndNew} disabled={saving} title="Save as Draft and reset the form for the next entry">
                {saving ? 'Saving…' : 'Save & add new'}
              </Button>
              <Button variant="outline" onClick={submitAndClose} disabled={saving} title="Save as Draft and close the dialog">
                {saving ? 'Saving…' : 'Save & close'}
              </Button>
            </>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
      {/* Per-row barcode scanner — mounted once at the form level. */}
      <CameraBarcodeScanner
        open={scanTargetIdx !== null}
        onOpenChange={o => { if (!o) setScanTargetIdx(null); }}
        onDecoded={code => {
          const target = scanTargetIdx;
          setScanTargetIdx(null);
          if (target !== null) void fillItemFromBarcode(target, code);
        }}
      />
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail dialog — read-only view + actions + payments                        */
/* -------------------------------------------------------------------------- */
function BillDetailDialog({
  billId, vendors, canEdit, settings, onClose, onChanged, onEdit,
}: {
  billId: string;
  vendors: vendorsApi.Vendor[];
  canEdit: boolean;
  /** Tenant Accountant settings — same flags that drive the create
   *  form gate the View Details popup too, so a section that's
   *  hidden on the form (e.g. Discount off) also disappears here. */
  settings: accountingSettingsApi.AccountingSettings;
  onClose: () => void;
  onChanged: () => void;
  /** Called when the user clicks Edit. The parent should close this
   *  dialog and open the form dialog in edit-mode with the invoice. */
  onEdit: (inv: billsApi.Bill) => void;
}) {
  const { formatDate } = useDateFormat();
  const [invoice, setInvoice] = useState<billsApi.Bill | null>(null);
  const [parentInvoice, setParentInvoice] = useState<billsApi.Bill | null>(null);
  // Tenant-wide currency settings — drives the secondary-total row's
  // visibility + label. The bill stores only its own currency +
  // exchange rate; the secondary code (KHR / KRW / …) comes from
  // the current tenant setting.
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  // Payments augmented with the source document they were recorded
  // against — so the unified table on a root invoice can show
  // payments + DN receipts + CN refunds in one chronological view.
  type LedgerPayment = billPaymentsApi.Payment & {
    documentNo: string;
    documentKind: billsApi.BillKind;
  };
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const vendor = invoice ? vendors.find(c => c.id === invoice.vendorId) : undefined;

  // USD-equivalent AP — collapses USD + (KHR ÷ rate) payments against
  // Total USD (= bill.total + ΣDN − ΣCN). Used by the big top-right
  // callout AND the Record-payment gate so the operator can keep
  // adding payments while AP is non-zero, even if the server's
  // currency-blind status flipped to "paid".
  const apUsd: number = (() => {
    if (!invoice) return 0;
    const nonVoidAdj = (invoice.adjustments ?? []).filter(a => a.status !== 'void');
    const sumDn = nonVoidAdj.filter(a => a.kind === 'debit_note').reduce((s, a) => s + a.total, 0);
    const sumCn = nonVoidAdj.filter(a => a.kind === 'credit_note').reduce((s, a) => s + a.total, 0);
    const sumByCurrency = (cur: 'USD' | 'KHR') => payments
      .filter(p => p.currency === cur)
      .reduce((s, p) => s + (p.direction === 'debit' ? p.amount : -p.amount), 0);
    const paidUsd = sumByCurrency('USD');
    const paidKhr = sumByCurrency('KHR');
    const rate = invoice.exchangeRate || 0;
    const paidTotalUsd = paidUsd + (rate > 0 ? paidKhr / rate : 0);
    return invoice.total + sumDn - sumCn - paidTotalUsd;
  })();

  const load = async () => {
    setLoading(true);
    try {
      const inv = await billsApi.get(billId);
      setInvoice(inv);
      // Build the list of documents that contribute payments to this
      // dialog: the invoice itself + each non-void adjustment if this
      // is a root invoice. For an adjustment view (CN/DN) we just
      // fetch its own payments.
      const sources: { id: string; billNo: string; kind: billsApi.BillKind }[] = [
        { id: inv.id, billNo: inv.billNo, kind: inv.kind },
      ];
      if (!inv.parentBillId) {
        for (const a of inv.adjustments ?? []) {
          if (a.status !== 'void') {
            sources.push({ id: a.id, billNo: a.billNo, kind: a.kind });
          }
        }
      }
      const payArrays = await Promise.all(
        sources.map(s =>
          // 4xx is normal when the user has no payment:view; swallow rather
          // than tossing a toast for the read-only audit panel.
          billPaymentsApi.listForBill(s.id).catch(() => [] as billPaymentsApi.Payment[]),
        ),
      );
      const combined: LedgerPayment[] = [];
      payArrays.forEach((arr, idx) => {
        const src = sources[idx];
        for (const p of arr) {
          combined.push({ ...p, documentNo: src.billNo, documentKind: src.kind });
        }
      });
      // Sort chronological so the table reads like a ledger.
      combined.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
      setPayments(combined);
      // If this is an adjustment, follow the parent edge so the
      // "Adjusts bill" row can show the human-readable number
      // instead of a raw UUID. Soft-fail — a deleted parent
      // (theoretically impossible since we block delete with kids)
      // shouldn't crash the read.
      if (inv.parentBillId) {
        billsApi.get(inv.parentBillId)
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

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [billId]);

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1260px] w-[90vw] max-h-[90vh] overflow-y-auto">
        {/* Header always renders so Radix' DialogTitle / Description
            requirements are met even during the brief load. Actions
            depend on the loaded bill and are only shown once it's in. */}
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="tabular-nums">{invoice?.billNo ?? 'Bill details'}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {loading || !invoice ? (
                  <span className="text-xs text-gray-500">Loading bill…</span>
                ) : (
                  <>
                    <Badge variant="outline" className={KIND_BADGE_CLASS[invoice.kind]}>
                      {KIND_LABEL[invoice.kind]}
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[invoice.status]}`}>
                      {STATUS_LABEL[invoice.status] ?? invoice.status}
                    </Badge>
                    <span className="text-xs text-gray-500">{formatDate(invoice.issueDate)}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {/* mr-8 reserves room for the dialog's built-in close (X)
                button at top:1rem right:1rem — without the inset the
                Void button sat directly under it. print:hidden drops
                the whole action row from the Print output. */}
            {invoice && (
              <div className="flex gap-1.5 mr-8 print:hidden">
                <Button size="sm" variant="outline" onClick={() => { void printWithKhmerFonts(); }} title="Print invoice">
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
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
                    onClick={() => doAction('Bill issued',
                      () => billsApi.issue(invoice.id).then(setInvoice))}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" /> Issue
                  </Button>
                )}
                {canEdit && invoice.status !== 'void' && invoice.status !== 'draft' && (
                  <Button size="sm" variant="outline" disabled={busy}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => doAction('Bill voided',
                      () => billsApi.voidBill(invoice.id).then(setInvoice))}
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
            {/* Two-column header row: meta info on the left, big AP
                callout on the right (sits under the action buttons).
                Sign-coloured — red = we still owe the vendor, amber
                = vendor refund pending, emerald = balanced. */}
            <div className="flex items-start justify-between gap-6">
              <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-sm flex-1 min-w-0">
              <div className="text-gray-500">Vendor</div>
              <div>{vendor?.name ?? <span className="text-gray-400">(unknown)</span>}</div>
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
              {invoice.parentBillId && (
                <>
                  <div className="text-gray-500">Adjusts bill</div>
                  <div className="tabular-nums text-sm">
                    {parentInvoice
                      ? parentInvoice.billNo
                      : <span className="text-gray-400 text-xs italic">loading…</span>}
                  </div>
                </>
              )}
              </div>
              {/* AP callout — top-right corner under the action buttons.
                  mr-8 reserves the same gutter the action-button row
                  uses so the right edge lines up with the buttons and
                  stays clear of the dialog's built-in X close.
                  Sign-coloured: red = we still owe vendor, amber =
                  vendor refund pending, emerald = balanced. */}
              <div className="text-right shrink-0 mr-8 print:hidden">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">AP ({invoice.currency})</div>
                <div className={`text-3xl font-bold mt-1 tabular-nums ${
                  apUsd > 0 ? 'text-rose-700'
                    : apUsd < 0 ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}>
                  {fmtMoney(apUsd, invoice.currency)}
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

            {/* Notes stays fixed-left; right column carries T&C (when
                on) + the summary. Notes-on → 2-col even if T&C is off,
                so the summary shifts into T&C's slot instead of
                stacking under Notes. Mirrors Invoices.tsx. */}
            <div className={`grid gap-3 ${
              settings.showNotes ? 'grid-cols-2' : 'grid-cols-1'
            }`}>
              {settings.showNotes && (
              <div className="bg-slate-50 rounded-md p-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                {invoice.notes ? (
                  <LinkifiedText text={invoice.notes} className="whitespace-pre-wrap block" />
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
                  // Per-currency Paid totals — each payment row stays in
                  // the currency the cashier captured. Debit direction
                  // (root bill / DN) = money out; credit-side here =
                  // refund coming back from the vendor. KHR payments
                  // fold into the USD-side AP via the bill's snapshot
                  // exchange rate so the chain collapses to one number
                  // even when payments came in on both rails (matches
                  // the AR formula on the Invoice popup).
                  const sumByCurrency = (cur: 'USD' | 'KHR') => payments
                    .filter(p => p.currency === cur)
                    .reduce((s, p) => s + (p.direction === 'debit' ? p.amount : -p.amount), 0);
                  const paidUsd = sumByCurrency('USD');
                  const paidKhr = sumByCurrency('KHR');
                  const rate = invoice.exchangeRate || 0;
                  // Total USD-equivalent paid — KHR converted at the
                  // bill's snapshot rate so AP reads correctly when
                  // a USD bill was paid (partly) in KHR.
                  const paidTotalUsd = paidUsd + (rate > 0 ? paidKhr / rate : 0);
                  const totalUsd = invoice.total + sumDn - sumCn;
                  const totalKhr = totalUsd * rate;
                  // Two views of the same chain-collapsed AP: USD-side
                  // and the KHR-equivalent (apUsd × rate). They always
                  // agree on whether the chain is settled (== 0).
                  const apUsd = totalUsd - paidTotalUsd;
                  const apKhr = apUsd * rate;
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
                              AP (USD)
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Payable in USD — Total USD − Paid (USD).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className={`tabular-nums w-32 text-right ${apUsd > 0 ? 'text-red-700' : ''}`}>{fmtMoney(apUsd, 'USD')}</span>
                    </div>
                    <div className="flex justify-end gap-6 font-semibold">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 cursor-help">
                              AP (KHR)
                              <Info className="h-3 w-3 text-gray-400" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Accounts Payable in KHR — same chain-collapsed AP as the USD row, expressed in riel at the bill's snapshot rate. Both views agree on whether the chain is settled.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className={`tabular-nums w-32 text-right ${apKhr > 0 ? 'text-red-700' : ''}`}>{fmtMoney(apKhr, 'KHR')}</span>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Adjustments panel — Credit / Debit Notes attached to
                this bill. Shown only on root bills (CN/DN
                themselves have no children). Void rows render with a
                muted strikethrough so the audit trail stays visible
                without inflating the net-balance math. */}
            {!invoice.parentBillId && (invoice.adjustments ?? []).length > 0 && (
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
                          <TableCell className={`tabular-nums text-sm ${isVoid ? 'line-through' : ''}`}>{a.billNo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={KIND_BADGE_CLASS[a.kind]}>
                              {KIND_LABEL[a.kind]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{formatDate(a.issueDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${STATUS_BADGE_CLASS[a.status]}`}>
                              {STATUS_LABEL[a.status] ?? a.status}
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
                {/* Returned = settled purchase CN (vendor already
                    refunded us). Locks the Record payment button the
                    same way Paid does so the operator can't double-
                    book the return. */}
                {canEdit && invoice.status !== 'draft' && invoice.status !== 'void' && invoice.status !== 'paid' && invoice.status !== 'returned' && (
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
                      // Labels mirror the SALE side but flipped for
                      // bills since the money flow is reversed:
                      //   Bill root / DN  → we pay vendor (outflow)
                      //   Bill CN         → vendor refunds us (inflow)
                      // Default direction for a bill root/DN is debit;
                      // for a CN it's credit. The chip color reads
                      // off "outflow" so red = we paid out, green =
                      // money came back.
                      const isCnSrc = p.documentKind === 'credit_note';
                      const isDnSrc = p.documentKind === 'debit_note';
                      const isCredit = p.direction === 'credit';
                      // For bills: cash IN happens on CN refunds or on
                      // a credit-direction payment against an INV/DN
                      // (rare — usually that's an over-payment refund).
                      const isInflow = isCnSrc || ((!isDnSrc) && isCredit);
                      const isOutflow = !isInflow;
                      const typeLabel = isCnSrc ? 'Received'
                        : isDnSrc ? 'Paid'
                        : (isCredit ? '+ Credit' : '− Debit');
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
                        {/* Currency badge + single Amount cell. Row keeps
                         *  the captured currency; Amount renders in that
                         *  currency. Sign / color match the outflow logic
                         *  above (red = we paid vendor). */}
                        <TableCell>
                          <Badge variant="outline" className="tabular-nums text-[10px]">{p.currency}</Badge>
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
                                () => billPaymentsApi.remove(p.id))}
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
              <AttachmentsPanel docType="bill" docId={invoice.id}
                                readOnly={invoice.status === 'void' || !canEdit} />
            </div>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}

        {payDialogOpen && invoice && (
          <RecordBillPaymentDialog
            invoice={invoice}
            onClose={() => setPayDialogOpen(false)}
            onSaved={async () => {
              setPayDialogOpen(false);
              await load();
              onChanged();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Record-payment dialog                                                      */
/* -------------------------------------------------------------------------- */
function RecordBillPaymentDialog({
  invoice, onClose, onSaved,
}: {
  invoice: billsApi.Bill;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Outstanding uses the ledger's net balance when available; falls
  // back to the simple total - paid otherwise. For a purchase Credit
  // Note the chain net is negative (vendor refund pending), and the
  // natural default amount to record is the absolute value of that
  // imbalance. Regular Bill / Tax / DN rows keep the positive-only
  // semantic. Direction toggle picks Debit / Credit explicitly.
  const net = invoice.netBalance ?? (invoice.total - invoice.paidAmount);
  const isCn = invoice.kind === 'credit_note';
  const outstanding = isCn ? Math.abs(net) : Math.max(0, net);
  // Default direction depends on what's being settled:
  //   Credit Note  → debit  (we refund the customer)
  //   Debit Note   → credit (customer pays extra)
  //   Bill      → credit (customer pays)
  // HR can still flip it via the toggle for unusual cases.
  // Bill payment defaults flip vs invoice — root bill/DN view means
  // we pay the vendor (debit, money out); CN view means vendor
  // refunds us (credit, money in). HR can flip via the toggle for
  // edge cases (e.g. an over-payment we made + a partial refund).
  const [direction, setDirection] = useState<billPaymentsApi.PaymentDirection>(
    invoice.kind === 'credit_note' ? 'credit' : 'debit'
  );
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  // Tenant currency settings drive which payment-currency buttons
  // render — a single-currency tenant sees no picker at all. Payment
  // options intersect tenant-enabled with what the backend accepts
  // (USD | KHR only for now).
  const [currencySettings, setCurrencySettings] = useState<currencyApi.CurrencySettings | null>(null);
  useEffect(() => {
    currencyApi.get().then(setCurrencySettings).catch(() => setCurrencySettings(null));
  }, []);
  const payCurrencyOptions = currencySettings
    ? currencyApi.enabledCurrencies(currencySettings).filter(c => c === 'USD' || c === 'KHR')
    : [];
  const [currency, setCurrency] = useState<billPaymentsApi.PaymentCurrency>(
    invoice.currency === 'KHR' ? 'KHR' : 'USD',
  );
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Default to Bank transfer — vendor payments typically go by wire
  // rather than cash, matching the Invoice-side default.
  const [method, setMethod] = useState<billPaymentsApi.PaymentMethod>('bank');
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
      await billPaymentsApi.create({
        billId: invoice.id,
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
            Against {invoice.billNo} — outstanding {fmtMoney(outstanding, invoice.currency)}.
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
              {/* KHR has no sub-units → step 1; USD keeps cents step 0.01. */}
              <Input
                type="number"
                min={currency === 'KHR' ? '1' : '0.01'}
                step={currency === 'KHR' ? '1' : '0.01'}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            {/* Payment currency buttons — one per enabled currency in
                tenant Settings (intersected with USD/KHR backend
                support). Hidden entirely when the tenant has one
                enabled currency (no choice to make). */}
            {payCurrencyOptions.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <div className={`grid gap-1 ${payCurrencyOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {payCurrencyOptions.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c as billPaymentsApi.PaymentCurrency)}
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
              <Select value={method} onValueChange={v => setMethod(v as billPaymentsApi.PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="khqr">KHQR</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
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
