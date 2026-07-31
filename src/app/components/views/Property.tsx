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
  ChevronDown, ChevronRight, Home, Eye,
} from 'lucide-react';
import * as itemsApi from '../../api/paymentPlanItems';
// v-property-view-as-editor — booking + customer / schedule / trip
// imports removed. This popup no longer creates bookings; that flow
// lives in the Booking page's New Booking dialog.
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { MultiImageDropZone } from '../common/MultiImageDropZone';
import { CinemaSeatMapEditor } from '../common/CinemaSeatMapEditor';
import { AccommodationLayoutEditor } from '../common/AccommodationLayoutEditor';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';

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
  /** v-property-groups-only — options are always children of a
   *  group post-V298; this stays null-ish in the editor state
   *  because the top-level ungrouped bucket is retired from the UI.
   *  Kept so `handleSave` can send `options: []` (clears any legacy
   *  ungrouped rows on save) without a special-case. */
  const [options, setOptions] = useState<itemsApi.UpsertPaymentPlanItemOption[]>([]);
  /** V298 — group layer holding every option. Each group has a name
   *  + its own nested options + its own bulk generator inside the
   *  GroupEditor sub-component. */
  const [optionGroups, setOptionGroups] = useState<itemsApi.UpsertPaymentPlanItemOptionGroup[]>([]);
  const [saving, setSaving]     = useState(false);
  const [formOpen, setFormOpen] = useState(false);
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
    // v-property-groups-only — seed one empty group so the operator
    // has somewhere to add options immediately (matches the Items
    // page's modifier-groups pattern).
    setOptionGroups([{ name: '', description: null, active: true, sortOrder: 0, options: [] }]);
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
    // ticked options for Total instead). V298: also count options
    // nested inside groups so a group-only property doesn't demand
    // a parent Price either.
    const nonBlankOptionCount =
        options.filter(o => (o.name ?? '').trim()).length
        + optionGroups.reduce((sum, g) => sum + (g.options ?? []).filter(o => (o.name ?? '').trim()).length, 0);
    const trimmedPrice = price.trim();
    // v-property-price-vs-options — when options exist the Price
    // field is hidden entirely; force-null so a stale earlier
    // value in the input state can't leak into the payload.
    const numericPrice = nonBlankOptionCount > 0
      ? null
      : (trimmedPrice === '' ? null : Number(trimmedPrice));
    if (nonBlankOptionCount === 0) {
      // Leaf property (no options): Price required, same as before.
      if (numericPrice === null || !(numericPrice >= 0)) {
        toast.error('Price is required');
        return;
      }
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

      // V298 — groups: clean each group + its nested options.
      // Same rules as ungrouped options: strip blanks, dedupe by
      // lower-case name PER group, require price on named options.
      const seenGroupName = new Set<string>();
      const cleanedGroups: itemsApi.UpsertPaymentPlanItemOptionGroup[] = [];
      for (let gi = 0; gi < optionGroups.length; gi++) {
        const g = optionGroups[gi];
        const gname = (g.name ?? '').trim();
        if (!gname) {
          // v-property-groups-only — silent skip if the whole group
          // is empty (an operator-added row they didn't fill in).
          // But if named options exist under a nameless group,
          // surface the error so the operator doesn't lose data.
          const hasNamedChildren = (g.options ?? []).some(o => (o.name ?? '').trim().length > 0);
          if (hasNamedChildren) {
            toast.error('A group has options but no name — enter a group name or remove it.');
            setSaving(false);
            return;
          }
          continue;
        }
        const gkey = gname.toLowerCase();
        if (seenGroupName.has(gkey)) {
          toast.error(`Duplicate group name: ${gname}`);
          setSaving(false);
          return;
        }
        seenGroupName.add(gkey);
        const seenInGroup = new Set<string>();
        const groupOpts: itemsApi.UpsertPaymentPlanItemOption[] = [];
        for (let i = 0; i < (g.options ?? []).length; i++) {
          const o = g.options![i];
          const n = (o.name ?? '').trim();
          if (!n) continue;
          const key = n.toLowerCase();
          if (seenInGroup.has(key)) {
            toast.error(`Duplicate option name in group "${gname}": ${n}`);
            setSaving(false);
            return;
          }
          seenInGroup.add(key);
          const optPrice = o.price;
          if (optPrice == null || !(Number(optPrice) >= 0)) {
            toast.error(`Price is required on option "${n}" in group "${gname}"`);
            setSaving(false);
            return;
          }
          groupOpts.push({
            ...(o.id ? { id: o.id } : {}),
            name: n,
            description: o.description?.trim() || null,
            price: Number(optPrice),
            imageUrl: o.imageUrl || null,
            active: o.active ?? true,
            sortOrder: i,
          });
        }
        cleanedGroups.push({
          ...(g.id ? { id: g.id } : {}),
          name: gname,
          description: g.description?.trim() || null,
          active: g.active ?? true,
          sortOrder: gi,
          options: groupOpts,
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
        // v-property-edit-groups-only — groups + options are edited
        // here (tabular). Cinema screen positions (gridRow/gridCol)
        // live on the options themselves so they round-trip whether
        // they were set in Manage Layout or here.
        options: cleanedOptions,
        optionGroups: cleanedGroups,
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
    // v-property-groups-only — ungrouped options are no longer edited
    // as a standalone panel. On save we'll send `options: []` to
    // clear any legacy rows; here we migrate legacy ungrouped
    // options into a first group named "Options" so the operator
    // keeps them (they can rename the group afterwards).
    setOptions([]);
    const mapOpt = (o: itemsApi.PaymentPlanItemOption) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? null,
      price: o.price ?? null,
      imageUrl: o.imageUrl ?? null,
      active: o.active,
      sortOrder: o.sortOrder,
    });
    const groups: itemsApi.UpsertPaymentPlanItemOptionGroup[] = [];
    if ((r.options ?? []).length > 0) {
      // Legacy ungrouped bucket → auto-migrate into a first group.
      // No id so the BE inserts a new group row on next save; the
      // ungrouped rows still carry their ids and stay attached to
      // the same property (their `groupId` gets set by the BE
      // upsert pass).
      groups.push({
        name: 'Options',
        description: null,
        active: true,
        sortOrder: 0,
        options: (r.options ?? []).map(mapOpt),
      });
    }
    for (const g of r.optionGroups ?? []) {
      groups.push({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        active: g.active,
        sortOrder: g.sortOrder,
        options: (g.options ?? []).map(mapOpt),
      });
    }
    // If a fresh row has neither ungrouped options nor groups yet,
    // seed an empty group so the editor isn't blank.
    setOptionGroups(groups.length > 0 ? groups
      : [{ name: '', description: null, active: true, sortOrder: 0, options: [] }]);
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
                  // v-property-list-options-count — count options
                  // across BOTH the ungrouped bucket (legacy rows)
                  // AND every group. Group-only properties (Cinema
                  // in the screenshot) were showing "—" before this
                  // because r.options is empty when everything sits
                  // under groups.
                  const ungroupedCount = r.options?.length ?? 0;
                  const groupCount = r.optionGroups?.length ?? 0;
                  const groupedCount = (r.optionGroups ?? [])
                    .reduce((s, g) => s + (g.options?.length ?? 0), 0);
                  const optCount = ungroupedCount + groupedCount;
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
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.id)}
                              className="inline-flex items-center gap-1 hover:text-blue-600"
                              title={[
                                ...(r.options ?? []).map(o => o.name),
                                ...(r.optionGroups ?? []).flatMap(g =>
                                  (g.options ?? []).map(o => `${g.name}/${o.name}`)),
                              ].join(', ')}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                              {/* v-property-list-options-count — show
                                  "Ng · Mo · Multi" when the property
                                  has groups; falls back to the flat
                                  "N · Multi" for legacy ungrouped
                                  rows. Group count sits first because
                                  it's the operator's mental container. */}
                              {groupCount > 0
                                ? `${groupCount}g · ${optCount}o · ${r.selectMode === 'multi' ? 'Multi' : 'Single'}`
                                : `${optCount} · ${r.selectMode === 'multi' ? 'Multi' : 'Single'}`}
                            </button>
                            {/* v-property-view-icon-in-options — the View eye
                                lives next to the Options text so operators
                                see it right where the options are described,
                                not lumped in with the Edit / Delete
                                housekeeping in the Actions column. */}
                            <button
                              type="button"
                              onClick={() => setViewingRow(r)}
                              className="text-blue-600 hover:text-blue-800"
                              title="View options"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
                          {/* View eye moved to the Options column
                              (v-property-view-icon-in-options) — Actions
                              now only carries the write ops. */}
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
                          <div className="pl-14 space-y-2">
                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                              Options ({r.selectMode === 'multi' ? 'multi-select' : 'single-select'})
                            </div>
                            {/* v-property-list-expand — ungrouped
                                bucket first (legacy compat), then
                                each group as its own titled section.
                                Group name renders as a small caption
                                so the shape mirrors ViewPropertyDialog. */}
                            {(r.options ?? []).length > 0 && (
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
                            )}
                            {(r.optionGroups ?? []).map(g => (
                              <div key={g.id} className="space-y-1">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                                  {g.name}
                                  <span className="ml-1 text-gray-400 normal-case tracking-normal">
                                    ({(g.options ?? []).length})
                                  </span>
                                </div>
                                {(g.options ?? []).length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                    {g.options.map(o => (
                                      <div key={o.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 bg-white rounded border">
                                        <span className={o.active ? '' : 'text-gray-400 line-through'}>{o.name}</span>
                                        <span className="tabular-nums text-gray-700">
                                          {o.price == null ? '—' : `$${Number(o.price).toFixed(2)}`}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
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
            {/* v-property-price-vs-options — Price field only shows
                when the property has NO named options anywhere
                (ungrouped or in any group). Once an option exists,
                each option carries its own required price and the
                parent Price becomes meaningless, so the field hides
                entirely. See handleSave — numericPrice is force-null
                when options exist regardless of the input's stale
                state. */}
            {(() => {
              const optCount = options.filter(o => (o.name ?? '').trim()).length
                + optionGroups.reduce((sum, g) => sum + (g.options ?? []).filter(o => (o.name ?? '').trim()).length, 0);
              if (optCount > 0) return null;
              return (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Price <span className="text-red-500">*</span>
                    <span className="text-gray-400 font-normal ml-1">
                      (auto-fills Total Amount)
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
            {/* v-property-edit-groups-only — groups + options edited
                here (tabular). The Cinema screen canvas lives only
                on the Manage Layout popup, not this dialog. */}
            <div className="sm:col-span-2 rounded-md border p-3 space-y-3 bg-gray-50/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Options
                  <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                    (organised into one or more groups
                    {category === 'entertainment' ? ' — Cinema screen layout is edited in Manage Layout' : ''})
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <Switch
                      checked={selectMode === 'multi'}
                      onCheckedChange={v => setSelectMode(v ? 'multi' : 'single')}
                      disabled={saving}
                    />
                    Allow multi-select
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setOptionGroups(list => [...list, {
                      name: '',
                      description: null,
                      active: true,
                      sortOrder: list.length,
                      options: [],
                    }])}
                    disabled={saving}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add group
                  </Button>
                </div>
              </div>
              {optionGroups.length === 0 ? (
                <div className="text-[11px] text-gray-500 italic px-1 py-3">
                  No groups yet — click <b>+ Add group</b> to start. Each group houses its own options (rooms, trims, seats).
                </div>
              ) : (
                <div className="space-y-3">
                  {optionGroups.map((g, gIdx) => (
                    <GroupEditor
                      key={g.id ?? `newg-${gIdx}`}
                      group={g}
                      category={category}
                      otherOccupiedCells={new Set(
                        optionGroups.flatMap((og, ogi) => ogi === gIdx ? [] :
                          (og.options ?? []).flatMap(o =>
                            (o.gridRow != null && o.gridCol != null) ? [`${o.gridRow},${o.gridCol}`] : []))
                      )}
                      disabled={saving}
                      onChange={next => setOptionGroups(list => list.map((x, i) => i === gIdx ? next : x))}
                      onRemove={() => setOptionGroups(list => list.filter((_, i) => i !== gIdx))}
                    />
                  ))}
                </div>
              )}
              {/* Cinema-specific hint pointing operators to Manage
                  Layout when they want to arrange seats visually. */}
              {category === 'entertainment' && (
                <div className="text-[11px] text-gray-500 border-t border-gray-200 pt-2">
                  Screen layout (seat positions on the cinema canvas) is edited in the <b>Manage Layout</b> popup — click the <span className="text-blue-600">👁</span> icon on this row after saving.
                </div>
              )}
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
          onSaved={updated => {
            setRows(list => list.map(x => x.id === updated.id ? updated : x));
            setViewingRow(updated);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* View dialog. v-property-view-as-editor — repurposed from a quasi-booking    */
/* surface (Date/Session/Seat cart/Continue to Payment) to a focused group +   */
/* seat-layout editor. Bookings are made in the dedicated Booking dialog       */
/* (New Booking on Bookings page) — this popup just manages groups + option    */
/* placement so operators can tweak the layout without opening full Edit.      */
/* -------------------------------------------------------------------------- */
function ViewPropertyDialog({
  row, onClose, canEdit, onEdit, onSaved,
}: {
  row: itemsApi.PaymentPlanItem;
  onClose: () => void;
  canEdit: boolean;
  /** Opens the full Edit dialog for name / category / price / image
   *  edits that don't belong in this narrower layout editor. */
  onEdit: () => void;
  /** Fires after Save with the fresh property row so the list can
   *  refresh in place and this popup can re-hydrate from the server
   *  copy (picks up server-assigned option ids on new rows). */
  onSaved: (updated: itemsApi.PaymentPlanItem) => void;
}) {
  const catLabel = itemsApi.PAYMENT_PLAN_ITEM_CATEGORIES.find(c => c.value === row.category)?.label
    ?? row.category ?? 'Others';
  const isCinema = row.category === 'entertainment';
  // v-transport-canvas — Transportation also uses the shared seat
  // canvas (variant='transport'); the tabular group cards below are
  // suppressed for both cinema and transport in this popup.
  const isTransport = row.category === 'transportation';
  // v-accommodation-layout — Hotels/apartments render as floor-list
  // tile groups (rooms as small cards). No canvas, no grid coords —
  // just click-to-edit tiles.
  const isAccommodation = row.category === 'accommodation';
  const useCanvas = isCinema || isTransport;
  const useAccommodationLayout = isAccommodation;
  const suppressTabular = useCanvas || useAccommodationLayout;
  const canvasVariant: 'cinema' | 'transport' = isTransport ? 'transport' : 'cinema';

  // v-property-view-as-editor — local editable copy of groups.
  // Legacy ungrouped options (row.options) get migrated into a
  // first group named "Options" on open, matching startEdit in
  // the parent form so both surfaces feel identical. Save wipes
  // the ungrouped list (sending options: []) once the operator
  // confirms.
  const [editGroups, setEditGroups] = useState<itemsApi.UpsertPaymentPlanItemOptionGroup[]>(() => {
    const mapOpt = (o: itemsApi.PaymentPlanItemOption): itemsApi.UpsertPaymentPlanItemOption => ({
      id: o.id,
      name: o.name,
      description: o.description ?? null,
      price: o.price ?? null,
      imageUrl: o.imageUrl ?? null,
      active: o.active,
      sortOrder: o.sortOrder,
      gridRow: o.gridRow ?? null,
      gridCol: o.gridCol ?? null,
    });
    const out: itemsApi.UpsertPaymentPlanItemOptionGroup[] = [];
    if ((row.options ?? []).length > 0) {
      out.push({
        name: 'Options',
        description: null,
        active: true,
        sortOrder: 0,
        options: (row.options ?? []).map(mapOpt),
      });
    }
    for (const g of row.optionGroups ?? []) {
      out.push({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        active: g.active,
        sortOrder: g.sortOrder,
        options: (g.options ?? []).map(mapOpt),
      });
    }
    return out;
  });
  const [saving, setSaving] = useState(false);

  // Dirty check — Save button disables when nothing has changed to
  // avoid a spurious PATCH. Cheap deep-equality via JSON stringify;
  // the payload is small (a handful of groups × a few dozen seats
  // each at most).
  const dirty = useMemo(() => JSON.stringify(editGroups) !== JSON.stringify(row.optionGroups ?? []) || (row.options ?? []).length > 0, [editGroups, row]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Reuse the same validation the full Edit dialog uses.
      // Skips blank groups; error surfaces if a named group has
      // no name, or an option has a name but no price.
      const seenGroup = new Set<string>();
      const cleaned: itemsApi.UpsertPaymentPlanItemOptionGroup[] = [];
      for (let gi = 0; gi < editGroups.length; gi++) {
        const g = editGroups[gi];
        const gname = (g.name ?? '').trim();
        if (!gname) {
          const hasNamedChildren = (g.options ?? []).some(o => (o.name ?? '').trim().length > 0);
          if (hasNamedChildren) { toast.error('A group has options but no name.'); setSaving(false); return; }
          continue;
        }
        const key = gname.toLowerCase();
        if (seenGroup.has(key)) { toast.error(`Duplicate group name: ${gname}`); setSaving(false); return; }
        seenGroup.add(key);
        const seenOpt = new Set<string>();
        const opts: itemsApi.UpsertPaymentPlanItemOption[] = [];
        for (let oi = 0; oi < (g.options ?? []).length; oi++) {
          const o = g.options![oi];
          const n = (o.name ?? '').trim();
          if (!n) continue;
          const okey = n.toLowerCase();
          if (seenOpt.has(okey)) { toast.error(`Duplicate option in "${gname}": ${n}`); setSaving(false); return; }
          seenOpt.add(okey);
          if (o.price == null || !(Number(o.price) >= 0)) {
            toast.error(`Price is required on "${n}" in "${gname}"`); setSaving(false); return;
          }
          opts.push({
            ...(o.id ? { id: o.id } : {}),
            name: n,
            description: o.description?.trim() || null,
            price: Number(o.price),
            imageUrl: o.imageUrl || null,
            active: o.active ?? true,
            sortOrder: oi,
            gridRow: o.gridRow ?? null,
            gridCol: o.gridCol ?? null,
          });
        }
        cleaned.push({
          ...(g.id ? { id: g.id } : {}),
          name: gname,
          description: g.description?.trim() || null,
          active: g.active ?? true,
          sortOrder: gi,
          options: opts,
        });
      }
      const updated = await itemsApi.update(row.id, {
        name: row.name,
        planType: row.planType,
        // Send `options: []` to clear the legacy ungrouped bucket —
        // everything now lives inside groups.
        options: [],
        optionGroups: cleaned,
      });
      toast.success('Layout saved');
      onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  // v-property-view-as-editor — cross-group cell set for bulk
  // Generate collision-avoidance, keyed by "row,col".
  const otherOccupied = (gIdx: number): Set<string> => new Set(
    editGroups.flatMap((og, ogi) => ogi === gIdx ? [] :
      (og.options ?? []).flatMap(o =>
        o.gridRow != null && o.gridCol != null ? [`${o.gridRow},${o.gridCol}`] : [])),
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl sm:max-w-4xl w-[97vw] max-h-[92vh] overflow-y-auto">
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

        <div className="mt-3 space-y-3">
          {/* Header row for the editor pane. `+ Add group` mirrors the
              Add-property dialog so the operator recognises the shape. */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Manage Layout
              <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
                — edit groups + seat placement. Bookings live on the Booking page.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditGroups(list => [...list, {
                name: '',
                description: null,
                active: true,
                sortOrder: list.length,
                options: [],
              }])}
              disabled={saving || !canEdit}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add group
            </Button>
          </div>

          {/* v-property-view-groupstack-hidden + v-transport-canvas
              + v-accommodation-layout — cinema/transport use the
              seat canvas below, accommodation uses the tile editor
              below. Every other category (House / Land / Vehicle /
              etc.) still gets the tabular group cards here. */}
          {editGroups.length === 0 ? (
            <div className="text-[11px] text-gray-500 italic py-4 text-center border rounded">
              No groups yet — click <b>+ Add group</b> above to start.
            </div>
          ) : !suppressTabular && (
            <div className="space-y-3">
              {editGroups.map((g, gIdx) => (
                <GroupEditor
                  key={g.id ?? `viewg-${gIdx}`}
                  group={g}
                  category={row.category}
                  otherOccupiedCells={otherOccupied(gIdx)}
                  disabled={saving || !canEdit}
                  onChange={next => setEditGroups(list => list.map((x, i) => i === gIdx ? next : x))}
                  onRemove={() => setEditGroups(list => list.filter((_, i) => i !== gIdx))}
                />
              ))}
            </div>
          )}

          {/* Shared canvas — one screen for every group. Only for
              cinema (entertainment) properties + when at least one
              group exists to draw on. */}
          {useCanvas && editGroups.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                {isTransport ? 'Vehicle Layout' : 'Cinema Screen'}
                <span className="ml-1 text-gray-400 normal-case tracking-normal">
                  — one canvas for every group; drag to rearrange, click empty cells to add to the active group
                </span>
              </div>
              <CinemaSeatMapEditor
                groups={editGroups}
                onChange={setEditGroups}
                disabled={saving || !canEdit}
                variant={canvasVariant}
              />
            </div>
          )}

          {/* v-accommodation-layout — floor-list tile editor for
              accommodation properties (hotels, condos, apartments).
              Renders when at least one group exists, mirroring the
              gate the cinema/transport canvas uses above. */}
          {useAccommodationLayout && editGroups.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                Floor Layout
                <span className="ml-1 text-gray-400 normal-case tracking-normal">
                  — group rooms by floor / tier; click a tile to rename, right-click to edit price
                </span>
              </div>
              <AccommodationLayoutEditor
                groups={editGroups}
                onChange={setEditGroups}
                disabled={saving || !canEdit}
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-3">
          {canEdit && (
            <Button variant="outline" onClick={onEdit} disabled={saving}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Full edit
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save layout
            </Button>
          )}
          <Button variant={canEdit ? 'outline' : 'default'} onClick={onClose} disabled={saving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** V298 — one Group card in the Property editor. Bundles name field,
 *  active toggle, remove-group button, per-group bulk generator, and
 *  the options row-editor into a self-contained unit so the parent
 *  form only needs to render one of these per group. Local state
 *  (bulk count/price/prefix) stays local — each group has its own
 *  generator inputs. */
function GroupEditor({
  group, category, otherOccupiedCells, disabled, compact = false, onChange, onRemove,
}: {
  group: itemsApi.UpsertPaymentPlanItemOptionGroup;
  /** V299 — passed through so the editor can toggle the cinema
   *  canvas below the row-editor for entertainment properties. */
  category: itemsApi.PaymentPlanItemCategory;
  /** v-cinema-shared-canvas — "r,c" cells claimed by other groups
   *  on the shared canvas so bulk-Generate steers around them. */
  otherOccupiedCells: Set<string>;
  disabled: boolean;
  /** v-property-view-compact — when true, hide the per-option row
   *  list and the "Add option" button. Used by the Manage Layout
   *  popup where the shared canvas below is the primary way to
   *  add / edit / place individual seats. Bulk generator + group
   *  header stay visible so the operator can still add batches. */
  compact?: boolean;
  onChange: (next: itemsApi.UpsertPaymentPlanItemOptionGroup) => void;
  onRemove: () => void;
}) {
  const isCinema = category === 'entertainment';
  // v-transport-driver-cell — transport also auto-places on the
  // canvas, but must skip (0, 0) which is reserved as the DRIVER
  // chrome cell.
  const isTransport = category === 'transportation';
  const useAutoPlace = isCinema || isTransport;
  const [bulkCount, setBulkCount] = useState('12');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPrefix, setBulkPrefix] = useState('Seat');

  const setOptions = (mapper: (list: itemsApi.UpsertPaymentPlanItemOption[]) => itemsApi.UpsertPaymentPlanItemOption[]) => {
    onChange({ ...group, options: mapper(group.options ?? []) });
  };

  const generateBulk = () => {
    const count = Math.floor(Number(bulkCount) || 0);
    if (count < 1) { toast.error('Count must be at least 1'); return; }
    if (count > 500) { toast.error('Cap is 500 options at a time'); return; }
    const priceNum = Number(bulkPrice);
    if (!(priceNum >= 0)) { toast.error('Enter a valid price'); return; }
    const prefix = bulkPrefix.trim();
    if (!prefix) { toast.error('Prefix is required'); return; }
    // Highest existing "<prefix>-###" suffix so re-runs append
    // instead of colliding.
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escape(prefix)}[\\s\\-_.]*(\\d+)$`, 'i');
    let startNum = 1;
    for (const o of group.options ?? []) {
      const m = re.exec((o.name ?? '').trim());
      if (m) startNum = Math.max(startNum, Number(m[1]) + 1);
    }
    setOptions(list => {
      const next = [...list];
      // v-cinema-editor-autoplace — on cinema (entertainment)
      // properties, drop each generated seat into the next free
      // grid cell so it shows up on the canvas immediately instead
      // of piling up in the Unplaced strip. Non-cinema properties
      // keep the old behaviour (no coords — they don't use the
      // canvas). Auto-placement fills row-major, wrapping at 12
      // cols (matches the editor's default column count).
      // v-cinema-shared-canvas — also skips cells claimed by other
      // groups on the shared canvas so we don't stamp on top of a
      // sibling's placements.
      // v-transport-col-cap — transport auto-places at 5-col wrap
      // (van/bus width); cinema keeps the 12-col wrap.
      const AUTOPLACE_COLS = isTransport ? 5 : 12;
      const occupied = new Set<string>(otherOccupiedCells);
      for (const o of next) {
        if (o.gridRow != null && o.gridCol != null) occupied.add(`${o.gridRow},${o.gridCol}`);
      }
      // v-transport-driver-cell — reserve (0, 0) for transport so
      // the DRIVER chrome cell is never overwritten by auto-place.
      if (isTransport) occupied.add('0,0');
      let cursorR = 0;
      let cursorC = 0;
      const nextFreeCell = (): [number, number] | null => {
        // Scan row-major from the current cursor; walk forever
        // (unbounded rows) so a large Count still finds slots
        // even if the top rows are full.
        while (true) {
          if (!occupied.has(`${cursorR},${cursorC}`)) {
            const cell: [number, number] = [cursorR, cursorC];
            occupied.add(`${cursorR},${cursorC}`);
            // Advance one for the next call.
            cursorC++;
            if (cursorC >= AUTOPLACE_COLS) { cursorC = 0; cursorR++; }
            return cell;
          }
          cursorC++;
          if (cursorC >= AUTOPLACE_COLS) { cursorC = 0; cursorR++; }
          if (cursorR > 200) return null;  // safety — unreachable in practice
        }
      };
      for (let i = 0; i < count; i++) {
        const n = startNum + i;
        const cell = useAutoPlace ? nextFreeCell() : null;
        next.push({
          name: `${prefix}-${String(n).padStart(2, '0')}`,
          price: priceNum,
          description: null,
          active: true,
          sortOrder: next.length,
          gridRow: cell ? cell[0] : undefined,
          gridCol: cell ? cell[1] : undefined,
        });
      }
      return next;
    });
    toast.success(`Added ${count} option${count === 1 ? '' : 's'}`);
  };

  return (
    <div className="rounded-md border bg-white p-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        <Input
          value={group.name ?? ''}
          onChange={e => onChange({ ...group, name: e.target.value })}
          placeholder="Group name — e.g. Standard rooms"
          maxLength={160}
          className="h-8 text-sm font-medium flex-1 min-w-0"
          disabled={disabled}
        />
        <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0">
          <Switch
            checked={group.active ?? true}
            onCheckedChange={v => onChange({ ...group, active: v })}
            disabled={disabled}
          />
          Active
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 shrink-0"
          onClick={onRemove}
          disabled={disabled}
          title="Remove group"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </Button>
      </div>
      {/* v-property-bulk-options (per-group, V298) — same generator
          as before but scoped to this group's options list only. */}
      <div className="flex items-end gap-2 flex-wrap rounded-md border border-dashed border-gray-300 bg-gray-50/60 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Count</span>
          <Input
            type="number" min="1" max="500"
            value={bulkCount}
            onChange={e => setBulkCount(e.target.value)}
            className="h-8 w-16 text-sm text-right tabular-nums"
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={
            disabled
            || !bulkPrefix.trim()
            || !(Number(bulkCount) >= 1)
            || bulkPrice === ''
            || !(Number(bulkPrice) >= 0)
          }
          onClick={generateBulk}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Generate
        </Button>
      </div>
      {/* v-property-view-compact — option rows + Add option are
          hidden when `compact` is set (Manage Layout popup uses the
          shared canvas below instead). Bulk generator above stays
          visible so operators can still spawn batches. Full Edit
          dialog leaves compact=false so tabular editing works. */}
      {!compact && ((group.options ?? []).length === 0 ? (
        <div className="text-[11px] text-gray-500 italic px-1">
          No options in this group yet — add one below or use the bulk generator above.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {(group.options ?? []).map((o, idx) => {
            const named = (o.name ?? '').trim().length > 0;
            const priceMissing = named && (o.price == null || !(Number(o.price) >= 0));
            return (
              <div key={o.id ?? `newgo-${idx}`} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Input
                  value={o.name}
                  onChange={e => setOptions(list => list.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  placeholder="Name"
                  maxLength={160}
                  className="h-8 text-sm flex-1 min-w-0"
                  disabled={disabled}
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
                  className={`h-8 text-sm w-24 text-right tabular-nums ${priceMissing ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                  disabled={disabled}
                  title={priceMissing ? 'Price is required on this option' : undefined}
                />
                <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0">
                  <Switch
                    checked={o.active ?? true}
                    onCheckedChange={v => setOptions(list => list.map((x, i) => i === idx ? { ...x, active: v } : x))}
                    disabled={disabled}
                  />
                  Active
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => setOptions(list => list.filter((_, i) => i !== idx))}
                  disabled={disabled}
                  title="Remove option"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            );
          })}
        </div>
      ))}
      {!compact && (
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
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add option
        </Button>
      )}
      {compact && (
        <div className="text-[11px] text-gray-500 italic px-1">
          {(group.options ?? []).length} option{(group.options ?? []).length === 1 ? '' : 's'} — placement lives on the Cinema Screen canvas below.
        </div>
      )}
    </div>
  );
}

/* v-property-view-as-editor — legacy OptionCard removed. The View
 * popup no longer renders read-only option cards; the group +
 * layout editor (GroupEditor + CinemaSeatMapEditor) is the only
 * option surface. */
