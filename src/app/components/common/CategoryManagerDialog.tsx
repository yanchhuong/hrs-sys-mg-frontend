/**
 * CategoryManagerDialog — v-category-order. Put the item categories in
 * the company's order and rename them, from the item form's Category
 * "Edit". The web twin of the mobile CategoryManagerSheet: same rows,
 * same rules, same server calls.
 *
 * It manages the list the field offers: every category for a Fixed
 * Price item, the types for a Market Based one. The server keeps one
 * order for all categories; saving a narrowed list reorders just those,
 * in the places they held.
 *
 *   ↑ ↓   move a row (saved with "Save order")
 *   ✎     rename it at once: every item in it follows. A name already
 *         in use asks first, since the two become one.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpDown, Check, ChevronDown, ChevronUp, Loader2, Pencil, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useConfirm } from '../../context/ConfirmContext';
import * as itemsApi from '../../api/items';
import { categoryKey, moveAt, sameOrder } from '../../utils/categoryOrder';

export interface CategoryRename { from: string; to: string }

export function CategoryManagerDialog({ open, names, onClose, onChanged }: {
  open: boolean;
  /** The categories as the field offers them, in their current order. */
  names: string[];
  onClose: () => void;
  /** After a save: reload the lists; `renamed` when a name changed. */
  onChanged: (renamed?: CategoryRename) => void;
}) {
  const confirm = useConfirm();
  const [list, setList] = useState<string[]>(names);
  const [saved, setSaved] = useState<string[]>(names);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);   // 'order' or the row being renamed
  const wasOpen = useRef(false);
  const dirty = !sameOrder(list, saved);

  // A fresh copy each time it opens; while open, a reloaded list only
  // comes in when nothing is unsaved.
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (opening || (open && !dirty && !editing && !busy)) {
      setList(names);
      setSaved(names);
      if (opening) { setEditing(null); setDraft(''); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, names]);

  const close = async () => {
    if (busy) return;
    if (dirty && !(await confirm({ title: 'Leave without saving the order?', confirmLabel: 'Leave' }))) return;
    onClose();
  };

  const saveOrder = async () => {
    setBusy('order');
    try {
      await itemsApi.saveCategoryOrder(list);
      setSaved(list);
      toast.success('Order saved');
      onChanged();
    } catch (e) {
      toast.error("Couldn't save the order", { description: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const saveRename = async (from: string) => {
    const to = draft.trim();
    if (!to) { toast.error('Enter a name.'); return; }
    if (categoryKey(to) === categoryKey(from)) { setEditing(null); return; }
    const taken = list.find(n => n !== from && categoryKey(n) === categoryKey(to));
    if (taken && !(await confirm({
      title: `“${taken}” already exists`,
      message: `Move every item in “${from}” into “${taken}”? They become one category.`,
      confirmLabel: 'Merge',
    }))) return;
    setBusy(from);
    try {
      const r = await itemsApi.renameCategory(from, to);
      const apply = (l: string[]) => (r.merged ? l.filter(n => n !== from) : l.map(n => (n === from ? r.name : n)));
      setList(apply);
      setSaved(apply);
      setEditing(null);
      toast.success(r.merged ? `Merged into “${r.name}”` : `Renamed to “${r.name}”`, {
        description: `${r.items} ${r.items === 1 ? 'item' : 'items'} updated`,
      });
      onChanged({ from, to: r.name });
    } catch (e) {
      toast.error("Couldn't rename", { description: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const last = list.length - 1;
  const iconBtn = 'h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white '
    + 'text-gray-700 hover:bg-gray-50 disabled:opacity-35 disabled:hover:bg-white';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) void close(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>Use the arrows to set the order. Rename one, and every item in it follows.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {list.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">No categories yet. One appears here once an item has it.</p>
          )}
          {list.map((name, i) => (
            <div key={name}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[48px] ${
                editing === name ? 'border-blue-600' : 'border-gray-200'}`}>
              <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400">{i + 1}</span>
              {editing === name ? (
                <>
                  <Input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); void saveRename(name); }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                    }}
                    maxLength={64}
                    aria-label="New name"
                    className="h-8 flex-1 min-w-0"
                  />
                  <button type="button" className={`${iconBtn} border-blue-700 bg-blue-700 text-white hover:bg-blue-800`}
                    title="Save" aria-label="Save" disabled={busy === name} onClick={() => void saveRename(name)}>
                    {busy === name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button type="button" className={iconBtn} title="Cancel" aria-label="Cancel"
                    disabled={busy === name} onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 break-words text-sm font-semibold text-gray-900">{name}</span>
                  <button type="button" className={iconBtn} title="Move up" aria-label="Move up"
                    disabled={i === 0 || !!busy} onClick={() => setList(l => moveAt(l, i, -1))}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconBtn} title="Move down" aria-label="Move down"
                    disabled={i === last || !!busy} onClick={() => setList(l => moveAt(l, i, 1))}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button type="button" className={`${iconBtn} text-blue-700`} title="Rename" aria-label="Rename"
                    disabled={!!busy || !!editing} onClick={() => { setEditing(name); setDraft(name); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-white shrink-0">
          <Button variant="outline" onClick={() => void close()} disabled={!!busy}>Close</Button>
          <Button onClick={() => saveOrder()} disabled={!dirty || (!!busy && busy !== 'order')}>
            <ArrowUpDown className="h-4 w-4 mr-1.5" /> Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
