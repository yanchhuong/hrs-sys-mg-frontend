import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  FileSearch, Loader2, Plus, RefreshCw, Search, Download,
  CheckCircle2, XCircle, Clock, Inbox,
} from 'lucide-react';
import * as docsApi from '../../../api/agencyDocs';
import type { DocStatus, DocumentRequestDto } from '../../../api/agencyDocs';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { NewDocRequestDialog } from './NewDocRequestDialog';

type Tab = 'all' | 'pending' | 'uploaded' | 'reviewed' | 'rejected';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending client' },
  { key: 'uploaded', label: 'Needs review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_META: Record<DocStatus, { cls: string; label: string; icon: JSX.Element }> = {
  pending:  { cls: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Pending', icon: <Clock className="h-3 w-3" /> },
  uploaded: { cls: 'bg-blue-100 text-blue-700 border-blue-200',      label: 'Uploaded', icon: <Inbox className="h-3 w-3" /> },
  reviewed: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Reviewed', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { cls: 'bg-rose-100 text-rose-700 border-rose-200',      label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
};

/**
 * v-agency-fe-8 — agency-side Document Center. Ask, review, or
 * reject one at a time. New requests go via {@link NewDocRequestDialog}.
 * Reviews / rejects happen inline on the row (reject shows a
 * secondary dialog for the required note).
 */
export function AgencyDocsPage() {
  const { activeClient, activeClientId, portfolio } = useAgencyClient();
  const [rows, setRows] = useState<DocumentRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('uploaded');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [rejectRow, setRejectRow] = useState<DocumentRequestDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await docsApi.agency.list(activeClientId ?? undefined);
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (q && !r.title.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)
           && !(r.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, pending: 0, uploaded: 0, reviewed: 0, rejected: 0 };
    for (const r of rows) c[r.status as Tab] += 1;
    return c;
  }, [rows]);

  const doReview = async (r: DocumentRequestDto) => {
    setBusy(r.id);
    try {
      await docsApi.agency.review(r.id);
      toast.success('Marked reviewed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-blue-600" />
            Document Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeClient
              ? `Requests filed against ${activeClient.tenantName ?? activeClient.tenantSlug}. `
              : `Portfolio-wide requests across ${portfolio.length} client${portfolio.length === 1 ? '' : 's'}. `}
            Ask a client for a specific document — bank statement, contract,
            GDT notice, etc. Review the upload when it lands.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Request document
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 h-8 rounded-md border text-xs font-medium transition ${
                  tab === t.key
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {t.label}
                <span className="ml-1 text-[10px] opacity-70">({counts[t.key]})</span>
              </button>
            ))}
            <div className="ml-auto relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search title / client…"
                className="pl-8 h-9 w-64 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No requests match this filter.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <li key={r.id} className="py-3 px-1 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{r.title}</span>
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
                      <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                        {r.tenantName && <span>{r.tenantName}</span>}
                        {r.requestedByName && <span>Requested by {r.requestedByName}</span>}
                        {r.dueDate && <span>Due {r.dueDate}</span>}
                        {r.uploadedAt && <span>Uploaded {new Date(r.uploadedAt).toLocaleString()}</span>}
                      </div>
                      {r.rejectionNotes && (
                        <div className="mt-1 text-xs bg-rose-50/60 border border-rose-200 rounded px-2 py-1 text-rose-800">
                          Rejected: {r.rejectionNotes}
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
                      {r.status === 'uploaded' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectRow(r)}
                            disabled={busy === r.id}
                            className="text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => doReview(r)}
                            disabled={busy === r.id}
                          >
                            {busy === r.id
                              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                            Accept
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <NewDocRequestDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultTenantId={activeClientId}
        onCreated={() => void load()}
      />

      <RejectDialog
        row={rejectRow}
        onClose={() => setRejectRow(null)}
        onDone={() => void load()}
      />
    </div>
  );
}

function RejectDialog({ row, onClose, onDone }: {
  row: DocumentRequestDto | null; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (row) setNotes(''); }, [row]);

  const submit = async () => {
    if (!row || !notes.trim()) return;
    setSaving(true);
    try {
      await docsApi.agency.reject(row.id, notes.trim());
      toast.success('Sent back with a note');
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send back for re-upload</DialogTitle>
          <DialogDescription>
            The client sees this note in their Document Center. Be specific
            about what to fix so the next upload is right.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          className="text-sm"
          placeholder="What was wrong? What to upload instead?"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || !notes.trim()}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
