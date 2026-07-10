import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import * as coursesApi from '../../api/courses';

/**
 * V213 / v-course-schedule-model — Add-Staff-style modal for a
 * Course row. Course is the curriculum, e.g. "English Level 1".
 * The enrollable session (teacher + room + times + fee) lives on
 * Course Schedule.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: coursesApi.Course | null;
  onSaved: () => void;
}

const blank = { name: '', code: '', description: '' };

export function AddCourseDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? { name: editing.name, code: editing.code ?? '', description: editing.description ?? '' }
      : blank);
  }, [open, editing]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Course name is required'); return; }
    setSaving(true);
    try {
      const payload: coursesApi.CourseRequest = {
        name: form.name.trim(),
        code: form.code || null,
        description: form.description || null,
        active: true,
      };
      if (editing) {
        await coursesApi.update(editing.id, payload);
        toast.success('Course updated');
      } else {
        await coursesApi.create(payload);
        toast.success('Course created');
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New course'}</DialogTitle>
          <DialogDescription>
            A Course is the curriculum (e.g. "English Level 1"). Teacher, classroom,
            times, and fee belong on the Course Schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Course name<span className="text-red-500"> *</span>
            </Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. English Level 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Code</Label>
            <Input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              placeholder="e.g. ENG-L1"
              maxLength={64}
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
