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
  Loader2, Plus, RefreshCw, Search, Wallet, FileSearch, FileText,
  CheckCircle2, XCircle, Clock, Inbox, Download, Receipt as ReceiptIcon,
} from 'lucide-react';
import * as docsApi from '../../../api/agencyDocs';
import type { DocStatus, DocumentRequestDto, DocCategory } from '../../../api/agencyDocs';
import { portfolioDocs, type PortfolioDoc, type PortfolioDocType } from '../../../api/agencyPortfolioDocs';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { NewDocRequestDialog } from './NewDocRequestDialog';
import { PortfolioDocDetailDialog } from './PortfolioDocDetailDialog';

type TopTab = 'case' | 'documents';
type DocKindFilter = 'all' | PortfolioDocType;

const TOP_TABS: Array<{ key: TopTab; label: string; icon: React.ReactNode }> = [
  { key: 'case',      label: 'Case',      icon: <Wallet className="h-3.5 w-3.5" /> },
  { key: 'documents', label: 'Documents', icon: <FileSearch className="h-3.5 w-3.5" /> },
];

const DOC_KIND_FILTERS: Array<{ key: DocKindFilter; label: string; icon?: React.ReactNode }> = [
  { key: 'all',     label: 'All' },
  { key: 'invoice', label: 'Invoices', icon: <FileText className="h-3 w-3" /> },
  { key: 'bill',    label: 'Bills',    icon: <ReceiptIcon className="h-3 w-3" /> },
  { key: 'expense', label: 'Expenses', icon: <Wallet className="h-3 w-3" /> },
];

/** Set is the union of the three doc-type status enums; anything
 *  missing falls back to a neutral gray badge (defensive — add new
 *  statuses here rather than reject-list). */
const DOC_STATUS_CLS: Record<string, string> = {
  draft:      'bg-slate-100 text-slate-700 border-slate-200',
  pending:    'bg-amber-100 text-amber-700 border-amber-200',
  progress:   'bg-blue-100 text-blue-700 border-blue-200',
  partially:  'bg-cyan-100 text-cyan-700 border-cyan-200',
  paid:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  overdue:    'bg-rose-100 text-rose-700 border-rose-200',
  void:       'bg-gray-100 text-gray-500 border-gray-200',
  returned:   'bg-purple-100 text-purple-700 border-purple-200',
  refunded:   'bg-purple-100 text-purple-700 border-purple-200',
};

const DOC_TYPE_META: Record<PortfolioDocType, { label: string; cls: string }> = {
  invoice: { label: 'Invoice', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  bill:    { label: 'Bill',    cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  expense: { label: 'Expense', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

type DocReqTab = 'all' | DocStatus;

const DOC_REQ_TABS: Array<{ key: DocReqTab; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending client' },
  { key: 'uploaded', label: 'Needs review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'rejected', label: 'Rejected' },
];

const DOC_REQ_STATUS_META: Record<DocStatus, { cls: string; label: string; icon: JSX.Element }> = {
  pending:  { cls: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Pending',  icon: <Clock className="h-3 w-3" /> },
  uploaded: { cls: 'bg-blue-100 text-blue-700 border-blue-200',          label: 'Uploaded', icon: <Inbox className="h-3 w-3" /> },
  reviewed: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Reviewed', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { cls: 'bg-rose-100 text-rose-700 border-rose-200',          label: 'Rejected', icon: <XCircle className="h-3 w-3" /> },
};

/** Doc-request categories that "relate to" Invoice / Bill / Expense.
 *  Used to scope the Documents tab per the user's spec — surface only
 *  requests that concern a financial document. */
const FINANCIAL_CATEGORIES: Set<DocCategory> = new Set(['invoice', 'bill', 'receipt']);

/**
 * v-agency-sale-expense — Sale &amp; Expense workspace. Replaces
 * the standalone Cases + Documents menus with one page:
 *
 * <ul>
 *   <li><b>Case tab</b> — the Invoice / Bill / Expense list across
 *       every engaged client Company (same shape the client sees
 *       under Sales &gt; Invoice / Purchases &gt; Bill / Expense).
 *       Rows show the source Company; the header client picker
 *       narrows to one tenant when set.</li>
 *   <li><b>Documents tab</b> — doc-request queue scoped to invoice
 *       / bill / receipt categories. These are the uploads the
 *       agency asks the client to send, tied to a specific
 *       financial doc via the request's title + period.</li>
 * </ul>
 */
export function AgencySaleExpensePage() {
  const { activeClient, activeClientId, portfolio } = useAgencyClient();
  const [topTab, setTopTab] = useState<TopTab>('case');

  // Case (portfolio docs) state
  const [kind, setKind] = useState<DocKindFilter>('all');
  const [docs, setDocs] = useState<PortfolioDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  // Row-click detail dialog (Case tab) — carries the seed row that
  // was clicked so the dialog can render immediately while the full
  // detail fetch is in flight.
  const [openedDoc, setOpenedDoc] = useState<PortfolioDoc | null>(null);

  // Documents (doc-requests) state
  const [reqs, setReqs] = useState<DocumentRequestDto[]>([]);
  const [reqsLoading, setReqsLoading] = useState(false);
  const [reqTab, setReqTab] = useState<DocReqTab>('uploaded');
  const [reqSearch, setReqSearch] = useState('');
  const [newReqOpen, setNewReqOpen] = useState(false);
  const [rejectRow, setRejectRow] = useState<DocumentRequestDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const list = await portfolioDocs.list({
        type: kind === 'all' ? undefined : kind,
        tenantId: activeClientId ?? undefined,
      });
      setDocs(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  }, [kind, activeClientId]);

  const loadReqs = useCallback(async () => {
    setReqsLoading(true);
    try {
      const list = await docsApi.agency.list(activeClientId ?? undefined);
      setReqs(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load document requests');
    } finally {
      setReqsLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    if (topTab === 'case')      void loadDocs();
    if (topTab === 'documents') void loadReqs();
  }, [topTab, loadDocs, loadReqs]);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d =>
      d.docNo.toLowerCase().includes(q)
      || d.tenantName.toLowerCase().includes(q)
      || d.status.toLowerCase().includes(q)
    );
  }, [docs, docSearch]);

  // Restrict to invoice/bill/receipt categories then apply the
  // status tab + free-text filter.
  const financialReqs = useMemo(
    () => reqs.filter(r => FINANCIAL_CATEGORIES.has(r.category)),
    [reqs],
  );

  const reqCounts = useMemo(() => {
    const c: Record<DocReqTab, number> = { all: financialReqs.length, pending: 0, uploaded: 0, reviewed: 0, rejected: 0 };
    for (const r of financialReqs) c[r.status as DocReqTab] += 1;
    return c;
  }, [financialReqs]);

  const filteredReqs = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return financialReqs.filter(r => {
      if (reqTab !== 'all' && r.status !== reqTab) return false;
      if (q && !r.title.toLowerCase().includes(q)
           && !(r.tenantName ?? '').toLowerCase().includes(q)
           && !(r.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [financialReqs, reqTab, reqSearch]);

  const doReview = async (r: DocumentRequestDto) => {
    setBusy(r.id);
    try {
      await docsApi.agency.review(r.id);
      toast.success('Marked reviewed');
      await loadReqs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(null);
    }
  };

  const loading = topTab === 'case' ? docsLoading : reqsLoading;
  const refresh = () => topTab === 'case' ? void loadDocs() : void loadReqs();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Sale &amp; Expense
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {topTab === 'case'
              ? (activeClient
                  ? `Invoices, bills, and expenses on ${activeClient.tenantName ?? activeClient.tenantSlug}.`
                  : `Invoices, bills, and expenses across ${portfolio.length} client${portfolio.length === 1 ? '' : 's'}. Pick a client in the header to narrow.`)
              : 'Uploads the agency has requested against invoices, bills, or expenses. Review or reject as they land.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {topTab === 'documents' && (
            <Button size="sm" onClick={() => setNewReqOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Request document
            </Button>
          )}
        </div>
      </div>

      {/* Top-level tabs — Case | Documents. */}
      <div className="flex items-center gap-1 border-b">
        {TOP_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTopTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm border-b-2 -mb-px transition ${
              topTab === t.key
                ? 'border-blue-500 text-blue-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {topTab === 'case' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {DOC_KIND_FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setKind(f.key)}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs font-medium transition ${
                    kind === f.key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {f.icon}
                  {f.label}
                </button>
              ))}
              <div className="ml-auto relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="Search doc no / status…"
                  className="pl-8 h-9 w-72 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {docsLoading && docs.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
              </div>
            ) : filteredDocs.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center px-4">
                No documents found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Type</th>
                      <th className="text-left font-medium px-4 py-2">Doc no.</th>
                      <th className="text-left font-medium px-4 py-2">Issue date</th>
                      <th className="text-right font-medium px-4 py-2">Amount</th>
                      <th className="text-left font-medium px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredDocs.map(d => {
                      const typeMeta = DOC_TYPE_META[d.type];
                      return (
                        <tr
                          key={`${d.type}:${d.id}`}
                          onClick={() => setOpenedDoc(d)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-4 py-2">
                            <Badge className={`border text-[10px] px-1.5 py-0 ${typeMeta.cls}`}>
                              {typeMeta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 font-medium text-gray-900">{d.docNo}</td>
                          <td className="px-4 py-2 text-gray-600">{d.issueDate}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {d.currency} {Number(d.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2">
                            <Badge className={`border text-[10px] px-1.5 py-0 ${DOC_STATUS_CLS[d.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {d.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {topTab === 'documents' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {DOC_REQ_TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setReqTab(t.key)}
                  className={`px-3 h-8 rounded-md border text-xs font-medium transition ${
                    reqTab === t.key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {t.label}
                  <span className="ml-1 text-[10px] opacity-70">({reqCounts[t.key]})</span>
                </button>
              ))}
              <div className="ml-auto relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  value={reqSearch}
                  onChange={e => setReqSearch(e.target.value)}
                  placeholder="Search title / client…"
                  className="pl-8 h-9 w-64 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {reqsLoading && reqs.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filteredReqs.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No document requests for invoices, bills, or expenses match this filter.
              </p>
            ) : (
              <ul className="divide-y">
                {filteredReqs.map(r => {
                  const meta = DOC_REQ_STATUS_META[r.status];
                  return (
                    <li key={r.id} className="py-3 px-1 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{r.title}</span>
                          <Badge className={`inline-flex items-center gap-1 border ${meta.cls} text-[10px] px-1.5 py-0`}>
                            {meta.icon} {meta.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {r.category}
                          </Badge>
                          {r.relatedDocType && r.relatedDocNo && (
                            <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] px-1.5 py-0">
                              {r.relatedDocType === 'invoice' ? 'Invoice' : r.relatedDocType === 'bill' ? 'Bill' : 'Expense'}
                              {' · '}
                              <span className="tabular-nums">{r.relatedDocNo}</span>
                            </Badge>
                          )}
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
      )}

      <PortfolioDocDetailDialog
        seed={openedDoc}
        onClose={() => setOpenedDoc(null)}
      />

      <NewDocRequestDialog
        open={newReqOpen}
        onOpenChange={setNewReqOpen}
        defaultTenantId={activeClientId}
        onCreated={() => void loadReqs()}
      />

      <RejectDialog
        row={rejectRow}
        onClose={() => setRejectRow(null)}
        onDone={() => void loadReqs()}
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
