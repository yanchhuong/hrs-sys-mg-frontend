/**
 * V-library-membership — Books list page.
 *
 * <p>Books are stored as {@code stock_items} rows with
 * {@code type='book'} on the BE (Path A of the ERP-primitive reuse).
 * The four form fields (title / author / ISBN / notes) map to the
 * base row's name / description / barcode / notes columns; the FE
 * doesn't need to know the underlying table.</p>
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCcw, BookOpen } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '../../ui/dialog';
import * as library from '../../../api/library';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';

const EMPTY = { title: '', author: '', isbn: '', notes: '' };

export function Books() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<library.Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await library.books.list()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (b: library.Book) => {
    setEditingId(b.id);
    setForm({
      title: b.title ?? '',
      author: b.author ?? '',
      isbn: b.isbn ?? '',
      notes: b.notes ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const payload: library.BookInput = {
        title: form.title.trim(),
        author: form.author || undefined,
        isbn: form.isbn || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) await library.books.update(editingId, payload);
      else            await library.books.create(payload);
      toast.success(editingId ? 'Book updated' : 'Book added');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (b: library.Book) => {
    const ok = await confirm({
      title: 'Delete book?',
      message: `"${b.title}" will be removed permanently.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try { await library.books.remove(b.id); toast.success('Book deleted'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-amber-100 text-amber-700 p-2"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold">Books</h1>
            <p className="text-sm text-gray-600">{rows.length} title{rows.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canCreate('book') && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> New Book
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Author</th>
                <th className="px-3 py-2 text-left">ISBN</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{b.title}</td>
                  <td className="px-3 py-2">{b.author ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.isbn ?? '—'}</td>
                  <td className="px-3 py-2 truncate max-w-[280px]">{b.notes ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {canUpdate('book') && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete('book') && (
                      <Button variant="ghost" size="icon" onClick={() => void remove(b)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">No books yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Book' : 'New Book'}</DialogTitle>
            <DialogDescription>
              Stored as a stock item with type='book' — reuses the ERP catalog primitive.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Author</Label>
              <Input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            </div>
            <div>
              <Label>ISBN</Label>
              <Input value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Book'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
