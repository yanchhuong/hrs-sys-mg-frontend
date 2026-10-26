import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Check, X, Search as SearchIcon, ShieldAlert, Loader2, RotateCcw, Sparkles, CalendarCheck, UserPlus,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { DateInput } from './DateInput';
import { SearchablePicker, type PickerOption } from './SearchablePicker';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ListEmpty, ListError } from './ListStates';
import { TableBodySkeletonRows } from './LoadingSkeletons';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { statusBadgeClass } from '../../utils/statusTones';
import { formatMoney } from '../../utils/format';
import * as recordsApi from '../../api/employeeRecords';
import * as usersApi from '../../api/users';
import { ApproverChainPicker } from './ApproverChainPicker';
import type { RecordType, EmployeeRecord } from '../../api/employeeRecords';
import {
  RECORD_TYPES, RECORD_TYPE_ORDER, STATUS_LABEL, WELFARE_APPROVAL_THRESHOLD, APPROVABLE_TYPES,
  RECORD_GROUPS, GROUP_CHIP, groupOf, isMedicalType, nextStatuses, subtypeLabel, summarize,
} from './employeeRecordTypes';

/** The ✨ / calendar mark before a record's details: made automatically
 *  from an employee change, or from an approved leave. */
export function RecordSourceMark({ source }: { source: EmployeeRecord['source'] }) {
  if (source === 'auto') {
    return <span title="Added automatically from an employee change"><Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0" /></span>;
  }
  if (source === 'leave') {
    return <span title="Added from an approved leave"><CalendarCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" /></span>;
  }
  if (source === 'request') {
    return <span title="Requested by the employee"><UserPlus className="h-3.5 w-3.5 text-emerald-500 shrink-0" /></span>;
  }
  return null;
}

const selectCls =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Badges ──────────────────────────────────────────────────────────

export function RecordTypeChip({ type, subtype }: { type: RecordType; subtype?: string }) {
  const meta = RECORD_TYPES[type];
  return (
    <span className="inline-flex flex-col min-w-0">
      <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta?.chip ?? ''}`}>
        {meta?.label ?? type}
      </span>
      {subtype && <span className="text-[11px] text-gray-500 mt-0.5">{subtypeLabel(type, subtype)}</span>}
    </span>
  );
}

export function RecordStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusBadgeClass(status)}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ─── Row actions (status moves + edit + delete) ─────────────────────

const MOVE_LABEL: Record<string, string> = {
  investigating: 'Start investigation', closed: 'Close case', open: 'Reopen case',
  approved: 'Approve', rejected: 'Reject', pending: 'Reopen',
};

export function RecordRowActions({ rec, onChanged, onEdit }: {
  rec: EmployeeRecord;
  onChanged: () => void;
  onEdit: (rec: EmployeeRecord) => void;
}) {
  const { canUpdate, canDelete } = useAuth();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  // A record somebody is waiting on is decided in Approvals, not
  // here — the server refuses it either way. Any pending record with
  // a named approver qualifies, not just a Join Club application:
  // Promoted and Welfare get a chain too when one was chosen.
  const awaitingApprovals = rec.status === 'pending'
    && (rec.source === 'request' || !!rec.hasPendingApproval);
  const moves = canUpdate('employee_records') && !awaitingApprovals ? nextStatuses(rec.recordType, rec.status) : [];

  const move = async (to: string) => {
    if (to === 'rejected' && !(await confirm({
      title: 'Reject this record?', message: 'It stays on file as Rejected; you can reopen it later.',
      variant: 'destructive', confirmLabel: 'Reject',
    }))) return;
    setBusy(to);
    try {
      await recordsApi.setStatus(rec.id, to);
      toast.success(`${RECORD_TYPES[rec.recordType].label}: ${STATUS_LABEL[to] ?? to}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the status');
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    if (!(await confirm({
      title: 'Delete this record?',
      message: `${RECORD_TYPES[rec.recordType].label} · ${subtypeLabel(rec.recordType, rec.subtype)} will be removed for good.`,
      variant: 'destructive', confirmLabel: 'Delete',
    }))) return;
    setBusy('delete');
    try {
      await recordsApi.remove(rec.id);
      toast.success('Record deleted');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const icon = (to: string) =>
    to === 'approved' ? <Check className="h-3.5 w-3.5" />
      : to === 'rejected' ? <X className="h-3.5 w-3.5" />
      : to === 'investigating' ? <SearchIcon className="h-3.5 w-3.5" />
      : to === 'closed' ? <Check className="h-3.5 w-3.5" />
      : <RotateCcw className="h-3.5 w-3.5" />;
  const tone = (to: string) =>
    to === 'approved' || to === 'closed' ? 'text-emerald-600 hover:bg-emerald-50'
      : to === 'rejected' ? 'text-red-600 hover:bg-red-50'
      : to === 'investigating' ? 'text-amber-600 hover:bg-amber-50'
      : 'text-slate-500 hover:bg-slate-100';

  return (
    <div className="flex items-center justify-end gap-0.5">
      {awaitingApprovals && (
        <span className="text-[11px] text-gray-500 mr-1 whitespace-nowrap" title="The program's person in charge decides it in Approvals">In Approvals</span>
      )}
      {moves.map(to => (
        <Button key={to} variant="ghost" size="icon" className={`h-7 w-7 ${tone(to)}`}
          title={MOVE_LABEL[to] ?? to} aria-label={MOVE_LABEL[to] ?? to}
          disabled={!!busy} onClick={() => void move(to)}>
          {busy === to ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon(to)}
        </Button>
      ))}
      {canUpdate('employee_records') && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50"
          title="Edit" aria-label="Edit record" disabled={!!busy} onClick={() => onEdit(rec)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {canDelete('employee_records') && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50"
          title="Delete" aria-label="Delete record" disabled={!!busy} onClick={() => void del()}>
          {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

// ─── Add / edit dialog ──────────────────────────────────────────────

export interface RecordEmployeeOption { id: string; name: string; empNo?: string }

export function RecordFormDialog({ open, onOpenChange, record, employeeId, employees, defaultType, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this record; null = add. */
  record: EmployeeRecord | null;
  /** Fixed employee (the details drawer). Otherwise pick from `employees`. */
  employeeId?: string;
  employees?: RecordEmployeeOption[];
  defaultType?: RecordType;
  onSaved: (rec: EmployeeRecord) => void;
}) {
  const { canUpdate, currentUser } = useAuth();
  const [empId, setEmpId] = useState('');
  const [type, setType] = useState<RecordType>('accident');
  const [subtype, setSubtype] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Ordered approver user ids; '' is a row added but not yet picked.
  const [approvers, setApprovers] = useState<string[]>(['']);
  const [users, setUsers] = useState<usersApi.User[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = record?.recordType ?? defaultType ?? 'accident';
    setEmpId(record?.employeeId ?? employeeId ?? '');
    setType(t);
    setSubtype(record?.subtype ?? RECORD_TYPES[t].subtypes[0].value);
    setDate(record?.recordDate ?? today());
    setAmount(record?.amount != null ? String(record.amount) : '');
    setDetails(record?.details ?? {});
    setNotes(record?.notes ?? '');
  }, [open, record, employeeId, defaultType]);

  // Candidates for the approver picker. Only while the dialog is
  // open and only for the types that can have one, so opening an
  // Accident form does not go and fetch the user list.
  useEffect(() => {
    if (!open || record || !APPROVABLE_TYPES.has(type) || users.length) return;
    let cancelled = false;
    void usersApi.list({ size: 500 })
      .then(res => { if (!cancelled) setUsers(res.data ?? []); })
      .catch(() => { /* the picker just offers nobody */ });
    return () => { cancelled = true; };
  }, [open, record, type, users.length]);

  const meta = RECORD_TYPES[type];
  const restricted = !!record?.restricted || !canUpdate('employee_records');
  const fields = meta.fields.filter(f => !(f.medical && restricted));
  const amountNum = amount.trim() === '' ? null : Number(amount);

  const employeeOptions: PickerOption[] = useMemo(
    () => (employees ?? []).map(e => ({ value: e.id, label: e.name, secondary: e.empNo })),
    [employees]);

  const changeType = (t: RecordType) => {
    setType(t);
    setSubtype(RECORD_TYPES[t].subtypes[0].value);
    setDetails({});
    setAmount('');
  };

  const setField = (k: string, v: unknown) => setDetails(d => ({ ...d, [k]: v }));

  /** The three somebody can be asked to sign off. Accident, sick and
   *  ceremony are a thing that happened, not a thing being asked for. */
  const canChooseApprover = !record && APPROVABLE_TYPES.has(type);
  const chosenApprovers = approvers.filter(Boolean);

  // Without a named approver the type's own rule still applies —
  // promotions and larger welfare payments land as Pending for HR to
  // work on the Records page, as they did before this form could ask.
  const willNeedApproval = !record && chosenApprovers.length === 0 && (
    type === 'promoted'
    || (type === 'welfare' && (amountNum ?? 0) > WELFARE_APPROVAL_THRESHOLD)
    || (type === 'club' && (amountNum ?? 0) > 0));

  const save = async () => {
    if (!empId) { toast.error('Pick an employee'); return; }
    if (!date) { toast.error('Pick a date'); return; }
    if (amountNum != null && (!Number.isFinite(amountNum) || amountNum < 0)) { toast.error('Amount must be 0 or more'); return; }
    if (type === 'welfare' && amountNum == null) { toast.error('Enter the welfare amount'); return; }
    setSaving(true);
    try {
      const req: recordsApi.EmployeeRecordRequest = {
        employeeId: empId, recordType: type, subtype, recordDate: date,
        amount: meta.amountLabel ? amountNum : null,
        details, notes: notes.trim() || null,
        // Create only — the server ignores it on update, and changing
        // the approver of a chain already under way is not something
        // this form can do coherently.
        ...(record ? {} : { approverUserIds: approvers.filter(Boolean).length ? approvers.filter(Boolean) : undefined }),
      };
      const saved = record ? await recordsApi.update(record.id, req) : await recordsApi.create(req);
      toast.success(record ? 'Record updated' : `${meta.label} recorded`
        + (!record && saved.status === 'pending' ? ' — waiting for approval' : ''));
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${meta.label} record` : 'Add record'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!employeeId && !record && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Employee <span className="text-red-500">*</span></Label>
              <SearchablePicker options={employeeOptions} value={empId} onChange={setEmpId}
                placeholder="Pick an employee" searchPlaceholder="Search name or ID…" />
            </div>
          )}

          {/* Type — fixed once saved: the status hangs off it. */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Record type</Label>
            {/* Grouped and coloured by where the record comes from. */}
            <div className="flex flex-wrap gap-x-4 gap-y-2" role="radiogroup" aria-label="Record type">
              {RECORD_GROUPS.map(g => (
                <div key={g.key} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400" title={g.hint}>{g.label}</p>
                  <div className="flex gap-1.5">
                    {g.types.map(t => {
                      const on = t === type;
                      return (
                        <button key={t} type="button" role="radio" aria-checked={on}
                          disabled={!!record && !on}
                          onClick={() => !record && changeType(t)}
                          className={`px-3 h-8 rounded-full border text-sm transition-colors ${on
                            ? GROUP_CHIP[g.key] + ' font-medium ring-1 ring-current/30'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent'}`}>
                          {RECORD_TYPES[t].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">{meta.approvalHint}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Subtype</Label>
              <select className={selectCls} value={subtype} onChange={e => setSubtype(e.target.value)}>
                {meta.subtypes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Date <span className="text-red-500">*</span></Label>
              <DateInput value={date || null} onChange={v => setDate(v ?? '')} clearable={false} />
            </div>

            {meta.amountLabel && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">
                  {meta.amountLabel} {type === 'welfare' && <span className="text-red-500">*</span>}
                </Label>
                <Input inputMode="decimal" value={amount} placeholder="0.00"
                  onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
            )}

            {fields.map(f => (
              <div key={f.key} className={`space-y-1.5 ${f.kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <Label className="text-xs text-gray-600">{f.label}</Label>
                {f.kind === 'select' ? (
                  <select className={selectCls} value={String(details[f.key] ?? '')}
                    onChange={e => setField(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.kind === 'date' ? (
                  <DateInput value={(details[f.key] as string) || null} onChange={v => setField(f.key, v ?? '')} />
                ) : f.kind === 'bool' ? (
                  <div className="h-9 flex items-center gap-2">
                    <Switch checked={details[f.key] === true} onCheckedChange={v => setField(f.key, v)} />
                    <span className="text-sm text-gray-600">{details[f.key] === true ? 'Yes' : 'No'}</span>
                  </div>
                ) : f.kind === 'textarea' ? (
                  <Textarea rows={2} value={String(details[f.key] ?? '')} onChange={e => setField(f.key, e.target.value)} />
                ) : (
                  <Input
                    type={f.kind === 'time' ? 'time' : 'text'}
                    inputMode={f.kind === 'number' ? 'numeric' : undefined}
                    placeholder={f.placeholder}
                    value={String(details[f.key] ?? '')}
                    onChange={e => setField(f.key, f.kind === 'number'
                      ? (e.target.value.replace(/\D/g, '') === '' ? '' : Number(e.target.value.replace(/\D/g, '')))
                      : e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          {isMedicalType(type) && restricted && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <ShieldAlert className="h-3.5 w-3.5" /> Medical details ({type === 'accident' ? 'injury, body part, lost days, NSSF claim' : 'diagnosis'} and the leave reason) are visible to HR only.
            </p>
          )}

          {/* From an approved leave: what the leave said, read-only. */}
          {record?.source === 'leave' && (
            <div className="rounded-md border bg-blue-50/50 border-blue-100 px-3 py-2 text-xs text-gray-700 space-y-0.5">
              <p className="flex items-center gap-1.5 font-medium text-blue-700">
                <CalendarCheck className="h-3.5 w-3.5" /> From an approved leave
                {details.leaveDays != null && <span className="font-normal text-gray-600">· {String(details.leaveDays)} day{String(details.leaveDays) === '1' ? '' : 's'}</span>}
              </p>
              {typeof details.leaveReason === 'string' && details.leaveReason && (
                <p className="whitespace-pre-wrap"><span className="text-gray-500">Reason: </span>{details.leaveReason}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Notes</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {type === 'accident' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Photos</Label>
              <AttachmentsPanel docType="employee_records" docId={record?.id ?? null}
                readOnly={!canUpdate('employee_records')} />
            </div>
          )}

          {canChooseApprover && (
            <ApproverChainPicker
              value={approvers}
              onChange={setApprovers}
              candidates={users.filter(u => u.isActive && u.id !== currentUser?.id)}
              noun={meta.label.toLowerCase()}
            />
          )}

          {willNeedApproval && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This record will be saved as Pending until HR approves it.
            </p>
          )}
          {canChooseApprover && chosenApprovers.length > 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              Saved as Pending and sent to {chosenApprovers.length === 1 ? 'that approver' : 'those approvers'} in Approvals.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {record ? 'Save changes' : 'Add record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee Details → Records tab ─────────────────────────────────

/**
 * One employee's records, newest first. The drawer body already
 * scrolls, so the table is `.list-table-flow` — a capped box inside a
 * scrolling pane would nest two scrollers.
 */
export function EmployeeRecordsPanel({ employeeId, onCount }: {
  employeeId: string;
  /** Reports the row count for the tab badge. */
  onCount?: (n: number) => void;
}) {
  const { canCreate } = useAuth();
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<RecordType | ''>('');
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await recordsApi.list({ employeeId, size: 200 });
      setRows(res.data);
      onCount?.(res.totalElements);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [employeeId]);

  const shown = typeFilter ? rows.filter(r => r.recordType === typeFilter) : rows;
  const countOf = (t: RecordType) => rows.filter(r => r.recordType === t).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x">
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setTypeFilter('')}
            className={`px-2.5 h-7 rounded-full border text-xs shrink-0 ${typeFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            All {rows.length}
          </button>
          {RECORD_TYPE_ORDER.map((t, i) => (
            <span key={t} className="contents">
              {/* A thin divider where the group changes. */}
              {i > 0 && groupOf(RECORD_TYPE_ORDER[i - 1]) !== groupOf(t) && <span className="w-px h-4 bg-gray-200 shrink-0" />}
              <button type="button" onClick={() => setTypeFilter(t)}
                className={`px-2.5 h-7 rounded-full border text-xs shrink-0 ${typeFilter === t ? RECORD_TYPES[t].chip + ' font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {RECORD_TYPES[t].label} {countOf(t)}
              </button>
            </span>
          ))}
        </div>
        {canCreate('employee_records') && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add record
          </Button>
        )}
      </div>

      <ListTable className="list-table-flow">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right w-36">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 ? (
            <TableBodySkeletonRows rows={3} columns={6} />
          ) : error && rows.length === 0 ? (
            <ListError colSpan={6} message={error} onRetry={() => void load()} />
          ) : shown.length === 0 ? (
            <ListEmpty colSpan={6} noun="records" filtered={!!typeFilter} />
          ) : shown.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-sm">{formatDate(r.recordDate)}</TableCell>
              <TableCell><RecordTypeChip type={r.recordType} subtype={r.subtype} /></TableCell>
              <TableCell className="text-sm text-gray-700 whitespace-normal min-w-[180px]">
                <span className="inline-flex items-center gap-1.5">
                  <RecordSourceMark source={r.source} />
                  {summarize(r.recordType, r.details) || <span className="text-gray-400">—</span>}
                </span>
                {r.restricted && <ShieldAlert className="inline h-3.5 w-3.5 ml-1 text-gray-400" aria-label="Medical details hidden" />}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">{r.amount != null ? formatMoney(r.amount) : '—'}</TableCell>
              <TableCell>
                <RecordStatusBadge status={r.status} />
                {r.decidedByName && (r.status === 'approved' || r.status === 'rejected') && (
                  <p className="text-[11px] text-gray-500 mt-0.5">by {r.decidedByName}</p>
                )}
              </TableCell>
              <TableCell>
                <RecordRowActions rec={r} onChanged={() => void load()}
                  onEdit={rec => { setEditing(rec); setFormOpen(true); }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </ListTable>

      <RecordFormDialog open={formOpen} onOpenChange={setFormOpen} record={editing}
        employeeId={employeeId} defaultType={typeFilter || undefined}
        onSaved={() => void load()} />
    </div>
  );
}
