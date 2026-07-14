import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Building2, Loader2, Plus, RefreshCw, Users, Briefcase, PauseCircle, PlayCircle, ChevronLeft, UserPlus, Link2Off } from 'lucide-react';
import * as api from '../../../api/platformAgencies';
import * as platformApi from '../../../api/platform';

type Tab = 'general' | 'users' | 'assignments';

/**
 * v-agency-fe-4 — Super Admin agencies page.
 *
 * Two-level layout: list on the left, detail on the right (or
 * stacked when nothing is picked). Detail carries three tabs:
 * General (edit + suspend/reactivate), Users (list + create +
 * toggle active), Assignments (engage clients + disengage).
 */
export function Agencies() {
  const [rows, setRows] = useState<api.PlatformAgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.agencies.list();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load agencies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const picked = rows.find(a => a.id === pickedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Agencies
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            External accounting / tax / audit firms. Each agency spans multiple
            client Companies via assignments; agency users inherit the whole
            portfolio through their agency membership.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New agency
          </Button>
        </div>
      </div>

      {!picked ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="text-sm text-gray-500">
              {rows.length} agenc{rows.length === 1 ? 'y' : 'ies'}
            </div>
          </CardHeader>
          <CardContent>
            {loading && rows.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No agencies yet. Click New agency to add one.
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map(a => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setPickedId(a.id)}
                      className="w-full text-left py-3 px-1 hover:bg-gray-50 flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                          <span className="text-xs text-gray-500">({a.slug})</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" /> {a.userCount} user{a.userCount === 1 ? '' : 's'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="h-3 w-3" /> {a.clientCount} active client{a.clientCount === 1 ? '' : 's'}
                          </span>
                          {a.contactEmail && <span>{a.contactEmail}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <AgencyDetail agency={picked} onBack={() => setPickedId(null)} onChanged={load} />
      )}

      <CreateAgencyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={a => { setPickedId(a.id); void load(); }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: api.PlatformAgency['status'] }) {
  const cls =
    status === 'active'     ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
    status === 'suspended'  ? 'border-amber-200 bg-amber-50 text-amber-700' :
                              'border-rose-200 bg-rose-50 text-rose-700';
  return <Badge className={`border ${cls} text-[10px] px-1.5 py-0`}>{status}</Badge>;
}

/* -------------------- detail -------------------- */

function AgencyDetail({ agency, onBack, onChanged }: { agency: api.PlatformAgency; onBack: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('general');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to list
        </Button>
        <div className="text-sm font-medium">{agency.name}</div>
        <span className="text-xs text-gray-500">({agency.slug})</span>
        <StatusBadge status={agency.status} />
      </div>
      <div className="flex items-center gap-2 border-b">
        {(['general', 'users', 'assignments'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 h-9 text-xs font-medium capitalize transition border-b-2 -mb-px ${
              tab === t ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'general'     && <GeneralPanel agency={agency} onChanged={onChanged} />}
      {tab === 'users'       && <UsersPanel agencyId={agency.id} />}
      {tab === 'assignments' && <AssignmentsPanel agencyId={agency.id} />}
    </div>
  );
}

function GeneralPanel({ agency, onChanged }: { agency: api.PlatformAgency; onChanged: () => void }) {
  const [name, setName] = useState(agency.name);
  const [email, setEmail] = useState(agency.contactEmail ?? '');
  const [phone, setPhone] = useState(agency.contactPhone ?? '');
  const [country, setCountry] = useState(agency.country ?? 'KH');
  const [patent, setPatent] = useState(agency.patentNo ?? '');
  const [vatTin, setVatTin] = useState(agency.vatTin ?? '');
  const [notes, setNotes] = useState(agency.notes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.agencies.update(agency.id, {
        name: name.trim(),
        contactEmail: email.trim() || null,
        contactPhone: phone.trim() || null,
        country: country.trim() || null,
        patentNo: patent.trim() || null,
        vatTin: vatTin.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success('Agency updated');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async () => {
    setSaving(true);
    try {
      if (agency.status === 'active') {
        await api.agencies.suspend(agency.id);
        toast.success('Agency suspended — logins blocked');
      } else {
        await api.agencies.reactivate(agency.id);
        toast.success('Agency reactivated');
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">General</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Contact email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Contact phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Country</Label>
            <Input value={country} onChange={e => setCountry(e.target.value)} className="h-9 text-sm mt-1" maxLength={64} />
          </div>
          <div>
            <Label className="text-xs">Cambodian Patent no.</Label>
            <Input value={patent} onChange={e => setPatent(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">VAT TIN</Label>
            <Input value={vatTin} onChange={e => setVatTin(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm mt-1" />
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant={agency.status === 'active' ? 'outline' : 'default'}
            onClick={toggle}
            disabled={saving || agency.status === 'cancelled'}
            className={agency.status === 'active' ? '' : 'bg-emerald-600 hover:bg-emerald-700'}
          >
            {agency.status === 'active'
              ? <><PauseCircle className="h-4 w-4 mr-1.5" /> Suspend</>
              : <><PlayCircle className="h-4 w-4 mr-1.5" /> Reactivate</>}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- users tab -------------------- */

function UsersPanel({ agencyId }: { agencyId: string }) {
  const [rows, setRows] = useState<api.AgencyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.agencyUsers.list(agencyId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (u: api.AgencyUser) => {
    try {
      if (u.isActive) await api.agencyUsers.deactivate(u.id);
      else            await api.agencyUsers.activate(u.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">Users</CardTitle>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" /> Add user
        </Button>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Loading…</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No users yet. Add one to let them log in.</p>
        ) : (
          <ul className="divide-y">
            {rows.map(u => (
              <li key={u.id} className="py-2 px-1 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{u.userName ?? u.email}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{u.role}</Badge>
                    {!u.isActive && <Badge className="border-rose-200 bg-rose-50 text-rose-700 border text-[10px] px-1.5 py-0">inactive</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggle(u)}>
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <NewAgencyUserDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        agencyId={agencyId}
        onCreated={() => void load()}
      />
    </Card>
  );
}

function NewAgencyUserDialog({ open, onOpenChange, agencyId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; agencyId: string; onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<api.AgencyUser['role']>('staff');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || password.length < 8 || !name.trim()) return;
    setSaving(true);
    try {
      await api.agencyUsers.create(agencyId, { email: email.trim(), password, name: name.trim(), role });
      toast.success('Agency user created');
      setEmail(''); setPassword(''); setName(''); setRole('staff');
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New agency user</DialogTitle>
          <DialogDescription>
            They log in with this email + password on the normal /login screen.
            Password must be at least 8 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} className="h-9 text-sm mt-1" type="email" />
          </div>
          <div>
            <Label className="text-xs">Password (min 8 chars)</Label>
            <Input value={password} onChange={e => setPassword(e.target.value)} className="h-9 text-sm mt-1" type="password" />
          </div>
          <div>
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={v => setRole(v as api.AgencyUser['role'])}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="partner">Partner (approver)</SelectItem>
                <SelectItem value="manager">Manager (reviewer + approver)</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || !email.trim() || password.length < 8 || !name.trim()}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- assignments tab -------------------- */

function AssignmentsPanel({ agencyId }: { agencyId: string }) {
  const [rows, setRows] = useState<api.AgencyAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<platformApi.PlatformTenant[]>([]);
  const [newTenantId, setNewTenantId] = useState<string>('');
  const [newScope, setNewScope] = useState<api.AgencyAssignment['scope']>('full');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, t] = await Promise.all([
        api.assignments.list(agencyId),
        platformApi.tenants.list(),
      ]);
      setRows(list);
      setTenants(t.filter(x => x.slug !== 'platform'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => { void load(); }, [load]);

  const engage = async () => {
    if (!newTenantId) return;
    setSaving(true);
    try {
      await api.assignments.create(agencyId, {
        tenantId: newTenantId,
        scope: newScope,
        isPrimary: true,
      });
      toast.success('Assigned');
      setNewTenantId('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  const disengage = async (assignmentId: string) => {
    if (!confirm('Disengage this client? The agency loses access to their data.')) return;
    setSaving(true);
    try {
      await api.assignments.disengage(assignmentId);
      toast.success('Disengaged');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const engagedTenantIds = new Set(rows.map(r => r.tenantId));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Client assignments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Client Company</Label>
            <Select value={newTenantId} onValueChange={setNewTenantId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick a Company…" /></SelectTrigger>
              <SelectContent>
                {tenants.filter(t => !engagedTenantIds.has(t.id)).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-gray-400 ml-1">({t.slug})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={newScope} onValueChange={v => setNewScope(v as api.AgencyAssignment['scope'])}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="tax">Tax only</SelectItem>
                <SelectItem value="audit">Audit only</SelectItem>
                <SelectItem value="bookkeeping">Bookkeeping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={engage} disabled={!newTenantId || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Engage
          </Button>
        </div>

        {loading && rows.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Loading…</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No active client engagements yet.</p>
        ) : (
          <ul className="divide-y border-t">
            {rows.map(r => (
              <li key={r.id} className="py-2 px-1 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.tenantName ?? r.tenantSlug ?? '—'}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.scope}</Badge>
                    {r.isPrimary && <Badge className="border-amber-200 bg-amber-50 text-amber-700 border text-[10px] px-1.5 py-0">primary</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">
                    engaged {r.engagedAt}
                    {r.disengagedAt && ` · disengaged ${r.disengagedAt}`}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => disengage(r.id)} disabled={saving}>
                  <Link2Off className="h-3.5 w-3.5 mr-1" />
                  Disengage
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- create dialog -------------------- */

function CreateAgencyDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: (a: api.PlatformAgency) => void;
}) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!slug.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const created = await api.agencies.create({
        slug: slug.trim(),
        name: name.trim(),
        contactEmail: email.trim() || null,
        country: 'KH',
      });
      toast.success('Agency created');
      setSlug(''); setName(''); setEmail('');
      onCreated(created);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New agency</DialogTitle>
          <DialogDescription>
            Slug is stable + lowercase (used in URLs); name shows up in the
            agency user's workspace header.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g. acme-cpa"
              maxLength={64}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Contact email (optional)</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-9 text-sm mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !slug.trim() || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
