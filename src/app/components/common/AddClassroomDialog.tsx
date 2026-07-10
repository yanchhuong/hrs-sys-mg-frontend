import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import * as classroomsApi from '../../api/classrooms';

/**
 * V213 / v-course-schedule-model — Add-Staff-style modal for a
 * Classroom row. Classroom is a physical room (e.g. "Room A").
 * Time slots + capacity live on the Course Schedule that books the
 * room.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: classroomsApi.Classroom | null;
  onSaved: () => void;
}

const blank = { name: '', description: '' };

export function AddClassroomDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? { name: editing.name, description: editing.description ?? '' }
      : blank);
  }, [open, editing]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Classroom name is required'); return; }
    setSaving(true);
    try {
      const payload: classroomsApi.ClassroomRequest = {
        name: form.name.trim(),
        description: form.description || null,
        active: true,
      };
      if (editing) {
        await classroomsApi.update(editing.id, payload);
        toast.success('Classroom updated');
      } else {
        await classroomsApi.create(payload);
        toast.success('Classroom created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save classroom');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New classroom'}</DialogTitle>
          <DialogDescription>
            A Classroom is a physical room (e.g. "Room A"). Capacity and time slots
            belong on the Course Schedule that books it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Classroom name<span className="text-red-500"> *</span>
            </Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Room A"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
