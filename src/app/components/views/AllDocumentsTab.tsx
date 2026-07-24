import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Search, Download, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import * as documentsApi from '../../api/documents';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useAuth } from '../../context/AuthContext';
import { EXT_CHIP_CLASS, chipLabelOf, extOf, familyOf } from './documentExtension';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';

/**
 * "All Documents" tab on the Employees page. Tenant-wide listing of
 * every uploaded employee document with search, type filter, sort,
 * pagination, and per-row download/delete. Lighter-weight than a
 * dedicated page since the user is already in the employees context;
 * we just surface the same data joined with the employee row.
 *
 * Permission model:
 *   - Listing is gated by employees:view on the backend (same gate
 *     as the roster itself).
 *   - Delete is gated by employees:delete server-side; we hide the
 *     trash icon when the user lacks the grant.
 *   - Upload still happens per-employee from the Details sheet; no
 *     bulk-upload entry-point here to keep the UI focused on read +
 *     download.
 */

const TYPE_OPTIONS: ReadonlyArray<{ value: documentsApi.EmployeeDocumentType | 'all'; label: string }> = [
  { value: 'all',         label: 'All types' },
  { value: 'contract',    label: 'Contract' },
  { value: 'id_card',     label: 'ID Card' },
  { value: 'passport',    label: 'Passport' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'resume',      label: 'Resume' },
  { value: 'tax_form',    label: 'Tax Form' },
  { value: 'other',       label: 'Other' },
];

const TYPE_LABEL: Record<string, string> = TYPE_OPTIONS.reduce((acc, o) => {
  if (o.value !== 'all') acc[o.value] = o.label;
  return acc;
}, {} as Record<string, string>);

/** Human-readable file size. Server reports bytes; HR thinks in KB / MB. */
function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024)        return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

type SortKey = 'uploadedAt' | 'employeeName' | 'name' | 'type' | 'sizeBytes';
type SortDir = 'asc' | 'desc';

export function AllDocumentsTab() {
  const { canDelete } = useAuth();
  const canRemove = canDelete('employees');

  const [docs, setDocs] = useState<documentsApi.DocumentWithEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<typeof TYPE_OPTIONS[number]['value']>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteTarget, setDeleteTarget] = useState<documentsApi.DocumentWithEmployee | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async (type: typeof typeFilter) => {
    setLoading(true);
    try {
      const res = await documentsApi.listAll(type === 'all' ? undefined : type);
      setDocs(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(typeFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeFilter]);

  // Client-side search + sort. Backend handles the type filter +
  // tenant scoping; search/sort are interactive enough that a round-
  // trip per keystroke would feel laggy.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = docs;
    if (q) {
      rows = rows.filter(d =>
        d.name.toLowerCase().includes(q)
        || (d.employeeName ?? '').toLowerCase().includes(q)
        || (d.empNo ?? '').toLowerCase().includes(q)
        || (d.notes ?? '').toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] ?? '';
      const bv = (b as Record<string, unknown>)[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return sorted;
  }, [docs, search, sortKey, sortDir]);

  const pagination = usePagination(filtered, 25);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'uploadedAt' || key === 'sizeBytes' ? 'desc' : 'asc');
    }
  };

  const handleDownload = async (doc: documentsApi.DocumentWithEmployee) => {
    setDownloadingId(doc.id);
    try {
      await documentsApi.download(doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await documentsApi.remove(deleteTarget.id);
      // Optimistic local prune — avoids a refetch round-trip on the
      // common case (user just deleted a single row).
      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id));
      toast.success(`Deleted '${deleteTarget.name}'`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-gray-50"
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && <span className="text-gray-400 text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by employee, file name, or notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load(typeFilter)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50 ml-auto">
              {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
            </Badge>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader k="employeeName">Employee</SortHeader>
                  <SortHeader k="name">File</SortHeader>
                  <SortHeader k="type">Type</SortHeader>
                  <SortHeader k="sizeBytes">Size</SortHeader>
                  <SortHeader k="uploadedAt">Uploaded</SortHeader>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && docs.length === 0 ? (
                  <TableBodySkeletonRows rows={6} columns={6} />
                ) : pagination.paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      {docs.length === 0
                        ? 'No documents uploaded yet. Upload from an employee\'s Details sheet → Documents tab.'
                        : 'No documents match the current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.paginatedItems.map(doc => {
                    const family = familyOf(extOf(doc.name), doc.mimeType);
                    const chipLabel = chipLabelOf(doc.name);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {doc.employeeName ?? <span className="text-gray-400 italic">(deleted)</span>}
                            </p>
                            {doc.empNo && (
                              <p className="text-xs text-gray-500">{doc.empNo}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Extension chip: HR reads 'PDF' / 'XLSX' /
                                'JPG' faster than a generic file glyph.
                                Family colour-codes office vs image vs
                                archive so a column scan groups visually. */}
                            <span
                              className={`shrink-0 inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded border text-[10px] font-semibold tracking-wide uppercase ${EXT_CHIP_CLASS[family]}`}
                              title={doc.mimeType}
                            >
                              {chipLabel}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm truncate" title={doc.name}>{doc.name}</p>
                              {doc.notes && (
                                <p className="text-xs text-gray-500 truncate" title={doc.notes}>{doc.notes}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] border-slate-200 bg-slate-50 text-slate-700">
                            {TYPE_LABEL[doc.type] ?? doc.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{fmtSize(doc.sizeBytes)}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {format(new Date(doc.uploadedAt), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => handleDownload(doc)}
                              disabled={downloadingId === doc.id}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              {downloadingId === doc.id ? '…' : 'Get'}
                            </Button>
                            {canRemove && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteTarget(doc)}
                                disabled={deletingId === doc.id}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete '{deleteTarget?.name}'?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.employeeName
                ? `This file will be removed from ${deleteTarget.employeeName}'s document list and deleted from storage. This action can't be undone.`
                : 'This file will be permanently removed from storage. This action can\'t be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={!!deletingId}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
