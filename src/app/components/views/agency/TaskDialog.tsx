import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Save, Trash2, Calendar, User2, Flag, Building2, CircleDot } from 'lucide-react';
import * as tasksApi from '../../../api/agencyTasks';
import type { TaskDto, TaskPriority, TaskStatus, AgencyMember } from '../../../api/agencyTasks';
import { useAgencyClient } from '../../../context/AgencyClientContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present → edit mode; null → create mode. */
  task: TaskDto | null;
  /** Pre-selected client for a new task (from the page context). */
  defaultTenantId?: string | null;
  onSaved?: () => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; cls: string }> = [
  { value: 'todo',        label: 'To do',       cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'in_progress', label: 'In progress', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'blocked',     label: 'Blocked',     cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  { value: 'done',        label: 'Done',        cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = STATUS_OPTIONS.reduce(
  (acc, o) => { acc[o.value] = { label: o.label, cls: o.cls }; return acc; },
  {} as Record<TaskStatus, { label: string; cls: string }>,
);

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low',    label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/**
 * v-agency-fe-6 + v-task-dialog-compact — one dialog for both
 * create and edit. Compact meta rows (Status / Assignee / Client /
 * Priority / Due date) sit under a large borderless title input,
 * with the description block below. On edit the status pill flips
 * the task's state without saving (POST /status) — the four-eyes
 * rule doesn't apply to internal todos so the transition is direct.
 */
export function TaskDialog({ open, onOpenChange, task, defaultTenantId, onSaved }: Props) {
  const { portfolio } = useAgencyClient();
  const editing = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tenantId, setTenantId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Reset / seed on open + lazy-load members for the assignee picker.
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setTenantId(task.tenantId ?? '');
      setPriority(task.priority);
      setStatus(task.status);
      setAssigneeId(task.assigneeAgencyUserId ?? '');
      setDueDate(task.dueDate ?? '');
    } else {
      setTitle('');
      setDescription('');
      setTenantId(defaultTenantId ?? '');
      setPriority('normal');
      setStatus('todo');
      setAssigneeId('');
      setDueDate('');
    }
    setMembersLoading(true);
    tasksApi.members.list()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [open, task, defaultTenantId]);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        tenantId: tenantId || null,
        priority,
        dueDate: dueDate || null,
        assigneeAgencyUserId: assigneeId || null,
      };
      if (editing && task) {
        // Status transitions live on a separate endpoint — fire it
        // first if the user flipped the pill in the dialog, then
        // save the rest of the body.
        if (status !== task.status) {
          await tasksApi.tasks.setStatus(task.id, status);
        }
        await tasksApi.tasks.update(task.id, payload);
        toast.success('Task updated');
      } else {
        await tasksApi.tasks.create(payload);
        toast.success('Task created');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!task) return;
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await tasksApi.tasks.del(task.id);
      toast.success('Task deleted');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const statusMeta = STATUS_META[status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base font-semibold">Task</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? 'Update this task.' : 'Create a new internal task.'}
          </DialogDescription>
        </DialogHeader>

        {/* Subject moved into the body per the operator spec — the
            popup's title bar carries just "Task"; the actual subject
            input sits below with breathing room around it. */}
        <div className="px-5 pt-4 pb-3">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-10 text-base font-medium"
            maxLength={255}
            placeholder={editing ? 'Task title' : 'Enter a title…'}
            autoFocus={!editing}
          />
        </div>

        {/* Meta grid — compact rows with left-label + right-selector.
            Each row is a Status/Assignee/Client/Priority/Due date. */}
        <div className="px-5 py-4 space-y-2 border-t border-b bg-gray-50/40">
          <MetaRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
            <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
              <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-gray-100 rounded-md w-auto min-w-32">
                <Badge className={`border ${statusMeta.cls} text-[10px] px-1.5 py-0 mr-1`}>
                  {statusMeta.label}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  // Render each option AS the same pill the trigger
                  // shows — so the dropdown reads like a colour picker
                  // rather than plain text labels.
                  <SelectItem key={s.value} value={s.value}>
                    <Badge className={`border ${s.cls} text-[10px] px-1.5 py-0`}>
                      {s.label}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={<User2 className="h-3.5 w-3.5" />} label="Assignee">
            <Select value={assigneeId || '__unassigned'} onValueChange={v => setAssigneeId(v === '__unassigned' ? '' : v)}>
              <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-gray-100 rounded-md w-auto min-w-48 text-sm">
                <SelectValue placeholder={membersLoading ? 'Loading…' : 'Add assignee'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned">Unassigned</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                    <span className="text-[10px] text-gray-500 ml-1">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={<Building2 className="h-3.5 w-3.5" />} label="Client">
            <Select value={tenantId || '__portfolio'} onValueChange={v => setTenantId(v === '__portfolio' ? '' : v)}>
              <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-gray-100 rounded-md w-auto min-w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__portfolio">Portfolio-wide</SelectItem>
                {portfolio.map(c => (
                  <SelectItem key={c.tenantId} value={c.tenantId}>
                    {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
            <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
              <SelectTrigger className="h-8 border-0 bg-transparent shadow-none focus:ring-0 px-2 hover:bg-gray-100 rounded-md w-auto min-w-24 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={<Calendar className="h-3.5 w-3.5" />} label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 hover:bg-gray-100 rounded-md px-2 w-44 text-sm"
            />
          </MetaRow>
        </div>

        {/* Description — normal bordered textarea with the same
            breathing room as the subject input above. */}
        <div className="px-5 pt-4 pb-3">
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            placeholder="Start writing here…"
          />
        </div>

        <div className="px-5 py-3 border-t bg-white flex items-center justify-between gap-2 flex-wrap">
          {editing ? (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
              onClick={doDelete}
              disabled={deleting || saving}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm min-h-8">
      <div className="w-28 shrink-0 inline-flex items-center gap-2 text-xs text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
