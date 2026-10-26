import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Users, CalendarClock, UserCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { DateInput } from './DateInput';
import { SearchablePicker, type PickerOption } from './SearchablePicker';
import { ListEmpty, ListError } from './ListStates';
import { TableBodySkeletonRows } from './LoadingSkeletons';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import * as clubApi from '../../api/clubPrograms';
import type { ClubProgram } from '../../api/clubPrograms';
import type { EmployeeRecord } from '../../api/employeeRecords';
import { RECORD_TYPES, subtypeLabel } from './employeeRecordTypes';
import { RecordStatusBadge, type RecordEmployeeOption } from './EmployeeRecords';

const selectCls =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const CLUB_SUBTYPES = RECORD_TYPES.club.subtypes;

// ─── HR: manage programs ────────────────────────────────────────────

/**
 * Employees → Records → Programs. HR sets up the clubs / programs
 * employees can apply to, each with the person in charge who approves
 * the requests (in Approvals).
 */
export function ClubProgramsDialog({ open, onOpenChange, employees }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: RecordEmployeeOption[];
}) {
  const { canUpdate, canDelete } = useAuth();
  const confirm = useConfirm();
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<ClubProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClubProgram | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await clubApi.list(false)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load programs'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const del = async (p: ClubProgram) => {
    if (!(await confirm({
      title: `Delete '${p.name}'?`,
      message: 'Requests and memberships already made stay in Records; they just lose the link to this program.',
      variant: 'destructive', confirmLabel: 'Delete',
    }))) return;
    try { await clubApi.remove(p.id); toast.success('Program deleted'); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Club programs</DialogTitle>
          <DialogDescription>
            Employees apply to join these; the person in charge approves each request in Approvals.
          </DialogDescription>
        </DialogHeader>
        {canUpdate('employee_records') && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add program
            </Button>
          </div>
        )}
        <ListTable className="list-table-flow">
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Person in charge</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableBodySkeletonRows rows={3} columns={7} />
            ) : error && rows.length === 0 ? (
              <ListError colSpan={7} message={error} onRetry={() => void load()} />
            ) : rows.length === 0 ? (
              <ListEmpty colSpan={7} noun="programs" />
            ) : rows.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-gray-500">{subtypeLabel('club', p.subtype)}</p>
                </TableCell>
                <TableCell className="text-sm">{p.personInChargeName ?? <span className="text-gray-400">Reports-to manager</span>}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{p.fee != null ? formatMoney(p.fee) : '—'}</TableCell>
                <TableCell className="text-sm">{p.expireDate ? formatDate(p.expireDate) : '—'}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {p.memberCount}{p.pendingCount > 0 && <span className="text-amber-600"> (+{p.pendingCount} pending)</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={p.open ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-300 text-slate-600 bg-slate-50'}>
                    {p.open ? 'Open' : p.active ? 'Expired' : 'Closed'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    {canUpdate('employee_records') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50" title="Edit"
                        onClick={() => { setEditing(p); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete('employee_records') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" title="Delete"
                        onClick={() => void del(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ListTable>
        <ProgramFormDialog open={formOpen} onOpenChange={setFormOpen} program={editing}
          employees={employees} onSaved={() => void load()} />
      </DialogContent>
    </Dialog>
  );
}

function ProgramFormDialog({ open, onOpenChange, program, employees, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: ClubProgram | null;
  employees: RecordEmployeeOption[];
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [subtype, setSubtype] = useState('sport');
  const [pic, setPic] = useState('');
  const [fee, setFee] = useState('');
  const [expire, setExpire] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(program?.name ?? '');
    setSubtype(program?.subtype ?? 'sport');
    setPic(program?.personInChargeId ?? '');
    setFee(program?.fee != null ? String(program.fee) : '');
    setExpire(program?.expireDate ?? '');
    setDescription(program?.description ?? '');
    setActive(program?.active ?? true);
  }, [open, program]);

  const picOptions: PickerOption[] = useMemo(
    () => employees.map(e => ({ value: e.id, label: e.name, secondary: e.empNo })), [employees]);

  const save = async () => {
    if (!name.trim()) { toast.error('Name the program'); return; }
    const feeNum = fee.trim() === '' ? null : Number(fee);
    if (feeNum != null && (!Number.isFinite(feeNum) || feeNum < 0)) { toast.error('Fee must be 0 or more'); return; }
    setSaving(true);
    try {
      const req = { name: name.trim(), subtype, personInChargeId: pic || null, fee: feeNum,
        expireDate: expire || null, description: description.trim() || null, active };
      if (program) await clubApi.update(program.id, req); else await clubApi.create(req);
      toast.success(program ? 'Program updated' : 'Program added');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the program');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit program' : 'Add program'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-gray-600">Name <span className="text-red-500">*</span></Label>
            <Input value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="e.g. Football Club, AI Masters" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Subtype</Label>
            <select className={selectCls} value={subtype} onChange={e => setSubtype(e.target.value)}>
              {CLUB_SUBTYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Fee / company subsidy ($)</Label>
            <Input inputMode="decimal" value={fee} placeholder="0.00" onChange={e => setFee(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-gray-600">Person in charge (approves requests)</Label>
            <SearchablePicker options={picOptions} value={pic} onChange={setPic} allowClear
              placeholder="Pick an employee" searchPlaceholder="Search name or ID…" />
            <p className="text-[11px] text-gray-500">Without one — or when they have no login — the applicant's manager approves.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Expire date</Label>
            <DateInput value={expire || null} onChange={v => setExpire(v ?? '')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Taking requests</Label>
            <div className="h-9 flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <span className="text-sm text-gray-600">{active ? 'Yes' : 'No'}</span>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-gray-600">Description</Label>
            <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {program ? 'Save changes' : 'Add program'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee: browse + apply ───────────────────────────────────────

/**
 * Profile → Clubs. The signed-in employee's own clubs (requests and
 * memberships) and the programs open to join. Applying sends the
 * request to the program's person in charge in Approvals.
 */
export function MyClubsPanel() {
  const { formatDate } = useDateFormat();
  const [programs, setPrograms] = useState<ClubProgram[]>([]);
  const [mine, setMine] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyTo, setApplyTo] = useState<ClubProgram | null>(null);
  const [role, setRole] = useState<'member' | 'leader'>('member');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([clubApi.list(true), clubApi.mine()]);
      setPrograms(p); setMine(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load clubs');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  // A program is taken while a request is pending or approved.
  const heldStatus = (programId: string) =>
    mine.find(r => r.programId === programId && (r.status === 'pending' || r.status === 'approved'))?.status;

  const send = async () => {
    if (!applyTo) return;
    setSending(true);
    try {
      await clubApi.requestToJoin(applyTo.id, role, note.trim() || undefined);
      toast.success(`Request sent — ${applyTo.personInChargeName ?? 'your manager'} will review it`);
      setApplyTo(null); setNote(''); setRole('member');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">My clubs</p>
        {mine.length === 0 ? (
          <p className="text-sm text-gray-400">{loading ? 'Loading…' : 'You have not joined any club yet.'}</p>
        ) : (
          <div className="space-y-1.5">
            {mine.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <Users className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{String(r.details.clubName ?? 'Club')}</p>
                  <p className="text-[11px] text-gray-500">
                    {subtypeLabel('club', r.subtype)} · {r.details.role === 'leader' ? 'Leader' : 'Member'}
                    {typeof r.details.expireDate === 'string' && ` · until ${formatDate(r.details.expireDate)}`}
                    {r.decidedByName && (r.status === 'approved' || r.status === 'rejected') && ` · by ${r.decidedByName}`}
                  </p>
                </div>
                <RecordStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Programs open to join</p>
        {programs.length === 0 ? (
          <p className="text-sm text-gray-400">{loading ? 'Loading…' : 'No programs are taking requests right now.'}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {programs.map(p => {
              const held = heldStatus(p.id);
              return (
                <div key={p.id} className="rounded-md border px-3 py-2.5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[11px] text-gray-500">{subtypeLabel('club', p.subtype)}{p.fee != null && p.fee > 0 ? ` · ${formatMoney(p.fee)}` : ''}</p>
                    </div>
                    {held ? (
                      <RecordStatusBadge status={held} />
                    ) : (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setApplyTo(p)}>Apply</Button>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-gray-600">{p.description}</p>}
                  <p className="flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" />{p.personInChargeName ?? 'Your manager'}</span>
                    {p.expireDate && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />until {formatDate(p.expireDate)}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{p.memberCount} member{p.memberCount === 1 ? '' : 's'}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!applyTo} onOpenChange={o => { if (!o) setApplyTo(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join {applyTo?.name}</DialogTitle>
            <DialogDescription>
              {applyTo?.personInChargeName ?? 'Your manager'} will review your request in Approvals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Role</Label>
              <select className={selectCls} value={role} onChange={e => setRole(e.target.value as 'member' | 'leader')}>
                <option value="member">Member</option>
                <option value="leader">Leader</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Note (optional)</Label>
              <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Why you'd like to join" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTo(null)} disabled={sending}>Cancel</Button>
            <Button onClick={() => void send()} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
