import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import {
  FileText, Receipt as ReceiptIcon, Wallet, Loader2, Send, MessageCircle, Building2, Lock,
  FileSpreadsheet,
} from 'lucide-react';
import type { PortfolioDoc, PortfolioDocDetail, PortfolioDocTaxRef, PortfolioDocType } from '../../../api/agencyPortfolioDocs';
import { portfolioDocs } from '../../../api/agencyPortfolioDocs';
import { agencyDocComments, type DocCommentDto } from '../../../api/agencyDocComments';

interface Props {
  /** The list-row that was clicked. Carries doc type + id + a
   *  minimal snapshot the dialog uses while the full detail is
   *  still loading. */
  seed: PortfolioDoc | null;
  onClose: () => void;
}

const TYPE_META: Record<PortfolioDocType, { label: string; icon: JSX.Element; cls: string }> = {
  invoice: { label: 'Invoice', icon: <FileText className="h-4 w-4" />,     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  bill:    { label: 'Bill',    icon: <ReceiptIcon className="h-4 w-4" />,  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  expense: { label: 'Expense', icon: <Wallet className="h-4 w-4" />,       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/** v-agency-doc-detail-kind-label — human labels + colour for the
 *  invoice/bill "kind" enum. Backend stores raw snake_case values;
 *  the popup renders these instead so the SA / agency sees
 *  "Tax Invoice" not "tax". */
const KIND_META: Record<string, { label: string; cls: string }> = {
  commercial:  { label: 'Commercial',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  tax:         { label: 'Tax',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  credit_note: { label: 'Credit Note',  cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  debit_note:  { label: 'Debit Note',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

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

/**
 * v-agency-case-view — full-fidelity read of one Invoice / Bill /
 * Expense on the agency workspace. Same shape the tenant sees on
 * their own doc page, minus every write control. Below the doc the
 * dialog surfaces a comment thread: the agency posts a note here,
 * the tenant admins get a bell ping + can reply from their side.
 */
export function PortfolioDocDetailDialog({ seed, onClose }: Props) {
  const [detail, setDetail] = useState<PortfolioDocDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // v-agency-case-tax-ref-col — fetched separately alongside detail
  // so the badge appears even before the full detail lands.
  const [taxRef, setTaxRef] = useState<PortfolioDocTaxRef | null>(null);

  const [comments, setComments] = useState<DocCommentDto[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!seed) return;
    setLoading(true);
    setDetail(null);
    try {
      const d = await portfolioDocs.get(seed.type, seed.id);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [seed]);

  const loadComments = useCallback(async () => {
    if (!seed) return;
    setCommentsLoading(true);
    try {
      const list = await agencyDocComments.list(seed.type, seed.id);
      setComments(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load comments');
    } finally {
      setCommentsLoading(false);
    }
  }, [seed]);

  useEffect(() => {
    if (!seed) {
      setDetail(null);
      setComments([]);
      setDraft('');
      setTaxRef(null);
      return;
    }
    void loadDetail();
    void loadComments();
    // Fetch tax ref (if declared) alongside detail so the header
    // badge shows immediately.
    portfolioDocs.taxRefs(seed.type, [seed.id])
      .then(refs => setTaxRef(refs[seed.id] ?? null))
      .catch(() => setTaxRef(null));
  }, [seed, loadDetail, loadComments]);

  const send = async () => {
    if (!seed || !draft.trim()) return;
    setSending(true);
    try {
      const c = await agencyDocComments.post(seed.type, seed.id, draft.trim());
      setComments(prev => [...prev, c]);
      setDraft('');
      toast.success('Comment posted — the client has been notified');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSending(false);
    }
  };

  const open = !!seed;
  const typeMeta = seed ? TYPE_META[seed.type] : null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base flex-wrap">
            {typeMeta?.icon}
            {typeMeta?.label} · {seed?.docNo}
            <Badge className="border border-amber-200 bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0 inline-flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" /> Read-only
            </Badge>
            {taxRef && (
              <Badge
                className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0 inline-flex items-center gap-1"
                title={`Declared ${taxRef.status} · period ${taxRef.period}${taxRef.submittedAt ? ' · submitted ' + new Date(taxRef.submittedAt).toLocaleDateString() : ''}`}
              >
                <FileSpreadsheet className="h-2.5 w-2.5" />
                Declared · GDT {taxRef.gdtReferenceNo}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="inline-flex items-center gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            {seed?.tenantName ?? '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0">
          {/* ---- Header ---- */}
          <div className="px-6 py-4 border-b">
            {loading && !detail ? (
              <div className="text-sm text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
              </div>
            ) : detail ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs">
                <Field label="Doc no.">{detail.docNo}</Field>
                <Field label="Status">
                  <Badge className={`border text-[10px] px-1.5 py-0 ${DOC_STATUS_CLS[detail.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {detail.status}
                  </Badge>
                </Field>
                <Field label="Issue date">{detail.issueDate}</Field>
                <Field label="Due date">{detail.dueDate ?? '—'}</Field>
                <Field label={detail.type === 'invoice' ? 'Customer' : 'Vendor'}>
                  {detail.counterpartyName ?? '—'}
                </Field>
                <Field label="Currency">{detail.currency}</Field>
                {detail.exchangeRate != null && (
                  <Field label="FX rate">{detail.exchangeRate}</Field>
                )}
                {detail.kind && (
                  <Field label="Tax type">
                    {(() => {
                      const meta = KIND_META[detail.kind];
                      return meta
                        ? <Badge className={`border text-[10px] px-1.5 py-0 ${meta.cls}`}>{meta.label}</Badge>
                        : <span className="capitalize">{detail.kind.replace(/_/g, ' ')}</span>;
                    })()}
                  </Field>
                )}
              </div>
            ) : (
              // Seed-only fallback — enough for the caller to see
              // what they clicked while the detail fetch fails.
              <div className="text-xs text-gray-500">
                Could not load full details. Basic info from the list:
                &nbsp;{seed?.docNo} · {seed?.issueDate} · {seed?.status}
              </div>
            )}
          </div>

          {/* ---- Line items ---- */}
          {detail && detail.lines.length > 0 && (
            <div className="px-6 py-4 border-b">
              <div className="text-xs font-medium text-gray-500 uppercase mb-2">Line items</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-medium py-1.5">Item</th>
                      <th className="text-left font-medium py-1.5">Unit</th>
                      <th className="text-right font-medium py-1.5">Qty</th>
                      <th className="text-right font-medium py-1.5">Price</th>
                      <th className="text-right font-medium py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.lines.map(l => (
                      <tr key={l.id}>
                        <td className="py-1.5">
                          <div className="text-gray-900">{l.name}</div>
                          {l.description && (
                            <div className="text-[10px] text-gray-500 truncate max-w-md">{l.description}</div>
                          )}
                        </td>
                        <td className="py-1.5 text-gray-600">{l.unit ?? '—'}</td>
                        <td className="py-1.5 text-right tabular-nums">{Number(l.quantity)}</td>
                        <td className="py-1.5 text-right tabular-nums">{Number(l.unitPrice).toFixed(2)}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{Number(l.lineTotal).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Totals ---- */}
          {detail && (
            <div className="px-6 py-4 border-b">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                {detail.subtotal != null && (
                  <Field label="Subtotal" align="right">
                    <span className="tabular-nums">{Number(detail.subtotal).toFixed(2)}</span>
                  </Field>
                )}
                {detail.discountAmount != null && Number(detail.discountAmount) !== 0 && (
                  <Field label="Discount" align="right">
                    <span className="tabular-nums text-rose-600">−{Number(detail.discountAmount).toFixed(2)}</span>
                  </Field>
                )}
                {detail.taxAmount != null && Number(detail.taxAmount) !== 0 && (
                  <Field label="Tax" align="right">
                    <span className="tabular-nums">{Number(detail.taxAmount).toFixed(2)}</span>
                  </Field>
                )}
                <Field label="Total" align="right">
                  <span className="tabular-nums font-semibold text-gray-900">
                    {detail.currency} {Number(detail.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </Field>
                {detail.paidAmount != null && (
                  <Field label="Paid" align="right">
                    <span className="tabular-nums text-emerald-700">
                      {Number(detail.paidAmount).toFixed(2)}
                    </span>
                  </Field>
                )}
              </div>
              {(detail.notes || detail.terms) && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {detail.notes && (
                    <div>
                      <div className="text-gray-500 uppercase font-medium mb-1">Notes</div>
                      <div className="text-gray-800 whitespace-pre-wrap">{detail.notes}</div>
                    </div>
                  )}
                  {detail.terms && (
                    <div>
                      <div className="text-gray-500 uppercase font-medium mb-1">Terms</div>
                      <div className="text-gray-800 whitespace-pre-wrap">{detail.terms}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Comments ---- */}
          <div className="px-6 py-4 space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Comments
              {comments.length > 0 && (
                <span className="text-gray-400">({comments.length})</span>
              )}
            </div>

            {commentsLoading && comments.length === 0 ? (
              <div className="text-xs text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">
                No comments yet. Post one below — the client Company will be notified.
              </p>
            ) : (
              <ul className="space-y-2">
                {comments.map(c => (
                  <li key={c.id} className={`p-2.5 rounded-md border ${
                    c.authorSide === 'agency'
                      ? 'bg-blue-50/40 border-blue-100'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500 mb-1">
                      <span className="font-medium text-gray-900">
                        {c.authorDisplayName ?? '(unknown)'}
                      </span>
                      <Badge className={`text-[9px] px-1 py-0 border ${
                        c.authorSide === 'agency'
                          ? 'bg-blue-100 text-blue-700 border-blue-200'
                          : 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {c.authorSide}
                      </Badge>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-gray-800 whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
              </ul>
            )}

            <div className="pt-2">
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Comment on this document — the client will get a bell ping."
                className="text-sm"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] text-gray-400">
                  Comments send a notification to the client Company's admins.
                </p>
                <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
                  {sending
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Post comment
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, align = 'left' }: { label: string; children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="text-gray-500 uppercase text-[10px] font-medium">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );
}
