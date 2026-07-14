import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Save, Trash2 } from 'lucide-react';
import * as tasksApi from '../../../api/agencyTasks';
import type { TaskDto, TaskPriority } from '../../../api/agencyTasks';
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

/**
 * v-agency-fe-6 — one dialog for both create and edit. Populated
 * from the task prop when editing; blank fields when creating.
 * Assignee picker is deferred to a later polish turn — for now
 * the field is free-text UUID (or blank for unassigned) since
 * we don't have an agency-users-picker component yet.
 */
export function TaskDialog({ open, onOpenChange, task, defaultTenantId, onSaved }: Props) {
  const { portfolio } = useAgencyClient();
  const editing = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tenantId, setTenantId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset / seed on open.
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setTenantId(task.tenantId ?? '');
      setPriority(task.priority);
      setDueDate(task.dueDate ?? '');
    } else {
      setTitle('');
      setDescription('');
      setTenantId(defaultTenantId ?? '');
      setPriority('normal');
      setDueDate('');
    }
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
      };
      if (editing && task) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Change any field; changes save when you click Save.'
              : 'Optionally scope to one client. Leave client blank for a portfolio-wide task.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-9 text-sm mt-1"
              maxLength={255}
              placeholder="What needs doing?"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="text-sm mt-1"
              placeholder="Optional context, links, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Client</div>
              <Select value={tenantId || '__portfolio'} onValueChange={v => setTenantId(v === '__portfolio' ? '' : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__portfolio">Portfolio-wide</SelectItem>
                  {portfolio.map(c => (
                    <SelectItem key={c.tenantId} value={c.tenantId}>
                      {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Priority</div>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="normal">normal</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div>
            <Label className="text-xs">Due date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="h-9 text-sm mt-1 w-40"
            />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {editing && (
            <Button
              variant="outline"
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
              onClick={doDelete}
              disabled={deleting || saving}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
