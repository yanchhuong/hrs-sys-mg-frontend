/**
 * V-library-membership — Books list page.
 *
 * <p>Books are stored as {@code stock_items} rows with
 * {@code type='book'} on the BE (Path A of the ERP-primitive reuse).
 * The four form fields (title / author / ISBN / notes) map to the
 * base row's name / description / barcode / notes columns; the FE
 * doesn't need to know the underlying table.</p>
 *
 * <p>UI shape matches the Vendors / Members baseline —
 * page-header-strip + Card wrapper + filter-strip with Search + shadcn
 * Table + Pagination + tight space-y-1.5 dialog rhythm.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCw, BookOpen, Search, Info } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Card, CardContent, CardHeader } from '../../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../../ui/tooltip';
import * as library from '../../../api/library';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';

const EMPTY = { title: '', author: '', isbn: '', notes: '' };

export function Books() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<library.Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(b =>
      (b.title  ?? '').toLowerCase().includes(q)
      || (b.author ?? '').toLowerCase().includes(q)
      || (b.isbn   ?? '').toLowerCase().includes(q)
      || (b.notes  ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pagination = usePagination(filtered, 25);

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
    <div className="space-y-6">
      {/* Header — matches Members / Payment History page-header-strip
          pattern (icon-tile + title + refresh + new). */}
      <div className="page-header-strip">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-amber-100 text-amber-700 p-2"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h1 className="text-3xl font-bold">Books</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate('book') && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" /> New Book
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* v-library-filter-strip — Search only; no status /
              date-range dimensions matter for a static catalog. */}
          <div className="filter-strip">
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, author, ISBN, notes…"
                  className="h-8 pl-7 w-64 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {rows.length === 0 ? 'No books yet.' : 'No matches — try clearing the search.'}
            </p>
          ) : (
            <>
              {/* v-list-table-invoice-shape — border+scroll wrapper +
                  sticky header, same shell as Invoices / Quotations. */}
              <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-[inset_0_-1px_0_0_rgb(229,231,235)]">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>ISBN</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right w-[110px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell>{b.author ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{b.isbn ?? '—'}</TableCell>
                      <TableCell className="truncate max-w-[280px]">{b.notes ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          {canUpdate('book') && (
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete('book') && (
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void remove(b)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              {pagination.totalPages > 1 && (
                <div className="px-1 py-0 border-t">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={pagination.startIndex}
                    endIndex={pagination.endIndex}
                    totalItems={pagination.totalItems}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? 'Edit Book' : 'New Book'}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"
                            className="text-gray-400 hover:text-gray-600 cursor-help"
                            aria-label="What this form does">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Stored as a stock item with type='book' — reuses the ERP catalog primitive so books plug into the Activity picker without a separate table.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Author</Label>
              <Input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ISBN</Label>
              <Input value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} />
            </div>
            <div className="space-y-1.5">
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
