import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Plus, Pencil, Trash2, Loader2, X, ImageIcon, Search,
  ChevronDown, ChevronRight, Home, Eye, ArrowRight,
} from 'lucide-react';
import * as itemsApi from '../../api/paymentPlanItems';
import * as bookingsApi from '../../api/bookings';
import * as bookingSchedulesApi from '../../api/bookingSchedules';
import * as bookingTripsApi from '../../api/bookingTrips';
import * as customersApi from '../../api/customers';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { MultiImageDropZone } from '../common/MultiImageDropZone';
import { SeatMapDisplay, parseSeatLayout } from '../common/SeatMap';
import { SearchablePicker } from '../common/SearchablePicker';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DateInput } from '../common/DateInput';
import { format as fmtDate, parseISO } from 'date-fns';

/**
 * Property catalogue (V287). Formerly the "Items" pane inside the
 * Payment Plans settings dialog; promoted to a first-class page
 * under Receivables so operators can curate the catalogue without
 * being on the Plans screen, and so the permission surface can be
 * gated independently (see V287 role_permissions seed).
 *
 * <p>Data model unchanged — same `payment_plan_items` table + child
 * `payment_plan_item_options` rows (V286). The New-Plan / Invoice
 * item picker still reads from this endpoint. Only the module key
 * (property) and the sidebar location moved.</p>
 */
export function Property() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canWrite  = canCreate('property') || canUpdate('property');
  const canRemove = canDelete('property');
  // v-page-title-i18n — header follows the sidebar leaf label.
  const { t } = useI18n();

  const [rows, setRows] = useState<itemsApi.PaymentPlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  // v-property-filter-strip — search + category filter, matching the
  // filter-strip pattern used on Plans / Bookings / Collections so
  // all four Receivables leaves share one responsive header row.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | itemsApi.PaymentPlanItemCategory>('all');
  const [editing, setEditing] = useState<itemsApi.PaymentPlanItem | null>(null);
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [price, setPrice]       = useState('');
  const [active, setActive]     = useState(true);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [category, setCategory] = useState<itemsApi.PaymentPlanItemCategory>('others');
  const [selectMode, setSelectMode] = useState<itemsApi.PaymentPlanItemSelectMode>('single');
  const [options, setOptions] = useState<itemsApi.UpsertPaymentPlanItemOption[]>([]);
  const [saving, setSaving]     = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  /** v-property-bulk-options — quick "generate N options at $X"
   *  input row inside the options editor. Prefix defaults to
   *  "Seat"; starting number auto-follows the highest existing
   *  number with the same prefix (so a second run appends). */
  const [bulkCount, setBulkCount]   = useState('12');
  const [bulkPrice, setBulkPrice]   = useState('');
  const [bulkPrefix, setBulkPrefix] = useState('Seat');
  /** v-property-view-popup — read-only detail popup shown on the
   *  eye-icon row action. Holds the row currently being previewed
   *  (null = closed). */
  const [viewingRow, setViewingRow] = useState<itemsApi.PaymentPlanItem | null>(null);
  /** V286 — per-row expand state for the Options preview. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const resetForm = () => {
    setEditing(null); setName(''); setDesc(''); setPrice(''); setActive(true);
    setImageUrls([]);
    setCategory('others');
    setSelectMode('single');
    setOptions([]);
  };
  const openCreate = () => { resetForm(); setFormOpen(true); };
  const openEdit = (r: itemsApi.PaymentPlanItem) => { startEdit(r); setFormOpen(true); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await itemsApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load properties');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** V286 inline row PATCH — used by the Category cell so the operator
   *  can reclassify without opening Edit. Passes the row's current
   *  name + planType because the BE UpsertRequest marks both
   *  @NotBlank on validation. */
  const patchRow = async (
    r: itemsApi.PaymentPlanItem,
    partial: Partial<itemsApi.UpsertPaymentPlanItem>,
  ) => {
    const previous = rows;
    setRows(list => list.map(x => x.id === r.id ? {
      ...x,
      ...(partial.category !== undefined ? { category: partial.category } : {}),
      ...(partial.selectMode !== undefined ? { selectMode: partial.selectMode } : {}),
      ...(partial.active !== undefined ? { active: partial.active } : {}),
    } : x));
    try {
      const updated = await itemsApi.update(r.id, {
        name: r.name,
        planType: r.planType,
        ...partial,
      });
      setRows(list => list.map(x => x.id === updated.id ? updated : x));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      setRows(previous);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    // v-property-price-vs-options — parent Price is required only
    // when the property has no options. When options exist, each
    // option carries its own price and the parent Price becomes
    // optional (a default for legacy fallbacks; the picker sums
    // ticked options for Total instead).
    const nonBlankOptionCount = options.filter(o => (o.name ?? '').trim()).length;
    const trimmedPrice = price.trim();
    const numericPrice = trimmedPrice === '' ? null : Number(trimmedPrice);
    if (nonBlankOptionCount === 0) {
      // Leaf property (no options): Price required, same as before.
      if (numericPrice === null || !(numericPrice >= 0)) {
        toast.error('Price is required');
        return;
      }
    } else if (numericPrice !== null && !(numericPrice >= 0)) {
      // Options present + parent Price provided: still must be a
      // valid non-negative number if given.
      toast.error('Price must be zero or higher');
      return;
    }
    setSaving(true);
    try {
      // Options: strip blanks, dedupe by lower-case name, stamp
      // sortOrder from array position so the BE preserves the
      // operator's ordering. Each option MUST carry a non-negative
      // price — that's what the picker sums into Total Amount.
      const seenOpt = new Set<string>();
      const cleanedOptions: itemsApi.UpsertPaymentPlanItemOption[] = [];
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const n = (o.name ?? '').trim();
        if (!n) continue;
        const key = n.toLowerCase();
        if (seenOpt.has(key)) {
          toast.error(`Duplicate option name: ${n}`);
          setSaving(false);
          return;
        }
        seenOpt.add(key);
        const optPrice = o.price;
        if (optPrice == null || !(Number(optPrice) >= 0)) {
          toast.error(`Price is required on option "${n}"`);
          setSaving(false);
          return;
        }
        cleanedOptions.push({
          ...(o.id ? { id: o.id } : {}),
          name: n,
          description: o.description?.trim() || null,
          price: Number(optPrice),
          imageUrl: o.imageUrl || null,
          active: o.active ?? true,
          sortOrder: i,
        });
      }

      const req: itemsApi.UpsertPaymentPlanItem = {
        name: name.trim(),
        // planType stays on the row (V259 NOT NULL check) but is no
        // longer surfaced anywhere — the catalogue is cross-plan.
        // Preserve existing on edit; stamp 'custom' on create so the
        // CHECK constraint stays happy.
        planType: editing?.planType ?? 'custom',
        description: description.trim() || null,
        price: numericPrice,
        imageUrl: imageUrls[0] ?? '',
        category,
        selectMode,
        options: cleanedOptions,
        active,
      };
      if (editing) {
        await itemsApi.update(editing.id, req);
        toast.success('Property updated');
      } else {
        await itemsApi.create(req);
        toast.success('Property added');
      }
      resetForm();
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const startEdit = (r: itemsApi.PaymentPlanItem) => {
    setEditing(r);
    setName(r.name);
    setDesc(r.description ?? '');
    setPrice(r.price == null ? '' : String(r.price));
    setActive(r.active);
    setImageUrls(r.imageUrl ? [r.imageUrl] : []);
    setCategory(r.category ?? 'others');
    setSelectMode(r.selectMode ?? 'single');
    setOptions((r.options ?? []).map(o => ({
      id: o.id,
      name: o.name,
      description: o.description ?? null,
      price: o.price ?? null,
      imageUrl: o.imageUrl ?? null,
      active: o.active,
      sortOrder: o.sortOrder,
    })));
  };

  const handleDelete = async (r: itemsApi.PaymentPlanItem) => {
    if (!confirm(`Delete "${r.name}"? Plans already written against it stay unchanged.`)) return;
    try {
      await itemsApi.remove(r.id);
      toast.success('Property deleted');
      if (editing?.id === r.id) resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (categoryFilter !== 'all' && (r.category ?? 'others') !== categoryFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q)
          || (r.description?.toLowerCase().includes(q) ?? false);
    });
  }, [rows, search, categoryFilter]);

  // v-receivables-pagination-consistency — 15 rows/page matches Plans.
  // Paginate at the parent-row level; expanded option rows follow their
  // parent so an operator sees the whole property + its options on one
  // page, not split across pages.
  const pagination = usePagination(filteredRows, 15);
  useEffect(() => { pagination.resetPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* v-receivables-header-consistency — aligned with Plans + Collections
          (page-header-strip + text-3xl h1 + icon inside h1). */}
      <div className="page-header-strip">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <Home className="h-7 w-7 text-indigo-600" />
            {t('nav.receivables.property')}
          </h1>
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add property
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-property-filter-strip — single horizontal scrollable row
              (search + category), matching the filter-strip on Plans /
              Bookings / Collections. Children are auto-shrink-0 via the
              utility class. */}
          <div className="filter-strip">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search name, description"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as typeof categoryFilter)}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* v-receivables-table-consistency — bare Table matches
              Plans + Collections. */}
          <Table>
            <TableHeader>
              <TableRow>
                  <TableHead className="w-14">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Category</TableHead>
                  <TableHead className="w-40">Options</TableHead>
                  <TableHead className="w-28 text-right">Price</TableHead>
                  <TableHead className="w-24 text-center">Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-6">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-8">
                      {rows.length === 0
                        ? <>No properties yet. Click <b>+ Add property</b> above to get started.</>
                        : 'No properties match the current filter.'}
                    </TableCell>
                  </TableRow>
                ) : pagination.paginatedItems.flatMap(r => {
                  const isExpanded = expanded.has(r.id);
                  const optCount = r.options?.length ?? 0;
                  const rowsForR: JSX.Element[] = [];
                  rowsForR.push(
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="h-9 w-9 rounded-md border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                          {r.imageUrl ? (
                            <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-gray-300" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium" title={r.description ?? ''}>
                        <div>{r.name}</div>
                        {r.description && (
                          <div className="text-[11px] text-gray-500 font-normal truncate max-w-xs" title={r.description}>
                            {r.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {canWrite ? (
                          <Select
                            value={r.category ?? 'others'}
                            onValueChange={v => patchRow(r, { category: v as itemsApi.PaymentPlanItemCategory })}
                          >
                            <SelectTrigger className="h-7 text-xs w-full min-w-[110px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.map(c => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-gray-700 capitalize">
                            {itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.find(c => c.value === r.category)?.label
                              ?? r.category ?? 'Others'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {optCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.id)}
                            className="inline-flex items-center gap-1 hover:text-blue-600"
                            title={r.options.map(o => o.name).join(', ')}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                            {optCount} · {r.selectMode === 'multi' ? 'Multi' : 'Single'}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.price == null ? <span className="text-gray-400">—</span> : `$${Number(r.price).toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.active
                          ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          : <Badge variant="outline" className="text-gray-500">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {/* v-property-view-icon-conditional — only
                              show the View eye when the row has at
                              least one option. Options are the only
                              thing the popup adds over the row
                              itself; hiding the icon on plain rows
                              saves the operator a wasted click. */}
                          {optCount > 0 && (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setViewingRow(r)} title="View options">
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                          )}
                          {canWrite && (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(r)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDelete(r)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                  if (isExpanded && optCount > 0) {
                    rowsForR.push(
                      <TableRow key={`${r.id}-opts`} className="bg-gray-50/60">
                        <TableCell colSpan={7} className="py-2">
                          <div className="pl-14 space-y-1">
                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                              Options ({r.selectMode === 'multi' ? 'multi-select' : 'single-select'})
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                              {r.options.map(o => (
                                <div key={o.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 bg-white rounded border">
                                  <span className={o.active ? '' : 'text-gray-400 line-through'}>{o.name}</span>
                                  <span className="tabular-nums text-gray-700">
                                    {o.price == null ? '—' : `$${Number(o.price).toFixed(2)}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return rowsForR;
                })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>

      {/* Add / Edit dialog — same shape as the old Payment-Plan
       *  settings dialog Items pane. Cancel just closes, Save fires
       *  the upsert and reloads the list. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit property' : 'Add property'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Room A · House B2 · Car · Motorbike"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as itemsApi.PaymentPlanItemCategory)}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* v-property-price-vs-options — asterisk drops when the
                property has at least one named option; each option
                carries its own required price and the parent Price
                becomes an optional fallback. Hint text updates in
                lock-step so the operator knows which side is
                driving Total. */}
            {(() => {
              const optCount = options.filter(o => (o.name ?? '').trim()).length;
              const parentPriceRequired = optCount === 0;
              return (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Price {parentPriceRequired && <span className="text-red-500">*</span>}
                    <span className="text-gray-400 font-normal ml-1">
                      {parentPriceRequired
                        ? '(auto-fills Total Amount)'
                        : '(optional — each option below carries its own price)'}
                    </span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="text-right tabular-nums"
                  />
                </div>
              );
            })()}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Optional — a short note the operator will see in the picker."
                maxLength={2000}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Image</Label>
              <MultiImageDropZone
                value={imageUrls}
                onChange={setImageUrls}
                max={1}
                disabled={saving}
                hint="Optional cover photo — Room, House, Car, etc."
              />
            </div>
            <div className="sm:col-span-2 rounded-md border p-3 space-y-2 bg-gray-50/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Options
                  <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                    (e.g. rooms of a house)
                  </span>
                </Label>
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <Switch
                    checked={selectMode === 'multi'}
                    onCheckedChange={v => setSelectMode(v ? 'multi' : 'single')}
                    disabled={saving}
                  />
                  Allow multi-select
                </label>
              </div>
              {/* v-property-bulk-options — one-shot generator. Pick a
                  count + a price + a prefix, hit Generate and it
                  appends N new option rows named `<prefix>-<3-digit-N>`.
                  Starting number follows the highest existing suffix
                  that shares the prefix, so re-runs append instead of
                  colliding. Disabled when count/price aren't sane. */}
              <div className="flex items-end gap-2 flex-wrap rounded-md border border-dashed border-gray-300 bg-white p-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Count</span>
                  <Input
                    type="number" min="1" max="500"
                    value={bulkCount}
                    onChange={e => setBulkCount(e.target.value)}
                    className="h-8 w-16 text-sm text-right tabular-nums"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Price each</span>
                  <Input
                    type="number" step="0.01" min="0"
                    value={bulkPrice}
                    onChange={e => setBulkPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-24 text-sm text-right tabular-nums"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Prefix</span>
                  <Input
                    value={bulkPrefix}
                    onChange={e => setBulkPrefix(e.target.value)}
                    placeholder="Seat"
                    maxLength={40}
                    className="h-8 text-sm"
                    disabled={saving}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={
                    saving
                    || !bulkPrefix.trim()
                    || !(Number(bulkCount) >= 1)
                    || bulkPrice === ''
                    || !(Number(bulkPrice) >= 0)
                  }
                  onClick={() => {
                    const count = Math.floor(Number(bulkCount) || 0);
                    if (count < 1) { toast.error('Count must be at least 1'); return; }
                    if (count > 500) { toast.error('Cap is 500 options at a time'); return; }
                    const priceNum = Number(bulkPrice);
                    if (!(priceNum >= 0)) { toast.error('Enter a valid price'); return; }
                    const prefix = bulkPrefix.trim();
                    if (!prefix) { toast.error('Prefix is required'); return; }
                    // Highest existing "<prefix>-###" suffix so the
                    // generator picks up where the operator left off.
                    // Case-insensitive prefix match matches how the
                    // seat parser normalises names later.
                    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const re = new RegExp(`^${escape(prefix)}[\\s\\-_.]*(\\d+)$`, 'i');
                    let startNum = 1;
                    for (const o of options) {
                      const m = re.exec((o.name ?? '').trim());
                      if (m) startNum = Math.max(startNum, Number(m[1]) + 1);
                    }
                    setOptions(list => {
                      const next = [...list];
                      for (let i = 0; i < count; i++) {
                        const n = startNum + i;
                        next.push({
                          name: `${prefix}-${String(n).padStart(3, '0')}`,
                          price: priceNum,
                          description: null,
                          active: true,
                          sortOrder: next.length,
                        });
                      }
                      return next;
                    });
                    toast.success(`Added ${count} option${count === 1 ? '' : 's'}`);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Generate
                </Button>
              </div>
              {options.length === 0 ? (
                <div className="text-[11px] text-gray-500 italic px-1 py-2">
                  No options yet — add rooms, trims, or variants below, or use the bulk generator above. Leave empty for a plain single-line property.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {options.map((o, idx) => {
                    // v-property-price-vs-options — a named option
                    // MUST carry a non-negative price on save. Ring
                    // the input red when Name is filled but Price
                    // is blank / negative so the operator sees the
                    // missing field before hitting Save.
                    const named = (o.name ?? '').trim().length > 0;
                    const priceMissing = named && (o.price == null || !(Number(o.price) >= 0));
                    return (
                      <div key={o.id ?? `new-${idx}`} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <Input
                          value={o.name}
                          onChange={e => setOptions(list => list.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                          placeholder="Name — e.g. Room 101"
                          maxLength={160}
                          className="h-8 text-sm flex-1 min-w-0"
                          disabled={saving}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={o.price == null ? '' : String(o.price)}
                          onChange={e => setOptions(list => list.map((x, i) => i === idx ? {
                            ...x,
                            price: e.target.value === '' ? null : Number(e.target.value),
                          } : x))}
                          placeholder="Price *"
                          className={`h-8 text-sm w-24 text-right tabular-nums ${
                            priceMissing ? 'border-red-400 focus-visible:ring-red-400' : ''
                          }`}
                          disabled={saving}
                          title={priceMissing ? 'Price is required on this option' : undefined}
                        />
                        <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0">
                          <Switch
                            checked={o.active ?? true}
                            onCheckedChange={v => setOptions(list => list.map((x, i) => i === idx ? { ...x, active: v } : x))}
                            disabled={saving}
                          />
                          Active
                        </label>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 shrink-0"
                          onClick={() => setOptions(list => list.filter((_, i) => i !== idx))}
                          disabled={saving}
                          title="Remove option"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setOptions(list => [...list, {
                  name: '',
                  price: null,
                  description: null,
                  active: true,
                  sortOrder: list.length,
                }])}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add option
              </Button>
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
              <Switch checked={active} onCheckedChange={setActive} />
              Active
            </label>
          </div>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => { setFormOpen(false); resetForm(); }} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              {editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v-property-view-popup — read-only detail dialog opened from
       *  the eye-icon on each row. Renders the parent's cover +
       *  category + description, then the full options list as
       *  cards showing name, description, and price. No edit
       *  affordances — the operator uses the Edit button for that.
       *  Kept mounted only while `viewingRow` is set so the DOM
       *  stays lean between opens. */}
      {viewingRow && (
        <ViewPropertyDialog
          row={viewingRow}
          onClose={() => setViewingRow(null)}
          canEdit={canWrite}
          onEdit={() => { const r = viewingRow; setViewingRow(null); openEdit(r); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* View dialog. For seat-mapped properties this is a POS-style booking        */
/* surface: seat map on the left (interactive), booking summary card on the   */
/* right (image, route/date/schedule, selected seats, total, Continue to      */
/* Payment). Non-seat properties keep the compact flat-card view.             */
/* -------------------------------------------------------------------------- */
function ViewPropertyDialog({
  row, onClose, canEdit, onEdit,
}: {
  row: itemsApi.PaymentPlanItem;
  onClose: () => void;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const options = row.options ?? [];
  const activeCount = options.filter(o => o.active).length;
  const catLabel = itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.find(c => c.value === row.category)?.label
    ?? row.category ?? 'Others';
  const seatLayout = parseSeatLayout(options);

  /** v-property-view-book — interactive seat selection state.
   *  When the property is seat-mapped, the popup acts as a
   *  POS-style booking surface: seats click into a "cart" shown
   *  on the right, Continue to Payment posts the booking. When
   *  not seat-mapped, none of this state matters (flat cards
   *  render read-only). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bookingDate, setBookingDate] = useState(fmtDate(new Date(), 'yyyy-MM-dd'));
  const [scheduleId, setScheduleId] = useState('');
  const [tripId, setTripId] = useState('');
  const [schedules, setSchedules] = useState<bookingSchedulesApi.BookingSchedule[]>([]);
  const [trips, setTrips] = useState<bookingTripsApi.BookingTrip[]>([]);
  const [occupiedIds, setOccupiedIds] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seatLayout) return;
    let cancelled = false;
    // Three parallel fetches on open — schedules for parent lookup
    // (each trip belongs to a schedule of this property), trips
    // for the picker, and customers for the compact checkout flow.
    bookingSchedulesApi.list(row.id)
      .then(ss => { if (!cancelled) setSchedules(ss.filter(s => s.active)); })
      .catch(() => { if (!cancelled) setSchedules([]); });
    bookingTripsApi.list()
      .then(ts => { if (!cancelled) setTrips(ts); })
      .catch(() => { if (!cancelled) setTrips([]); });
    // v-customers-kind-separation — Booking quick-checkout picker
    // must show real customers only (not patients / students).
    customersApi.list({ kind: 'customer', size: 1000 })
      .then(res => { if (!cancelled) setCustomers(res.content ?? []); })
      .catch(() => { if (!cancelled) setCustomers([]); });
    return () => { cancelled = true; };
  }, [seatLayout, row.id]);

  // Trips filtered to this property (via their schedule's itemId)
  // and, when the operator sets a specific Date, that day only.
  // Falls back to all trips on the property when Date is empty.
  const scheduleIds = useMemo(() => new Set(schedules.map(s => s.id)), [schedules]);
  const tripsForProperty = useMemo(
    () => trips.filter(t => t.active && scheduleIds.has(t.scheduleId) &&
      (!bookingDate || t.tripDate === bookingDate)),
    [trips, scheduleIds, bookingDate],
  );

  // Keep tripId in sync with the current property + date filter.
  // If the picked trip no longer belongs to this property (edge
  // case; property never changes here) or falls outside the picked
  // date, clear the selection so occupancy stops scoping to a
  // stale trip.
  useEffect(() => {
    if (tripId && !tripsForProperty.some(t => t.id === tripId)) setTripId('');
  }, [tripId, tripsForProperty]);

  useEffect(() => {
    if (!seatLayout) { setOccupiedIds(new Set()); return; }
    let cancelled = false;
    // Trip scope wins over schedule scope — finest inventory. Fall
    // back to schedule-scoped when only a schedule is picked (no
    // trip yet), else property-wide.
    const opts = tripId ? { tripId } : (scheduleId ? { scheduleId } : undefined);
    bookingsApi.occupiedOptions(row.id, opts)
      .then(res => { if (!cancelled) setOccupiedIds(new Set(res.occupiedOptionIds ?? [])); })
      .catch(() => { if (!cancelled) setOccupiedIds(new Set()); });
    return () => { cancelled = true; };
  }, [seatLayout, row.id, scheduleId, tripId]);

  const pickedOptions = useMemo(
    () => options.filter(o => selectedIds.has(o.id)),
    [options, selectedIds],
  );
  const total = pickedOptions.reduce((s, o) => s + (Number(o.price) || 0), 0);

  const toggleSeat = (opt: itemsApi.PaymentPlanItemOption) => {
    if (occupiedIds.has(opt.id)) return;
    const next = new Set(selectedIds);
    if (row.selectMode === 'single') {
      next.clear();
      if (!selectedIds.has(opt.id)) next.add(opt.id);
    } else if (next.has(opt.id)) {
      next.delete(opt.id);
    } else {
      next.add(opt.id);
    }
    setSelectedIds(next);
  };

  const submitBooking = async () => {
    if (!customerId) { toast.error('Pick a customer'); return; }
    if (pickedOptions.length === 0) { toast.error('Pick at least one seat'); return; }
    setSaving(true);
    // Prepend seat names to Notes so the booking record surfaces
    // them wherever notes render — same convention the Booking
    // Create dialog uses via v-plan-options-picker.
    const notes = `Seats: ${pickedOptions.map(o => o.name).join(', ')}`;
    try {
      await bookingsApi.create({
        customerId,
        itemId: row.id,
        scheduleId: scheduleId || null,
        // v-property-view-trip — Trip is the primary attach point.
        // Occupancy scopes to this Trip (finer than schedule).
        tripId: tripId || null,
        selectedOptionIds: Array.from(selectedIds),
        amount: total,
        // If a trip is picked, prefer its date so the booking's
        // bookingDate lines up with the trip; falls back to the
        // date input otherwise.
        bookingDate: tripId
          ? (trips.find(t => t.id === tripId)?.tripDate ?? bookingDate)
          : bookingDate,
        notes,
      });
      toast.success('Booking created');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  // Property description often carries the route ("Downtown → Airport"),
  // plate number, driver name — show it under the property name in the
  // right-side card as the informational subtitle.

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={`${seatLayout ? 'max-w-6xl sm:max-w-6xl' : 'max-w-2xl sm:max-w-2xl'} w-[97vw] max-h-[92vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-md border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
              {row.imageUrl ? (
                <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate">{row.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] text-gray-700 capitalize">{catLabel}</Badge>
                {row.active
                  ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700">Active</Badge>
                  : <Badge variant="outline" className="text-[10px] text-gray-500">Inactive</Badge>}
                {row.price != null && (
                  <span className="text-[11px] text-gray-500 tabular-nums">Price ${Number(row.price).toFixed(2)}</span>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {row.description && !seatLayout && (
          <div className="text-xs text-gray-600 whitespace-pre-wrap border-l-2 border-gray-200 pl-3 mt-1">
            {row.description}
          </div>
        )}

        <div className="mt-2 space-y-2">
          {options.length === 0 ? (
            <div className="text-[11px] text-gray-500 italic py-4 text-center border rounded">
              No options — this property is a plain single-line item.
            </div>
          ) : seatLayout ? (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
              {/* Left — legend + seat map. Cart-style label above so
                  the operator sees "N active · N occupied" at a glance. */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Seat Layout
                  <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                    ({activeCount} active · {row.selectMode === 'multi' ? 'multi-select' : 'single-select'}{occupiedIds.size > 0 ? ` · ${occupiedIds.size} occupied` : ''})
                  </span>
                </div>
                <SeatMapDisplay
                  layout={seatLayout}
                  selectedIds={selectedIds}
                  occupiedIds={occupiedIds}
                  onToggle={toggleSeat}
                />
              </div>

              {/* Right — booking summary card matching the mockup:
                  property image + name + description (as route),
                  date, schedule (departure time), selected seats,
                  total, Continue to Payment. */}
              <div className="space-y-3">
                <div className="rounded-xl border bg-white p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{row.name}</div>
                      {(() => {
                        // v-property-desc-strip — drop the legacy
                        // "- Schedule - 7:00 AM Departure" suffix
                        // now that Schedule is its own entity.
                        const cleaned = (row.description ?? '')
                          .replace(/\s*[-–—]\s*Schedule\s*[-–—].*$/i, '')
                          .trim();
                        return cleaned ? (
                          <div className="text-[11px] text-gray-500 line-clamp-2" title={row.description ?? ''}>
                            {cleaned}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <div className="border-t pt-2 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 min-w-[64px]">Date</Label>
                      <div className="flex-1"><DateInput value={bookingDate} onChange={setBookingDate} /></div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 min-w-[64px]">Session</Label>
                      <div className="flex-1">
                        {/* v-property-view-trip — Booking should attach
                            to a Trip (the concrete date-instance),
                            not the recurring Schedule. Trip picker
                            filters by the Date field above; empty
                            date shows every trip on this property. */}
                        <Select value={tripId || 'none'} onValueChange={v => {
                          const next = v === 'none' ? '' : v;
                          setTripId(next);
                          // Snap Schedule to the session's parent so the
                          // occupancy fallback (when Session is cleared)
                          // still scopes correctly.
                          if (next) {
                            const t = trips.find(x => x.id === next);
                            if (t) setScheduleId(t.scheduleId);
                          }
                        }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Any session —" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Any session —</SelectItem>
                            {tripsForProperty.length === 0 && (
                              <div className="text-[11px] text-gray-500 italic px-2 py-1.5">
                                No sessions on this property{bookingDate ? ` for ${bookingDate}` : ''} — add one via the Booking page ⚙.
                              </div>
                            )}
                            {tripsForProperty.map(t => (
                              // Label kept short (date · time) so the
                              // SelectTrigger's single-line render doesn't
                              // spill past the right edge. Schedule name
                              // already shown in the property card header
                              // above.
                              <SelectItem key={t.id} value={t.id}>
                                {t.tripDate} · {t.departureTime.slice(0, 5)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <div className="text-[10px] font-semibold tracking-wide uppercase text-gray-500 mb-2">Selected Seats</div>
                  {pickedOptions.length === 0 ? (
                    <div className="text-xs italic text-gray-400 py-2 text-center">No seats selected yet</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {pickedOptions.map(o => (
                        <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium tabular-nums">
                          {o.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-500">Total Amount</span>
                    <span className="tabular-nums font-semibold text-2xl text-indigo-700">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                  {!checkoutOpen ? (
                    <Button
                      className="w-full mt-3 h-11 bg-indigo-600 hover:bg-indigo-700"
                      disabled={pickedOptions.length === 0}
                      onClick={() => setCheckoutOpen(true)}
                    >
                      Continue to Payment
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  ) : (
                    <div className="space-y-2 mt-3 border-t pt-3">
                      <Label className="text-[10px] font-semibold tracking-wide uppercase text-gray-500">Customer</Label>
                      <SearchablePicker
                        value={customerId}
                        onChange={setCustomerId}
                        options={customers.map(c => ({
                          value: c.id,
                          label: c.name,
                          secondary: c.phone ?? undefined,
                        }))}
                        placeholder="Pick a customer"
                        searchPlaceholder="Search customers…"
                        allowClear={false}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setCheckoutOpen(false)} disabled={saving}>Back</Button>
                        <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={submitBooking} disabled={saving || !customerId}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                          Confirm
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.map(o => (
                <div
                  key={o.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                    o.active ? 'bg-white' : 'bg-gray-50 opacity-70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-sm ${o.active ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                      {o.name}
                    </div>
                    {o.description && (
                      <div className="text-[11px] text-gray-500 truncate" title={o.description}>
                        {o.description}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular-nums font-medium text-gray-800">
                      {o.price == null ? '—' : `$${Number(o.price).toFixed(2)}`}
                    </div>
                    {!o.active && (
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">Inactive</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="mt-3">
          {canEdit && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
