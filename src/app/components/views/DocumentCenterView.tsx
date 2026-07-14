import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { FileSearch, Loader2, RefreshCw, Download, Upload, Clock, CheckCircle2, XCircle, Inbox } from 'lucide-react';
import * as docsApi from '../../api/agencyDocs';
import type { DocStatus, DocumentRequestDto } from '../../api/agencyDocs';

const STATUS_META: Record<DocStatus, { cls: string; label: string; icon: JSX.Element }> = {
  pending:  { cls: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Please upload', icon: <Clock className="h-3 w-3" /> },
  uploaded: { cls: 'bg-blue-100 text-blue-700 border-blue-200',      label: 'Awaiting review', icon: <Inbox className="h-3 w-3" /> },
  reviewed: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Accepted', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { cls: 'bg-rose-100 text-rose-700 border-rose-200',      label: 'Please re-upload', icon: <XCircle className="h-3 w-3" /> },
};

/**
 * v-agency-fe-8 — tenant-side Document Center. Shows every
 * request the agency has filed against this tenant + lets the
 * admin upload a URL/filename against pending or rejected rows.
 *
 * Actual file storage is deferred (a file-picker component is
 * FE #5 polish work); MVP takes a URL + filename so the flow is
 * exercisable end-to-end.
 */
export function DocumentCenterView() {
  const [rows, setRows] = useState<DocumentRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadFor, setUploadFor] = useState<DocumentRequestDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await docsApi.tenant.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const pending = rows.filter(r => r.status === 'pending' || r.status === 'rejected');
    const uploaded = rows.filter(r => r.status === 'uploaded');
    const reviewed = rows.filter(r => r.status === 'reviewed');
    return { pending, uploaded, reviewed };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-blue-600" />
            Document Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Documents your agency has asked you to upload. Please handle the
            "Please upload" section first — those are blocking your monthly
            close.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            Nothing from your agency yet. Requests land here with a bell ping
            when your accountant needs a document.
          </CardContent>
        </Card>
      ) : (
        <>
          <Section
            title="Please upload"
            hint="Your agency is waiting on these."
            rows={grouped.pending}
            onUpload={setUploadFor}
          />
          <Section
            title="Awaiting agency review"
            hint="You've uploaded these; they're being checked."
            rows={grouped.uploaded}
          />
          <Section
            title="Accepted / on file"
            hint="Older approved uploads — visible for audit."
            rows={grouped.reviewed}
            muted
          />
        </>
      )}

      <UploadDialog
        row={uploadFor}
        onClose={() => setUploadFor(null)}
        onDone={() => void load()}
      />
    </div>
  );
}

function Section({ title, hint, rows, onUpload, muted }: {
  title: string; hint: string; rows: DocumentRequestDto[];
  onUpload?: (r: DocumentRequestDto) => void; muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className={muted ? 'opacity-90' : ''}>
      <CardHeader className="pb-2">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map(r => {
            const meta = STATUS_META[r.status];
            return (
              <li key={r.id} className="py-3 px-1 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{r.title}</span>
                    <Badge className={`inline-flex items-center gap-1 border ${meta.cls} text-[10px] px-1.5 py-0`}>
                      {meta.icon} {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {r.category.replace('_', ' ')}
                    </Badge>
                    {r.period && (
                      <span className="text-[11px] text-gray-500 tabular-nums">{r.period}</span>
                    )}
                  </div>
                  {r.description && (
                    <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.description}</div>
                  )}
                  <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap gap-3">
                    {r.requestedByName && <span>Asked by {r.requestedByName}</span>}
                    {r.dueDate && <span>Due {r.dueDate}</span>}
                  </div>
                  {r.rejectionNotes && (
                    <div className="mt-1 text-xs bg-rose-50/60 border border-rose-200 rounded px-2 py-1 text-rose-800">
                      Agency note: {r.rejectionNotes}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.attachmentUrl && (
                    <a
                      href={r.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {r.filename ?? 'Download'}
                    </a>
                  )}
                  {onUpload && (
                    <Button size="sm" onClick={() => onUpload(r)}>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      {r.status === 'rejected' ? 'Re-upload' : 'Upload'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function UploadDialog({ row, onClose, onDone }: {
  row: DocumentRequestDto | null; onClose: () => void; onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setUrl('');
    setFilename('');
  }, [row]);

  const submit = async () => {
    if (!row || !url.trim() || !filename.trim()) return;
    setSaving(true);
    try {
      await docsApi.tenant.upload(row.id, {
        attachmentUrl: url.trim(),
        filename: filename.trim(),
      });
      toast.success('Uploaded — your agency has been notified');
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            {row?.title ?? ''}
            {row?.rejectionNotes && (
              <div className="mt-2 rounded border border-rose-200 bg-rose-50/60 px-2 py-1 text-xs text-rose-800">
                Agency's brief: {row.rejectionNotes}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Attachment URL</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
              className="h-9 text-sm mt-1"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              File-picker upload lands in a polish turn; for now paste a link
              to the file (e.g. Google Drive share URL).
            </div>
          </div>
          <div>
            <Label className="text-xs">Filename shown to agency</Label>
            <Input
              value={filename}
              onChange={e => setFilename(e.target.value)}
              placeholder="e.g. acleda-bank-2025-12.pdf"
              maxLength={255}
              className="h-9 text-sm mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !url.trim() || !filename.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
