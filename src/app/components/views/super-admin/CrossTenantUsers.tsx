import { useEffect, useMemo, useState } from 'react';
import { useDateFormat } from '../../../context/DateFormatContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { Search, KeyRound, UserX, UserCheck, Shield, UsersRound, GitMerge, AlertTriangle, UserPlus, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { mockCompanies, mockPlatformUsers } from '../../../data/platformData';
import { USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { TableBodySkeletonRows } from '../../common/LoadingSkeletons';

/** Compact "time ago" formatter for the Last Login column. Ladder:
 *   • < 45 sec         → "just now"
 *   • 45s – 59 min     → "12m ago"
 *   • 1h  – 23h        → "5h ago"
 *   • ≥ 24h            → absolute date ("Jul 22, 2026")
 *
 * Older than a day drops to a bare date because "3 days ago" reads
 * fine but "27 days ago" doesn't — a calendar date is easier to skim
 * once the recency signal stops mattering. */
function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45)          return 'just now';
  const min = Math.round(diffMs / 60000);
  if (min < 60)          return `${min}m ago`;
  const hr = Math.round(diffMs / 3600000);
  if (hr < 24)           return `${hr}h ago`;
  return format(new Date(iso), 'MMM dd, yyyy');
}

export function CrossTenantUsers() {
  const { formatDate } = useDateFormat();
  const [users, setUsers] = useState<platformApi.PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  // Real tenant list for the Company filter dropdown — mock seed IDs
  // (T001, T002…) aren't valid UUIDs and crashed the backend with a
  // MethodArgumentTypeMismatchException when sent as `tenantId=T001`.
  // In live mode we fetch the real tenants and use their UUID `id`.
  const [tenantOptions, setTenantOptions] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [roleTab, setRoleTab] = useState<'all' | 'admin' | 'manager' | 'employee'>('all');
  /** V266 — presence filter. 'all' passes through; 'online' / 'offline'
   *  narrow the returned list to users whose last_seen_at falls inside
   *  or outside the server's 5-min online window. */
  const [presence, setPresence] = useState<'all' | 'online' | 'offline'>('all');
  /** Active sort — one column at a time. `null` = original server
   *  order. Click cycles: unsorted → asc → desc → unsorted. Sorting
   *  a different column resets to asc on that column. */
  type SortKey = 'name' | 'company' | 'role' | 'online' | 'lastLogin';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const cycleSort = (key: SortKey) => setSort(prev => {
    if (!prev || prev.key !== key) return { key, dir: 'asc' };
    if (prev.dir === 'asc') return { key, dir: 'desc' };
    return null;
  });
  const [resetTarget, setResetTarget] = useState<platformApi.PlatformUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<platformApi.PlatformUser | null>(null);
  // Merge dialog state — surfaces every user sharing the same email and lets
  // the admin pick one to keep; the others get hard-deleted.
  const [mergeEmail, setMergeEmail] = useState<string | null>(null);
  const [keepUserId, setKeepUserId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Add-user dialog state. When role === 'admin' the form switches to
  // creating a brand-new company (tenant) with this user as initialAdmin —
  // POST /platform/tenants. For manager/employee it adds a user under an
  // existing tenant via POST /platform/users.
  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<'admin' | 'manager' | 'employee'>('admin');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addShowPwd, setAddShowPwd] = useState(false);
  const [addCompanyName, setAddCompanyName] = useState('');
  const [addCompanySlug, setAddCompanySlug] = useState('');
  const [addTenantId, setAddTenantId] = useState<string>('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  /** v-admin-attach-existing — when role=admin, operator picks
   *  between minting a brand new company for this user ('new') and
   *  attaching them as an admin to an existing tenant ('existing').
   *  Non-admin roles ignore this and always use the existing-company
   *  dropdown. */
  const [addAdminMode, setAddAdminMode] = useState<'new' | 'existing'>('new');

  const resetAddForm = () => {
    setAddRole('admin');
    setAddEmail('');
    setAddPassword('');
    setAddShowPwd(false);
    setAddCompanyName('');
    setAddCompanySlug('');
    setAddTenantId('');
    setAddAdminMode('new');
  };

  // Auto-derive slug from name as the admin types (lowercase + dash-safe).
  const slugify = (s: string) =>
    s.toLowerCase().trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

  const handleAddSubmit = async () => {
    if (!addEmail.trim() || !addPassword.trim()) {
      toast.error('Email and password are required');
      return;
    }
    if (addPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setAddSubmitting(true);
    try {
      // v-admin-attach-existing — admin has two branches now:
      // "new" mints a tenant + admin atomically; "existing" attaches
      // the admin to a company the SA picks from the dropdown.
      // Non-admin roles keep the existing-company-only path.
      if (addRole === 'admin' && addAdminMode === 'new') {
        if (!addCompanyName.trim()) {
          toast.error('Company name is required for a new company');
          return;
        }
        const slug = addCompanySlug.trim() || slugify(addCompanyName);
        if (!/^[a-z][a-z0-9-]{2,63}$/.test(slug)) {
          toast.error('Slug must start with a lowercase letter and be 3–64 chars (a–z, 0–9, -)');
          return;
        }
        await platformApi.tenants.create({
          name: addCompanyName.trim(),
          slug,
          planTier: 'starter',
          // v-admin-email-mirrors-company-contact — the SA flow only
          // collects one email in this dialog (the admin's login).
          // Treat it as the company's contactEmail too, so the tenant
          // record isn't minted with a NULL/placeholder value that the
          // Companies page then flags as missing. If the admin later
          // wants a distinct company contact (e.g. billing@…), they
          // change it on the Companies page.
          contactEmail: addEmail.trim(),
          initialAdmin: {
            email: addEmail.trim(),
            password: addPassword,
            name: addEmail.split('@')[0],
          },
        });
        toast.success(`Created ${addCompanyName.trim()} and admin ${addEmail.trim()}`);
      } else {
        if (!addTenantId) {
          toast.error('Pick a company');
          return;
        }
        await platformApi.users.create({
          email: addEmail.trim(),
          password: addPassword,
          role: addRole,
          tenantId: addTenantId,
        });
        toast.success(`Created ${addRole} ${addEmail.trim()}`);
      }
      setAddOpen(false);
      resetAddForm();
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setAddSubmitting(false);
    }
  };

  // Derive a display name from email local-part since the API doesn't return one.
  const displayName = (u: platformApi.PlatformUser) => u.email.split('@')[0];

  const loadUsers = async () => {
    if (USE_MOCKS) {
      // Mock-mode shape differs (companyId/name); cast for backward compat in dev.
      setUsers(mockPlatformUsers as unknown as platformApi.PlatformUser[]);
      return;
    }
    setLoading(true);
    try {
      const data = await platformApi.users.list({
        tenantId: companyFilter !== 'all' ? companyFilter : undefined,
        q: search.trim() || undefined,
        role: roleTab !== 'all' ? roleTab : undefined,
        online: presence,
      });
      setUsers(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Reload on mount + whenever filters change. Server applies q/role/tenantId.
  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, roleTab, presence, search]);

  // Populate the Company filter dropdown from the real tenants endpoint
  // (live mode) or the mock seed (mock mode). Loaded once on mount.
  useEffect(() => {
    if (USE_MOCKS) {
      setTenantOptions(mockCompanies.map(c => ({ id: c.id, name: c.name, slug: c.slug })));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await platformApi.tenants.list();
        if (cancelled) return;
        setTenantOptions(list.map(t => ({
          id: t.id,
          name: t.name?.trim() || t.slug || '—',
          slug: t.slug ?? '',
        })));
      } catch {
        // Silent fall-through — dropdown shows just "All companies".
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    all:      users.length,
    admin:    users.filter(u => u.role === 'admin').length,
    manager:  users.filter(u => u.role === 'manager').length,
    employee: users.filter(u => u.role === 'employee').length,
  }), [users]);

  const filtered = useMemo(() => {
    // Server-side filtering; keep client filter as a no-op safety net.
    const q = search.trim().toLowerCase();
    const rows = users.filter(u => {
      if (roleTab !== 'all' && u.role !== roleTab) return false;
      if (companyFilter !== 'all' && u.tenantId !== companyFilter) return false;
      if (q) {
        const hay = `${displayName(u)} ${u.email} ${u.tenantSlug ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Client-side sort when a column header is active. `null` keeps
    // server order. Name uses localeCompare so Khmer / Chinese names
    // sort predictably alongside Latin; lastLogin sorts by ISO
    // timestamp string (null treated as oldest so descending puts
    // never-logged-in users at the bottom).
    if (sort) {
      const sign = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'name') {
        rows.sort((a, b) => sign * displayName(a).localeCompare(displayName(b)));
      } else if (sort.key === 'company') {
        // Mirror the visible cell fallback so sort matches what the
        // operator sees: tenantName (trimmed) → tenantSlug → empty.
        const label = (u: platformApi.PlatformUser) =>
          (u.tenantName?.trim() || u.tenantSlug || '').toLowerCase();
        rows.sort((a, b) => sign * label(a).localeCompare(label(b)));
      } else if (sort.key === 'role') {
        // Rank the hierarchy so asc puts admins first, then managers,
        // then employees. Unknown roles land after all three.
        const rank: Record<string, number> = { admin: 0, manager: 1, employee: 2 };
        rows.sort((a, b) => sign * ((rank[a.role] ?? 99) - (rank[b.role] ?? 99)));
      } else if (sort.key === 'online') {
        // asc = online users first (true ranked ahead of false).
        rows.sort((a, b) => sign * (Number(b.online) - Number(a.online)));
      } else if (sort.key === 'lastLogin') {
        rows.sort((a, b) => sign * ((a.lastLogin ?? '').localeCompare(b.lastLogin ?? '')));
      }
    }
    return rows;
  }, [users, search, companyFilter, roleTab, sort]);

  const pager = usePagination(filtered, 10);

  const roleBadge = (role: platformApi.PlatformUser['role']) => {
    const map: Record<string, string> = {
      admin:    'bg-red-100 text-red-800',
      manager:  'bg-blue-100 text-blue-800',
      employee: 'bg-gray-100 text-gray-800',
    };
    const Icon = role === 'admin' ? Shield : role === 'manager' ? UserCheck : UsersRound;
    return (
      <Badge className={map[role]}>
        <Icon className="h-3 w-3 mr-1" />
        {role}
      </Badge>
    );
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    const target = resetTarget;
    setResetTarget(null);
    if (USE_MOCKS) {
      toast.success(`Password reset email sent to ${target.email}`);
      return;
    }
    try {
      const { temporaryPassword } = await platformApi.users.resetPassword(target.id);
      // Cleartext password returned ONCE — show prominently with long duration.
      toast.success(`Temporary password for ${target.email}: ${temporaryPassword}`, {
        description: 'Copy this now — it will not be shown again.',
        duration: 60000,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  // Group users by lowercase email so we can detect duplicates.
  const duplicatesByEmail = useMemo(() => {
    const m = new Map<string, platformApi.PlatformUser[]>();
    for (const u of users) {
      const key = u.email.toLowerCase();
      const arr = m.get(key) ?? [];
      arr.push(u);
      m.set(key, arr);
    }
    // Drop singletons — only emails with 2+ rows are "duplicates".
    return new Map(Array.from(m.entries()).filter(([, v]) => v.length > 1));
  }, [users]);

  const mergeCandidates = useMemo<platformApi.PlatformUser[]>(() => {
    if (!mergeEmail) return [];
    return duplicatesByEmail.get(mergeEmail.toLowerCase()) ?? [];
  }, [mergeEmail, duplicatesByEmail]);

  const openMerge = (email: string) => {
    const group = duplicatesByEmail.get(email.toLowerCase()) ?? [];
    if (group.length < 2) return;
    setMergeEmail(email);
    // Default "keep" pick: prefer an active user, then the most-recently
    // logged-in. Falls back to the first row when nothing else fits.
    const active = group.filter(u => u.isActive);
    const ranked = (active.length ? active : group).slice().sort((a, b) => {
      if (a.lastLogin && b.lastLogin) return b.lastLogin.localeCompare(a.lastLogin);
      if (a.lastLogin) return -1;
      if (b.lastLogin) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    setKeepUserId(ranked[0]?.id ?? null);
  };

  const closeMerge = () => {
    setMergeEmail(null);
    setKeepUserId(null);
  };

  const handleMerge = async () => {
    if (!keepUserId || mergeCandidates.length < 2) return;
    const losers = mergeCandidates.filter(u => u.id !== keepUserId);
    setMerging(true);
    try {
      // Delete the losers in parallel. Backend rejects with 409 when a
      // user has linked records — we surface that per-row so the admin
      // knows which row blocked the merge and can suspend instead.
      const results = await Promise.allSettled(losers.map(u => platformApi.users.remove(u.id)));
      const failed = results
        .map((r, i) => ({ r, u: losers[i] }))
        .filter(x => x.r.status === 'rejected');
      const ok = results.length - failed.length;
      if (failed.length === 0) {
        toast.success(`Merged ${results.length + 1} → 1. Removed ${ok} duplicate${ok === 1 ? '' : 's'}.`);
      } else {
        const msg = failed
          .map(f => `${f.u.tenantName?.trim() || f.u.tenantSlug || '—'}: ${(f.r as PromiseRejectedResult).reason?.message ?? 'failed'}`)
          .join(' · ');
        toast.error(`Removed ${ok} of ${losers.length}. Some failed — ${msg}`, { duration: 12000 });
      }
      closeMerge();
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const handleToggleActive = async () => {
    if (!suspendTarget) return;
    const target = suspendTarget;
    setSuspendTarget(null);
    if (USE_MOCKS) {
      setUsers(prev => prev.map(u => u.id === target.id ? { ...u, isActive: !u.isActive } : u));
      toast.success(target.isActive ? `Suspended ${target.email}` : `Reactivated ${target.email}`);
      return;
    }
    try {
      if (target.isActive) await platformApi.users.suspend(target.id);
      else                 await platformApi.users.reactivate(target.id);
      toast.success(target.isActive ? `Suspended ${target.email}` : `Reactivated ${target.email}`);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {([
          { key: 'all',      label: 'Total Users', value: counts.all,      cls: 'text-gray-900',   Icon: UsersRound },
          { key: 'admin',    label: 'Admins',      value: counts.admin,    cls: 'text-red-700',    Icon: Shield },
          { key: 'manager',  label: 'Managers',    value: counts.manager,  cls: 'text-blue-700',   Icon: UserCheck },
          { key: 'employee', label: 'Employees',   value: counts.employee, cls: 'text-gray-700',   Icon: UsersRound },
        ] as const).map(s => {
          const Icon = s.Icon;
          return (
            <Card key={s.key} className="border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${s.cls}`} />
                  <span className={`text-2xl font-bold ${s.cls}`}>{s.value}</span>
                </div>
                <p className="text-xs font-medium text-gray-700 truncate">{s.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>All Users (across tenants)</CardTitle>
            <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as typeof roleTab)}>
              <TabsList>
                <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts.all}</Badge></TabsTrigger>
                <TabsTrigger value="admin">Admin <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-100 text-red-800">{counts.admin}</Badge></TabsTrigger>
                <TabsTrigger value="manager">Manager <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-blue-100 text-blue-800">{counts.manager}</Badge></TabsTrigger>
                <TabsTrigger value="employee">Employee <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-gray-100 text-gray-700">{counts.employee}</Badge></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, or company…"
                className="pl-8 h-9"
              />
            </div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="h-9 px-3 border rounded-md text-sm min-w-[200px]"
            >
              <option value="all">All companies</option>
              {tenantOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {/* V266 — presence filter. Server treats the value as a
                strict membership predicate (5-min window); "all"
                passes the flag through as-is. */}
            <select
              value={presence}
              onChange={(e) => setPresence(e.target.value as typeof presence)}
              className="h-9 px-3 border rounded-md text-sm min-w-[130px]"
              aria-label="Filter by online status"
            >
              <option value="all">All statuses</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
            <Button size="sm" className="ml-auto" onClick={() => { resetAddForm(); setAddOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {/* Sortable columns — click the header to cycle
                    unsorted → asc → desc → unsorted. Only one column
                    can be sorted at a time; clicking a different
                    column resets to asc on that column. */}
                <TableHead>
                  <SortHeader label="User" col="name" sort={sort} onCycle={cycleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Company" col="company" sort={sort} onCycle={cycleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Role" col="role" sort={sort} onCycle={cycleSort} />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <SortHeader label="Online" col="online" sort={sort} onCycle={cycleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Last Login" col="lastLogin" sort={sort} onCycle={cycleSort} />
                </TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && pager.paginatedItems.length === 0 && (
                <TableBodySkeletonRows rows={6} columns={8} />
              )}
              {!loading && pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-400 py-10">
                    No users match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(u => {
                // Cross-tenant duplicate emails are valid (the same person can
                // be admin in multiple tenants). Surface a short id hint so two
                // rows with admin@example.com are visually distinguishable.
                const sameEmailCount = filtered.filter(o => o.email.toLowerCase() === u.email.toLowerCase()).length;
                const idHint = u.id.slice(0, 8);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{displayName(u)}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <span>{u.email}</span>
                        {sameEmailCount > 1 && (
                          <span
                            className="tabular-nums text-[10px] text-gray-400 bg-gray-100 px-1 py-0.5 rounded"
                            title={`User ID: ${u.id}`}
                          >
                            #{idHint}
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span
                        className="font-medium"
                        title={u.tenantSlug ?? undefined}
                      >
                        {u.tenantName?.trim() || u.tenantSlug || '—'}
                      </span>
                    </TableCell>
                    <TableCell>{roleBadge(u.role)}</TableCell>
                    <TableCell>
                      {u.isActive
                        ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                        : <Badge className="bg-gray-100 text-gray-700">Suspended</Badge>}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs"
                        title={u.lastSeen ? `Last seen ${format(new Date(u.lastSeen), 'MMM dd, HH:mm:ss')}` : 'Never seen'}
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            u.online ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]' : 'bg-gray-300'
                          }`}
                        />
                        <span className={u.online ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                          {u.online ? 'Online' : 'Offline'}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      <span title={u.lastLogin ? format(new Date(u.lastLogin), 'MMM dd, yyyy · HH:mm:ss') : 'Never'}>
                        {formatLastLogin(u.lastLogin)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {sameEmailCount > 1 && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-xs text-blue-700 hover:bg-blue-50"
                            onClick={() => openMerge(u.email)}
                            title={`${sameEmailCount} users share this email — merge`}
                          >
                            <GitMerge className="h-3.5 w-3.5 mr-1" />
                            Merge
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setResetTarget(u)}
                          title="Reset password"
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Reset
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className={`h-7 text-xs ${u.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
                          onClick={() => setSuspendTarget(u)}
                          title={u.isActive ? 'Suspend' : 'Reactivate'}
                        >
                          {u.isActive
                            ? <><UserX className="h-3.5 w-3.5 mr-1" />Suspend</>
                            : <><UserCheck className="h-3.5 w-3.5 mr-1" />Reactivate</>}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pager.currentPage}
            totalPages={pager.totalPages}
            onPageChange={pager.goToPage}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            totalItems={pager.totalItems}
          />
        </CardContent>
      </Card>

      {/* Reset password confirmation */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password for {resetTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              A one-time password-reset link will be emailed. The user's current password stops working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>Send reset email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend / reactivate confirmation */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.isActive ? 'Suspend' : 'Reactivate'} {suspendTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.isActive
                ? 'Active sessions are revoked and the user cannot sign in until reactivated.'
                : 'The user regains immediate access. Their role and permissions are unchanged.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive}>
              {suspendTarget?.isActive ? 'Suspend' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge duplicate users — pick one to keep, others get deleted. */}
      <AlertDialog open={!!mergeEmail} onOpenChange={(o) => !o && closeMerge()}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-blue-600" />
              Merge {mergeCandidates.length} users sharing {mergeEmail}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Pick the canonical record to keep. The other {mergeCandidates.length - 1}{' '}
              {mergeCandidates.length - 1 === 1 ? 'row will be permanently deleted' : 'rows will be permanently deleted'}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 my-2">
            {mergeCandidates.map(u => {
              const selected = u.id === keepUserId;
              return (
                <label
                  key={u.id}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition ${
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="merge-keep"
                    className="mt-1"
                    checked={selected}
                    onChange={() => setKeepUserId(u.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-medium text-sm"
                        title={u.tenantSlug ?? undefined}
                      >
                        {u.tenantName?.trim() || u.tenantSlug || '—'}
                      </span>
                      {roleBadge(u.role)}
                      {u.isActive
                        ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                        : <Badge className="bg-gray-100 text-gray-700">Suspended</Badge>}
                      <span
                        className="tabular-nums text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                        title={`User ID: ${u.id}`}
                      >
                        #{u.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      <span>Created {formatDate(u.createdAt)}</span>
                      <span>
                        Last login {formatLastLogin(u.lastLogin)}
                      </span>
                    </div>
                  </div>
                  {selected && (
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      Keep
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              The deletion is permanent. If a row has linked records (audit / approvals / payroll history),
              the delete will fail with a 409 and you'll be told which row blocked the merge — suspend that
              one instead.
            </span>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging || !keepUserId || mergeCandidates.length < 2}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {merging ? 'Merging…' : `Keep 1, delete ${mergeCandidates.length - 1}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User dialog — admin role spawns a new company (tenant + first
          admin); manager/employee gets attached to an existing tenant. */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); resetAddForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add User
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase tracking-wide text-gray-500">Role</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(['admin', 'manager', 'employee'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAddRole(r)}
                    className={`h-9 rounded-md border text-sm capitalize transition ${
                      addRole === r
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {addRole === 'admin' && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">Company</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {([
                    ['new',      'Create new'],
                    ['existing', 'Existing'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAddAdminMode(key)}
                      className={`h-9 rounded-md border text-sm transition ${
                        addAdminMode === key
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {addRole === 'admin' && addAdminMode === 'new' ? (
              <>
                <div>
                  <Label htmlFor="add-company-name" className="text-xs uppercase tracking-wide text-gray-500">
                    New Company Name
                  </Label>
                  <Input
                    id="add-company-name"
                    value={addCompanyName}
                    onChange={e => {
                      setAddCompanyName(e.target.value);
                      // Auto-fill slug if the admin hasn't manually edited it.
                      if (!addCompanySlug || addCompanySlug === slugify(addCompanyName)) {
                        setAddCompanySlug(slugify(e.target.value));
                      }
                    }}
                    placeholder="ACME Corporation"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="add-company-slug" className="text-xs uppercase tracking-wide text-gray-500">
                    Slug
                  </Label>
                  <Input
                    id="add-company-slug"
                    value={addCompanySlug}
                    onChange={e => setAddCompanySlug(slugify(e.target.value))}
                    placeholder="acme"
                    className="mt-1 h-9 tabular-nums text-sm"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    URL-safe identifier. Lowercase a–z, 0–9, and dashes. Auto-filled from the name.
                  </p>
                </div>
              </>
            ) : (
              // Existing-company picker: shared by manager / employee
              // and by admin when addAdminMode === 'existing'.
              <div>
                <Label className="text-xs uppercase tracking-wide text-gray-500">
                  {addRole === 'admin' ? 'Attach to Company' : 'Company'}
                </Label>
                <select
                  value={addTenantId}
                  onChange={e => setAddTenantId(e.target.value)}
                  className="mt-1 h-9 px-3 border rounded-md text-sm w-full"
                >
                  <option value="">Pick a company…</option>
                  {tenantOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label htmlFor="add-email" className="text-xs uppercase tracking-wide text-gray-500">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 h-9"
              />
            </div>

            <div>
              <Label htmlFor="add-password" className="text-xs uppercase tracking-wide text-gray-500">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="add-password"
                  type={addShowPwd ? 'text' : 'password'}
                  value={addPassword}
                  onChange={e => setAddPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setAddShowPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={addShowPwd ? 'Hide password' : 'Show password'}
                >
                  {addShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetAddForm(); }} disabled={addSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={addSubmitting}>
              {addSubmitting
                ? 'Creating…'
                : addRole === 'admin'
                  ? (addAdminMode === 'new' ? 'Create Company + Admin' : 'Add Admin to Company')
                  : `Create ${addRole}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Header-cell button that cycles the parent's sort state. Idle
 *  shows a two-way arrow in grey; active column shows up/down in
 *  blue. Kept local — used only by the users table above. */
type UsersSortKey = 'name' | 'company' | 'role' | 'online' | 'lastLogin';
function SortHeader({
  label, col, sort, onCycle,
}: {
  label: string;
  col: UsersSortKey;
  sort: { key: UsersSortKey; dir: 'asc' | 'desc' } | null;
  onCycle: (c: UsersSortKey) => void;
}) {
  const active = sort?.key === col;
  const dir = active ? sort?.dir : null;
  return (
    <button
      type="button"
      onClick={() => onCycle(col)}
      className="inline-flex items-center gap-1 hover:text-gray-900 select-none"
      aria-label={`Sort by ${label} (${dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'unsorted'})`}
      title={`Sort by ${label}`}
    >
      {label}
      {dir === 'asc' && <ArrowUp className="h-3.5 w-3.5 text-blue-600" />}
      {dir === 'desc' && <ArrowDown className="h-3.5 w-3.5 text-blue-600" />}
      {dir === null && <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />}
    </button>
  );
}
