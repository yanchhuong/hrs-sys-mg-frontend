import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as purposesApi from '../../api/cashAdvancePurposes';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * Settings popup for the Cash Advance "Purpose" preset list.
 *
 * <p>The list feeds the dropdown in the New Advance dialog;
 * operators manage it here. Free-text purpose still works on the
 * advance itself — disabling a preset just hides it from the
 * picker, it doesn't break existing rows.</p>
 */
export function CashAdvancePurposesDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fires after any successful create / update / delete so the
   *  parent page can refresh its picker without a manual reload. */
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<purposesApi.CashAdvancePurpose[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await purposesApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load purposes');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      await purposesApi.create({ label });
      setNewLabel('');
      await load();
      onChanged?.();
      toast.success('Purpose added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  const renameRow = async (row: purposesApi.CashAdvancePurpose, label: string) => {
    if (label.trim() === row.label) return;
    setBusy(true);
    try {
      await purposesApi.update(row.id, { label: label.trim() });
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      await load();          // revert local edit on error
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: purposesApi.CashAdvancePurpose, enabled: boolean) => {
    setBusy(true);
    try {
      await purposesApi.update(row.id, { label: row.label, enabled });
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: purposesApi.CashAdvancePurpose) => {
    if (!(await confirm({
      title: `Delete "${row.label}" from the purpose list?`,
      message: 'Existing advances are not affected.',
      variant: 'destructive',
      confirmLabel: 'Delete',
    }))) return;
    setBusy(true);
    try {
      await purposesApi.remove(row.id);
      await load();
      onChanged?.();
      toast.success('Purpose deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cash Advance Purposes</DialogTitle>
        </DialogHeader>

        {/* Add-row form */}
        <div className="space-y-1">
          <Label className="text-xs">New purpose</Label>
          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void add(); }}
              placeholder="e.g. Site Visit, Workshop, Vendor Pickup"
            />
            <Button size="sm" onClick={() => void add()} disabled={busy || !newLabel.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Existing rows */}
        <div className="rounded-md border max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead className="w-[100px]">Enabled</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-gray-500 py-4">Loading…</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-gray-500 py-4">
                    No presets yet — add one above.
                  </TableCell>
                </TableRow>
              ) : rows.map(r => (
                <PurposeRow
                  key={r.id}
                  row={r}
                  disabled={busy}
                  onRename={label => void renameRow(r, label)}
                  onToggle={v => void toggle(r, v)}
                  onDelete={() => void remove(r)}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurposeRow({
  row, disabled, onRename, onToggle, onDelete,
}: {
  row: purposesApi.CashAdvancePurpose;
  disabled: boolean;
  onRename: (label: string) => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(row.label);
  // Sync local draft if the parent reloaded from the server.
  useEffect(() => setDraft(row.label), [row.label]);
  const dirty = draft.trim() !== row.label;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { if (dirty) onRename(draft); }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(row.label);
            }}
            className="h-8 text-sm"
            disabled={disabled}
          />
          {dirty && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onRename(draft)} title="Save">
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Switch checked={row.enabled} onCheckedChange={onToggle} disabled={disabled} />
      </TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" onClick={onDelete} disabled={disabled} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
