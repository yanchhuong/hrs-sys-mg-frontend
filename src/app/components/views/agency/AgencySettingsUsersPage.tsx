import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '../../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Users, Search, RefreshCw, Plus, Edit3, UserX, Building2 } from 'lucide-react';
import { agencyUsers } from '../../../api/agencyAdmin';
import type { AgencyUserAdminDto, AgencyRole } from '../../../api/agencyAdmin';
import { useAuth } from '../../../context/AuthContext';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { PageTitleTooltip } from './PageTitleTooltip';
import { Checkbox } from '../../ui/checkbox';

const ROLE_LABEL: Record<AgencyRole, string> = {
  partner: 'Partner', manager: 'Manager', senior: 'Senior', staff: 'Staff',
};

const ROLE_CLS: Record<AgencyRole, string> = {
  partner: 'border-purple-200 bg-purple-50 text-purple-700',
  manager: 'border-blue-200 bg-blue-50 text-blue-700',
  senior:  'border-teal-200 bg-teal-50 text-teal-700',
  staff:   'border-gray-200 bg-gray-50 text-gray-700',
};

/**
 * v-agency-users-admin — Settings ▸ Users. Partners can add / edit
 * / deactivate; other roles see a read-only roster. Roles map to
 * capabilities per {@link AgencyRole}:
 *
 * <ul>
 *   <li>Partner — full: user admin, accept/decline engagements.</li>
 *   <li>Manager / Senior / Staff — portfolio work only.</li>
 * </ul>
 */
export function AgencySettingsUsersPage() {
  const { currentUser } = useAuth();
  const myRole = currentUser?.role?.replace(/^agency_/, '') as AgencyRole | undefined;
  const canAdmin = myRole === 'partner';

  const [rows, setRows] = useState<AgencyUserAdminDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<AgencyUserAdminDto | null>(null);
  const [scopeRow, setScopeRow] = useState<AgencyUserAdminDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await agencyUsers.list();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(m =>
      (m.name ?? '').toLowerCase().includes(q)
      || m.email.toLowerCase().includes(q)
      || m.role.toLowerCase().includes(q));
  }, [rows, search]);

  const openNew = () => { setEditRow(null); setDialogOpen(true); };
  const openEdit = (r: AgencyUserAdminDto) => { setEditRow(r); setDialogOpen(true); };

  const doDeactivate = async (r: AgencyUserAdminDto) => {
    if (!confirm(`Deactivate ${r.name ?? r.email}? They lose access immediately.`)) return;
    try {
      await agencyUsers.deactivate(r.id);
      toast.success('User deactivated');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deactivate failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Users
          <PageTitleTooltip label="About Users">
            Every member on your agency (Partner / Manager / Senior / Staff).
            <b> Partners</b> can add / edit / deactivate; other roles have
            read-only access. Deactivated users keep their audit trail but
            lose login access immediately.
          </PageTitleTooltip>
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canAdmin && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add user
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Members
              <span className="text-xs text-gray-500 font-normal">
                ({filtered.length}{search ? ` of ${rows.length}` : ''})
              </span>
            </CardTitle>
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name / email / role…"
                className="pl-8 h-9 w-72 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-4">
              {rows.length === 0 ? 'No members yet.' : 'No members match this filter.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(m => (
                <li key={m.id} className={`px-6 py-2.5 flex items-center gap-3 ${!m.isActive ? 'opacity-50' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials(m.name || m.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate inline-flex items-center gap-1.5">
                      {m.name || m.email}
                      {!m.isActive && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{m.email}</div>
                    <ClientChips user={m} />
                  </div>
                  <Badge className={`border text-[10px] shrink-0 ${ROLE_CLS[m.role]}`}>
                    {ROLE_LABEL[m.role]}
                  </Badge>
                  {canAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {m.role !== 'partner' && (
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2"
                          onClick={() => setScopeRow(m)}
                          title="Assign clients"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2"
                        onClick={() => openEdit(m)}
                        title="Edit user"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      {m.isActive && (
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2 text-rose-600 hover:text-rose-800"
                          onClick={() => doDeactivate(m)}
                          title="Deactivate"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editRow}
        onSaved={() => void load()}
      />

      <ScopeDialog
        user={scopeRow}
        onClose={() => setScopeRow(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function UserDialog({ open, onOpenChange, user, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AgencyUserAdminDto | null;
  onSaved: () => void;
}) {
  const editing = !!user;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AgencyRole>('staff');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setEmail(user.email);
      setName(user.name ?? '');
      setRole(user.role);
      setPassword('');
      setIsActive(user.isActive);
    } else {
      setEmail(''); setName(''); setRole('staff'); setPassword(''); setIsActive(true);
    }
  }, [open, user]);

  const save = async () => {
    if (!email.trim()) return;
    if (!editing && password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      if (editing && user) {
        await agencyUsers.update(user.id, {
          name: name.trim() || null,
          role,
          isActive,
          password: password || undefined,
        });
        toast.success('User updated');
      } else {
        await agencyUsers.create({
          email: email.trim(),
          name: name.trim() || null,
          role,
          password,
        });
        toast.success('User created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit user' : 'Add agency user'}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? 'Update this agency member.' : 'Create a new agency member.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-9 text-sm mt-1"
              maxLength={255}
              placeholder="name@agency.com"
              disabled={editing}   /* email is the login id; changing it later is a re-invite */
              autoFocus={!editing}
            />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-9 text-sm mt-1"
              maxLength={255}
              placeholder="Display name"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={v => setRole(v as AgencyRole)}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="senior">Senior</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing && (
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={isActive ? 'active' : 'inactive'} onValueChange={v => setIsActive(v === 'active')}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">
              {editing ? 'New password (leave blank to keep current)' : 'Password'}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-9 text-sm mt-1"
              maxLength={100}
              placeholder={editing ? '(unchanged)' : 'At least 8 characters'}
            />
          </div>
          <p className="text-[10px] text-gray-500">
            Role capabilities: <b>Partner</b> — full admin (users + accept engagements).
            <b> Manager / Senior / Staff</b> — portfolio work only.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !email.trim() || (!editing && password.length < 8)}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * v-agency-user-client-scopes — inline chip strip under each row's
 * name/email showing the client Companies that user has been scoped
 * to. Partner rows and un-scoped members show a single "Full
 * portfolio" chip (both cases yield null / empty in the resolver).
 * Non-partner rows with explicit scopes show the picked clients by
 * name (resolved via the agency's own portfolio) — anything not
 * matched in the portfolio (e.g. disengaged after the scope was
 * set) falls back to a short UUID slice.
 */
function ClientChips({ user }: { user: AgencyUserAdminDto }) {
  const { portfolio } = useAgencyClient();
  const nameByTenantId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of portfolio) {
      m.set(c.tenantId, c.tenantName ?? c.tenantSlug ?? c.tenantId);
    }
    return m;
  }, [portfolio]);

  // Partner OR empty allow-list → unrestricted (matches BE resolver).
  const isFullPortfolio = user.role === 'partner'
    || !user.assignedTenantIds
    || user.assignedTenantIds.length === 0;

  if (isFullPortfolio) {
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"
          title="No restriction — user can see every engaged client."
        >
          <Building2 className="h-2.5 w-2.5" />
          Full portfolio
        </Badge>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {user.assignedTenantIds.map(tid => (
        <Badge
          key={tid}
          variant="outline"
          className="text-[9px] px-1.5 py-0 border-blue-200 bg-blue-50 text-blue-700"
          title={tid}
        >
          {nameByTenantId.get(tid) ?? tid.slice(0, 8)}
        </Badge>
      ))}
    </div>
  );
}

/**
 * v-agency-user-client-scopes — Partner-only dialog to assign or
 * move which clients an individual staff / manager / senior can
 * see. Partner rows never open this (they always have full
 * portfolio access). Empty selection = unrestricted (default —
 * user reverts to the full portfolio just like a Partner).
 */
function ScopeDialog({
  user, onClose, onSaved,
}: {
  user: AgencyUserAdminDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { portfolio } = useAgencyClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const open = !!user;

  useEffect(() => {
    if (!user) return;
    setSearch('');
    setLoading(true);
    agencyUsers.getScopes(user.id)
      .then(s => setSelected(new Set(s.tenantIds)))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load scopes'))
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return portfolio;
    return portfolio.filter(c =>
      (c.tenantName ?? '').toLowerCase().includes(q)
      || (c.tenantSlug ?? '').toLowerCase().includes(q));
  }, [portfolio, search]);

  const toggle = (tenantId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(portfolio.map(c => c.tenantId)));
  const clearAll  = () => setSelected(new Set());

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await agencyUsers.setScopes(user.id, Array.from(selected));
      toast.success(
        selected.size === 0
          ? 'Scope cleared — user has full portfolio access again.'
          : `Assigned ${selected.size} client${selected.size === 1 ? '' : 's'}.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Assign clients — {user?.name || user?.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={selectAll} disabled={loading}>All</Button>
            <Button variant="outline" size="sm" onClick={clearAll} disabled={loading}>None</Button>
          </div>

          {loading ? (
            <div className="text-center py-6 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading scopes…
            </div>
          ) : portfolio.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              No engaged clients yet. Accept an engagement from Settings ▸ Clients first.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y rounded-md border">
              {filtered.map(c => (
                <li key={c.tenantId} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    checked={selected.has(c.tenantId)}
                    onCheckedChange={() => toggle(c.tenantId)}
                    id={`scope-${c.tenantId}`}
                  />
                  <label
                    htmlFor={`scope-${c.tenantId}`}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                    </div>
                    {c.tenantSlug && (
                      <div className="text-[11px] text-gray-500 truncate">{c.tenantSlug}</div>
                    )}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-xs text-gray-500 text-center">
                  No clients match this filter.
                </li>
              )}
            </ul>
          )}

          <p className="text-[11px] text-gray-500">
            {selected.size === 0
              ? 'No restriction — user will see every engaged client.'
              : `${selected.size} of ${portfolio.length} client${portfolio.length === 1 ? '' : 's'} allowed.`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
