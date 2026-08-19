/**
 * V-library-membership — Members list page.
 *
 * <p>Layout mirrors Vendors.tsx (the shipped reference for this
 * codebase's list-page pattern): {@code page-header-strip} header,
 * {@code filter-strip} with status chips + Search input, {@code Card}
 * body with a {@code Table}. Consistency across list pages is
 * enforced by the {@code feedback_filter_row_uxpattern} memory.</p>
 *
 * <p>Gear icon in the header opens the Membership Types settings
 * dialog — priced tiers that feed the Type dropdown in the
 * Add/Edit form.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, RefreshCw, UserSquare2, Search, Settings, RefreshCcw, Info,
  Users, CheckCircle2, AlertTriangle, IdCard, BadgeCheck,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader } from '../../ui/card';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../../ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { Switch } from '../../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
// v-library-filter-strip — same DateInput the sale-side Invoices
// page uses for the From/To range, kept identical so operators see
// one filter grammar across the app.
import { DateInput } from '../../common/DateInput';
import * as library from '../../../api/library';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useI18n } from '../../../i18n/I18nContext';
import { useDateFormat } from '../../../context/DateFormatContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { MembershipTypesDialog } from './MembershipTypesDialog';
import { SearchablePicker } from '../../common/SearchablePicker';
import { RenewMembershipDialog } from './RenewMembershipDialog';
import { MemberIdCardDialog } from './MemberIdCardDialog';
import * as settingsApi from '../../../api/settings';

type Status = 'active' | 'expired' | 'suspended';
type StatusFilter = 'all' | Status;

type Method = 'cash' | 'bank' | 'card' | 'cheque' | 'khqr' | 'other';
type Currency = 'USD' | 'KHR';

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  sex: string;
  occupation: string;
  profileImage: string;
  membershipType: string;
  registrationDate: string;
  effectiveDate: string;
  expiryDate: string;
  status: Status;
  // V-library-membership-initial-payment — capture the first
  // payment in the same dialog. Toggle default ON for a fresh
  // Add-Member flow; forced OFF on Edit (a payment for an existing
  // row is a Renewal, not an Add).
  recordPayment: boolean;
  amount: string;
  currency: Currency;
  method: Method;
}

const EMPTY_FORM: FormState = {
  name: '',
  phone: '',
  email: '',
  address: '',
  sex: '',
  occupation: '',
  profileImage: '',
  membershipType: '',
  registrationDate: new Date().toISOString().slice(0, 10),
  effectiveDate: new Date().toISOString().slice(0, 10),
  expiryDate: '',
  status: 'active',
  recordPayment: true,
  amount: '0',
  currency: 'USD',
  method: 'cash',
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'active',    label: 'Active' },
  { value: 'expired',   label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
];

export function Members() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const confirm = useConfirm();

  const [rows, setRows] = useState<library.Member[]>([]);
  const [types, setTypes] = useState<library.MembershipType[]>([]);
  const [settings, setSettings] = useState<library.LibrarySettings | null>(null);
  // V-library-member-business-picker — distinct values from the BE
  // feeding the Business picker. Locally augmented on inline-create.
  const [businesses, setBusinesses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // v-library-filter-strip — inclusive From/To range on
  // registrationDate. Empty string means "unbounded on that side"
  // (matches the Invoices filter contract).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [typesDialogOpen, setTypesDialogOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<library.Member | null>(null);
  // V-library-member-id-card — printable member card. Populated on
  // row-click of the ID icon; cleared on dialog close.
  const [idCardTarget, setIdCardTarget] = useState<library.Member | null>(null);
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  useEffect(() => {
    settingsApi.getCompanyInfo().then(setCompanyInfo).catch(() => setCompanyInfo(null));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch both in parallel — the Type dropdown needs `types` too.
      const [rs, ts, ss, bs] = await Promise.all([
        library.members.list(),
        library.membershipTypes.list().catch(() => [] as library.MembershipType[]),
        library.settings.get().catch(() => null),
        library.members.businesses().catch(() => [] as string[]),
      ]);
      setRows(rs);
      setTypes(ts);
      setSettings(ss);
      setBusinesses(bs);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const activeTypes = useMemo(() => types.filter(t => t.active), [types]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      // v-library-filter-strip — date range on registrationDate,
      // inclusive both ends; a member without a registrationDate is
      // kept only when both bounds are empty.
      if (dateFrom || dateTo) {
        const d = r.registrationDate ?? '';
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
      }
      if (!q) return true;
      return (
        (r.name ?? '').toLowerCase().includes(q)
        || (r.memberNo ?? '').toLowerCase().includes(q)
        || (r.phone ?? '').toLowerCase().includes(q)
        || (r.email ?? '').toLowerCase().includes(q)
        || (r.occupation ?? '').toLowerCase().includes(q)
        || (r.membershipType ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, search, dateFrom, dateTo]);

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (m: library.Member) => {
    setEditingId(m.id);
    setForm({
      name: m.name ?? '',
      phone: m.phone ?? '',
      email: m.email ?? '',
      address: m.address ?? '',
      sex: m.sex ?? '',
      occupation: m.occupation ?? '',
      profileImage: m.profileImage ?? '',
      membershipType: m.membershipType ?? '',
      registrationDate: m.registrationDate ?? '',
      effectiveDate: m.effectiveDate ?? '',
      expiryDate: m.expiryDate ?? '',
      status: (m.status ?? 'active') as Status,
      // Payment toggle is force-OFF on edit — renewals live on the
      // green Renew button, not on the Edit dialog.
      recordPayment: false,
      amount: '0',
      currency: 'USD',
      method: 'cash',
    });
    setDialogOpen(true);
  };

  /** Add-days helper — used when the picked type has a durationDays
   *  so Expiry auto-fills forward. Null-safe. */
  const addDays = (dateIso: string, days: number | null | undefined): string => {
    if (!dateIso || days == null) return '';
    const d = new Date(dateIso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  /** Type-picker in the Add/Edit form: mirror the Renew popup's
   *  auto-fill — pull price + currency, project expiry forward by
   *  durationDays. Only fires on the create path (edit shouldn't
   *  silently clobber saved dates). */
  const pickType = (name: string) => {
    setForm(prev => {
      const t = types.find(x => x.name === name);
      const isCreate = !editingId;
      return {
        ...prev,
        membershipType: name,
        amount:     (isCreate && t) ? String(t.price) : prev.amount,
        currency:   (isCreate && t) ? ((t.currency as Currency) ?? prev.currency) : prev.currency,
        expiryDate: (isCreate && t?.durationDays)
                      ? addDays(prev.effectiveDate || prev.registrationDate, t.durationDays)
                      : prev.expiryDate,
      };
    });
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload: library.MemberInput = {
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        sex: form.sex || undefined,
        occupation: form.occupation || undefined,
        profileImage: form.profileImage || null,
        membershipType: form.membershipType || undefined,
        registrationDate: form.registrationDate || undefined,
        effectiveDate: form.effectiveDate || undefined,
        expiryDate: form.expiryDate || undefined,
        status: form.status,
      };

      if (editingId) {
        await library.members.update(editingId, payload);
        toast.success('Member updated');
      } else {
        const created = await library.members.create(payload);
        // V-library-membership-initial-payment — optional first
        // payment ridealong. Runs as a second call so a failure
        // here doesn't roll back the freshly-created member (the
        // operator can retry via the Renew button on the row).
        const amt = Number(form.amount);
        if (form.recordPayment && amt > 0) {
          try {
            await library.members.renew(created.id, {
              membershipType: form.membershipType || undefined,
              amount: amt,
              currency: form.currency,
              method: form.method,
              paymentDate: form.registrationDate || undefined,
              effectiveDate: form.effectiveDate || undefined,
              expiryDate: form.expiryDate || undefined,
            });
            toast.success('Member added + initial payment recorded');
          } catch (e) {
            toast.warning(
              `Member added but the payment step failed — use the Renew button to retry.\n${e instanceof Error ? e.message : ''}`
            );
          }
        } else {
          toast.success('Member added');
        }
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (m: library.Member) => {
    const ok = await confirm({
      title: 'Delete member?',
      message: `${m.name} (${m.memberNo ?? '—'}) will be removed permanently.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try { await library.members.remove(m.id); toast.success('Member deleted'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  /** Type dropdown: seeded from the catalog + preserve any legacy
   *  free-text value so an edit doesn't silently blank a row that
   *  was created before the Types settings landed. */
  const typeOptions = useMemo(() => {
    const opts = activeTypes.map(t => ({ value: t.name, label: `${t.name}${t.price > 0 ? ` — ${t.currency} ${Number(t.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}` }));
    if (form.membershipType && !opts.some(o => o.value === form.membershipType)) {
      opts.unshift({ value: form.membershipType, label: `${form.membershipType} (legacy)` });
    }
    return opts;
  }, [activeTypes, form.membershipType]);

  const statusBadge = (s: Status | string) => (
    <Badge
      variant={s === 'active' ? 'default' : s === 'expired' ? 'destructive' : 'secondary'}
      className="capitalize"
    >
      {s}
    </Badge>
  );

  /** V-library-membership-reminder — a member is in the "reminder
   *  window" once (expiry_date − today) is at or below the tenant's
   *  configured {@code renewalReminderDaysBefore}. The Expiry cell
   *  renders red-bold in this window (and after) so the operator's
   *  eye lands on rows the scheduler will ping next. */
  /** V-library-member-summary-cards — headline totals for the
   *  filtered row set. Kept simple: three tiles matching Items /
   *  Employees style (icon chip + label + big number). Numbers move
   *  as the operator narrows via the filter strip so no separate
   *  server call is needed. */
  // V-library-list-pagination — client-side pagination over the
  // filtered set. 25/page matches the Vendors / Items rhythm.
  const pagination = usePagination(filtered, 25);

  const stats = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter(m => m.status === 'active').length;
    const expiringOrExpired = filtered.filter(m => {
      if (m.status === 'expired') return true;
      if (!m.expiryDate || !settings?.renewalReminderEnabled) return false;
      const exp = new Date(m.expiryDate + 'T00:00:00');
      if (Number.isNaN(exp.getTime())) return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const diff = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
      return diff <= (settings.renewalReminderDaysBefore ?? 30);
    }).length;
    return { total, active, expiringOrExpired };
  }, [filtered, settings]);

  const inReminderWindow = (expiryIso: string | null): boolean => {
    if (!expiryIso || !settings?.renewalReminderEnabled) return false;
    const exp = new Date(expiryIso + 'T00:00:00');
    if (Number.isNaN(exp.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((exp.getTime() - today.getTime()) / (24 * 3600 * 1000));
    return diffDays <= settings.renewalReminderDaysBefore;
  };

  /** Type badge — same visual family as Status. We rotate an
   *  indexed colour so different tiers are visually distinct without
   *  hard-coding "gold" / "silver" / … strings. Empty type → em-dash. */
  const TYPE_TONES = [
    'bg-amber-50 text-amber-700 border-amber-200',
    'bg-slate-100 text-slate-700 border-slate-200',
    'bg-indigo-50 text-indigo-700 border-indigo-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-rose-50 text-rose-700 border-rose-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
  ];
  const typeBadge = (t: string | null) => {
    if (!t) return <span className="text-gray-400">—</span>;
    // Stable per-name colour: hash by char code sum so "Gold" always
    // looks the same across sessions.
    const idx = Array.from(t).reduce((a, c) => a + c.charCodeAt(0), 0) % TYPE_TONES.length;
    return (
      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_TONES[idx]}`}>
        {t}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header — matches the page-header-strip pattern used by Vendors /
          Items / Customers. Right-side action cluster keeps a fixed
          order: Types (settings gear) → Refresh → New. */}
      <div className="page-header-strip">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-indigo-100 text-indigo-700 p-2"><UserSquare2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-3xl font-bold">{t('nav.libraryMembers')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canUpdate('member') && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTypesDialogOpen(true)}
              title="Manage membership types & prices"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {canCreate('member') && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" /> New Member
            </Button>
          )}
        </div>
      </div>

      {/* V-library-member-summary-cards — three headline tiles
          (Total / Active / Expiring or Expired). Same visual family
          as the Items page tiles for consistency. */}
      <div className="flex gap-3 overflow-x-auto hover-scroll-x [&>*]:shrink-0">
        <div className="flex-1 min-w-[150px] rounded-lg border bg-white p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">Total Members</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900 truncate">
              {stats.total.toLocaleString('en-US')}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-[150px] rounded-lg border bg-white p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">Active</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900 truncate">
              {stats.active.toLocaleString('en-US')}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-[150px] rounded-lg border bg-white p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase text-gray-500 tracking-wide">Expiring / Expired</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900 truncate">
              {stats.expiringOrExpired.toLocaleString('en-US')}
            </div>
          </div>
        </div>
      </div>

      {/* Card + filter-strip — same visual rhythm as the sale-side
          list pages. Chips left, Search right. */}
      <Card>
        <CardHeader className="pb-3">
          {/* v-library-filter-strip — Invoice-shape strip: status
              chips left, From/To date range on registrationDate,
              Clear ghost, Search right. One horizontal line;
              overflow scrolls (see .filter-strip in index.css). */}
          <div className="filter-strip">
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-600">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="h-8 w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label className="text-xs text-gray-600">From</Label>
              <DateInput value={dateFrom || null} onChange={v => setDateFrom(v ?? '')} max={dateTo || null} className="h-8 w-36" />
              <Label className="text-xs text-gray-600">To</Label>
              <DateInput value={dateTo   || null} onChange={v => setDateTo(v   ?? '')} min={dateFrom || null} className="h-8 w-36" />
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-500"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, business, type…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No members yet.' : 'No matches — try clearing the filter.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedItems.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.memberNo ?? '—'}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          {m.profileImage ? (
                            <img src={m.profileImage} alt=""
                                 className="h-7 w-7 rounded-full object-cover border" />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-gray-100 border flex items-center justify-center">
                              <UserSquare2 className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                          )}
                          {m.status === 'active' && (
                            // Verified check on active members — bottom-right
                            // corner of the row avatar, same visual as the
                            // ID-card badge so the two surfaces read as
                            // one system.
                            <BadgeCheck
                              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 text-indigo-600 bg-white rounded-full"
                              strokeWidth={2.5}
                              aria-label="Verified active member"
                            />
                          )}
                        </div>
                        <span>{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{m.sex ?? '—'}</TableCell>
                    <TableCell>{m.phone ?? '—'}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{m.email ?? '—'}</TableCell>
                    <TableCell>
                      {m.occupation
                        ? <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">{m.occupation}</span>
                        : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>{typeBadge(m.membershipType)}</TableCell>
                    <TableCell>{m.registrationDate ? formatDate(m.registrationDate) : '—'}</TableCell>
                    <TableCell>{m.effectiveDate ? formatDate(m.effectiveDate) : '—'}</TableCell>
                    <TableCell className={inReminderWindow(m.expiryDate) ? 'text-red-600 font-semibold' : ''}>
                      {m.expiryDate ? formatDate(m.expiryDate) : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon"
                              title="Preview / print ID card"
                              onClick={() => setIdCardTarget(m)}>
                        <IdCard className="h-4 w-4 text-indigo-600" />
                      </Button>
                      {canUpdate('member') && (
                        <Button variant="ghost" size="icon"
                                title="Renew membership"
                                onClick={() => setRenewTarget(m)}>
                          <RefreshCcw className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                      {canUpdate('member') && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete('member') && (
                        <Button variant="ghost" size="icon" onClick={() => void remove(m)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pagination.totalPages > 1 && (
            <div className="mt-4">
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
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? 'Edit Member' : 'New Member'}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"
                            className="text-gray-400 hover:text-gray-600 cursor-help"
                            aria-label="What this form does">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Base profile lives in Customers under the hood — this form writes both sides in one save.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* V-library-member-profile-image — click the avatar to
                pick a photo, or the small × below to clear it. Stored
                as a base64 data URL so the JSON PUT round-trips
                without a multipart endpoint. */}
            <div className="col-span-2 flex items-center gap-3">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2_000_000) {
                      toast.error('Image must be under 2 MB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setForm(f => ({ ...f, profileImage: String(reader.result ?? '') }));
                    reader.readAsDataURL(file);
                  }}
                />
                {form.profileImage ? (
                  <img src={form.profileImage} alt=""
                       className="h-16 w-16 rounded-lg object-cover border" />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:bg-gray-50">
                    <UserSquare2 className="h-6 w-6" />
                  </div>
                )}
              </label>
              <div className="text-xs text-gray-500 space-y-1">
                <div>Profile photo (optional, max 2 MB)</div>
                {form.profileImage && (
                  <button type="button"
                          onClick={() => setForm(f => ({ ...f, profileImage: '' }))}
                          className="text-red-600 hover:underline text-xs">
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.sex} onValueChange={v => setForm({ ...form, sex: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Business</Label>
              {/* V-library-member-business-picker — searchable +
                  inline-create, same pattern as the Term / Book /
                  Invoice Purpose pickers. New values enter the
                  dropdown for the rest of the session and become
                  canonical once the member row saves. */}
              <SearchablePicker
                value={form.occupation}
                onChange={v => setForm({ ...form, occupation: v })}
                placeholder="Pick a business — e.g. Teacher, Engineer, Retail"
                searchPlaceholder="Search or type a new business…"
                emptyResultsLabel="No match — type a new business to add."
                createLabel={q => `Add "${q}" as a new business`}
                allowClear
                onCreate={async (label) => {
                  const trimmed = label.trim();
                  setBusinesses(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                  return { value: trimmed, label: trimmed };
                }}
                options={businesses.map(b => ({ value: b, label: b }))}
              />
            </div>
            <div>
              <Label>Membership Type</Label>
              {typeOptions.length > 0 ? (
                <Select value={form.membershipType} onValueChange={pickType}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Add via Types settings ↑"
                       value={form.membershipType}
                       onChange={e => setForm({ ...form, membershipType: e.target.value })} />
              )}
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Registration Date</Label>
              <Input type="date" value={form.registrationDate}
                     onChange={e => setForm({ ...form, registrationDate: e.target.value })} />
            </div>
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate}
                     onChange={e => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate}
                     onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>

          {/* V-library-membership-initial-payment — on-create only.
              When the toggle is ON, saving also records a paid invoice
              via the same renewal endpoint the Renew button uses, so
              the new member lands with their first payment already in
              Payment History. Hidden on Edit (renewals live on the
              green ↻ button, not the Edit dialog). */}
          {!editingId && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Record initial payment</div>
                  <div className="text-xs text-gray-500">
                    Spawns an invoice + paid payment for the new member.
                  </div>
                </div>
                <Switch checked={form.recordPayment}
                        onCheckedChange={v => setForm({ ...form, recordPayment: v })} />
              </div>
              {form.recordPayment && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" min="0" value={form.amount}
                           onChange={e => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v as Currency })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="KHR">KHR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Payment Method</Label>
                    <Select value={form.method} onValueChange={v => setForm({ ...form, method: v as Method })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="khqr">KHQR</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Membership Types settings dialog. onChanged reloads the
          local types cache so the Add Member form's dropdown picks up
          new tiers immediately. */}
      <MembershipTypesDialog
        open={typesDialogOpen}
        onOpenChange={setTypesDialogOpen}
        onChanged={() => { void load(); }}
      />

      {/* Renewal popup. Fires the BE renewal endpoint which spawns
          the invoice + payment atomically; on success we reload to
          reflect the new effective/expiry dates on the row. */}
      <RenewMembershipDialog
        open={renewTarget != null}
        onOpenChange={(v) => { if (!v) setRenewTarget(null); }}
        member={renewTarget}
        onRenewed={() => { setRenewTarget(null); void load(); }}
      />

      {/* V-library-member-id-card — printable ID card. Shares the
          `printing-id-card` body class + CSS with the Employee card
          so no new print styles are needed. */}
      <MemberIdCardDialog
        member={idCardTarget}
        companyName={companyInfo?.name || undefined}
        companyLogo={companyInfo?.logoUrl || null}
        companyUrl={companyInfo?.website || undefined}
        onOpenChange={o => { if (!o) setIdCardTarget(null); }}
      />
    </div>
  );
}
