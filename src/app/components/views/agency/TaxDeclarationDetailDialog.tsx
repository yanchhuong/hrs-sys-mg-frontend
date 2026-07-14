import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import {
  Loader2, Send, CheckCircle2, ThumbsUp, Upload, XCircle, ClipboardCheck, Save, Paperclip,
} from 'lucide-react';
import * as declApi from '../../../api/agencyTaxDecl';
import type { TaxDeclarationDto, TaxDeclStatus } from '../../../api/agencyTaxDecl';
import { CATEGORY_LABELS, formatPeriodForDisplay } from '../../../api/agencyTaxDecl';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  declarationId: string | null;
  onChanged?: () => void;
}

const STATUS_CLS: Record<TaxDeclStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  prepared:  'bg-blue-100 text-blue-700 border-blue-200',
  reviewed:  'bg-violet-100 text-violet-700 border-violet-200',
  approved:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  submitted: 'bg-teal-100 text-teal-700 border-teal-200',
  accepted:  'bg-lime-100 text-lime-700 border-lime-200',
  rejected:  'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-9 — tax declaration detail + state-machine
 * actions. Same shape as DeliverableDetailDialog (six states
 * instead of five plus GDT submit + accept), so operators
 * trained on Deliverables recognise the flow.
 */
export function TaxDeclarationDetailDialog({ open, onOpenChange, declarationId, onChanged }: Props) {
  const [row, setRow] = useState<TaxDeclarationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft edit fields
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Transient panes
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [gdtSubmitting, setGdtSubmitting] = useState(false);
  const [gdtRef, setGdtRef] = useState('');
  const [gdtAttachment, setGdtAttachment] = useState('');
  const [gdtNotes, setGdtNotes] = useState('');
  const [signOffNote, setSignOffNote] = useState('');

  const load = useCallback(async () => {
    if (!declarationId) return;
    setLoading(true);
    try {
      const d = await declApi.agency.get(declarationId);
      setRow(d);
      setAmount(d.amountOwed?.toString() ?? '');
      setNotes(d.notes ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [declarationId]);

  useEffect(() => {
    if (open && declarationId) {
      setRejecting(false); setGdtSubmitting(false);
      setRejectNotes(''); setGdtRef(''); setGdtAttachment(''); setGdtNotes('');
      setSignOffNote('');
      void load();
    }
  }, [open, declarationId, load]);

  const act = async (fn: () => Promise<TaxDeclarationDto>) => {
    setSaving(true);
    try {
      const d = await fn();
      setRow(d);
      setSignOffNote('');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => row && act(() => declApi.agency.update(row.id, {
    amountOwed: amount ? parseFloat(amount) : 0,
    notes: notes.trim() || null,
  })).then(() => toast.success('Draft saved'));

  const prepare  = () => row && act(() => declApi.agency.prepare(row.id, { notes: signOffNote || null }));
  const review   = () => row && act(() => declApi.agency.review(row.id,  { notes: signOffNote || null }));
  const approve  = () => row && act(() => declApi.agency.approve(row.id, { notes: signOffNote || null }));
  const accept   = () => row && act(() => declApi.agency.markAccepted(row.id));

  const submitGdt = () => row && act(() => declApi.agency.submitToGdt(row.id, {
    gdtReferenceNo: gdtRef.trim(),
    attachmentUrl:  gdtAttachment.trim() || null,
    notes:          gdtNotes.trim() || null,
  })).then(() => { setGdtSubmitting(false); toast.success('Submitted to GDT + Tax Calendar updated'); });

  const doReject = () => row && act(() => declApi.agency.reject(row.id, { notes: rejectNotes.trim() }))
    .then(() => { setRejecting(false); toast.success('Sent back to preparer'); });

  const isDraft     = row?.status === 'draft';
  const isPrepared  = row?.status === 'prepared';
  const isReviewed  = row?.status === 'reviewed';
  const isApproved  = row?.status === 'approved';
  const isSubmitted = row?.status === 'submitted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="pr-8 truncate">
            {row ? `${row.obligationName} — ${formatPeriodForDisplay(row.period)}` : 'Tax declaration'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {row ? <>{row.tenantName ?? '—'} · {CATEGORY_LABELS[row.category]} · {row.amountOwed} {row.currency}</> : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {loading && !row && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {row && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`border ${STATUS_CLS[row.status]}`}>{row.status}</Badge>
                {row.gdtReferenceNo && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    GDT ref: {row.gdtReferenceNo}
                  </Badge>
                )}
              </div>

              {/* Draft edit or read-only body */}
              {isDraft ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Amount owed ({row.currency})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="h-8 text-sm mt-1 text-right tabular-nums"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes / calculation basis</Label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={4}
                      className="text-sm mt-1"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                      Save draft
                    </Button>
                  </div>
                </div>
              ) : (
                row.notes && (
                  <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2 text-sm whitespace-pre-wrap text-gray-700">
                    {row.notes}
                  </div>
                )
              )}

              {/* Four-eyes trail */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <TrailLine label="Preparer"        name={row.preparerName}    at={row.preparedAt} />
                <TrailLine label="Reviewer"        name={row.reviewerName}    at={row.reviewedAt}    note={row.reviewNotes} />
                <TrailLine label="Approver (partner)" name={row.approverName} at={row.approvedAt}    note={row.approvalNotes} />
                <TrailLine label="Submitted to GDT" name={row.submittedByName} at={row.submittedAt}
                           note={row.gdtReferenceNo ? `Ref: ${row.gdtReferenceNo}` : null} />
                <TrailLine label="Accepted by GDT" name={row.acceptedByName}  at={row.acceptedAt} />
              </div>

              {/* Source docs attached to this declaration (V234). */}
              {row.linkedDocs.length > 0 && (
                <div className="border-t pt-3">
                  <div className="text-xs font-medium mb-2 inline-flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3 text-gray-500" />
                    Attached documents
                    <span className="text-gray-400">({row.linkedDocs.length})</span>
                  </div>
                  <div className="rounded-md border max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left font-medium px-3 py-1.5">Type</th>
                          <th className="text-left font-medium px-3 py-1.5">Doc no.</th>
                          <th className="text-right font-medium px-3 py-1.5">Amount</th>
                          <th className="text-left font-medium px-3 py-1.5">Attached</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {row.linkedDocs.map(d => (
                          <tr key={d.id ?? `${d.docType}:${d.docId}`}>
                            <td className="px-3 py-1.5 uppercase text-gray-500">{d.docType}</td>
                            <td className="px-3 py-1.5 font-medium tabular-nums">{d.docNo ?? d.docId.slice(0, 8)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {d.docAmount == null ? '—' : Number(d.docAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 tabular-nums">
                              {d.attachedAt ? new Date(d.attachedAt).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {row.rejectionNotes && (
                <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm">
                  <div className="text-xs font-medium text-rose-800 mb-0.5">
                    Rejected by {row.rejectedByName ?? 'a reviewer'}
                    {row.rejectedAt && ` on ${new Date(row.rejectedAt).toLocaleString()}`}
                  </div>
                  <div className="text-sm text-rose-900 whitespace-pre-wrap">{row.rejectionNotes}</div>
                </div>
              )}

              {/* Sign-off note field (visible when transition is possible + no transient pane) */}
              {!rejecting && !gdtSubmitting && (isPrepared || isReviewed) && (
                <div className="border-t pt-3">
                  <Label className="text-xs">Note (optional — recorded on this sign-off)</Label>
                  <Textarea
                    value={signOffNote}
                    onChange={e => setSignOffNote(e.target.value)}
                    rows={2}
                    className="text-sm mt-1"
                  />
                </div>
              )}

              {gdtSubmitting && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-medium">Submit to GDT</div>
                  <Input
                    placeholder="GDT reference number (required)"
                    value={gdtRef}
                    onChange={e => setGdtRef(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Attachment URL (optional — proof of lodgement)"
                    value={gdtAttachment}
                    onChange={e => setGdtAttachment(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Textarea
                    placeholder="Notes (optional)"
                    value={gdtNotes}
                    onChange={e => setGdtNotes(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <div className="text-[11px] text-gray-500">
                    Submitting also marks this obligation as filed on the Tax Calendar.
                  </div>
                </div>
              )}

              {rejecting && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-medium">Rejection notes (required)</div>
                  <Textarea
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    rows={3}
                    className="text-sm"
                    placeholder="What needs correcting? The preparer sees this as the brief."
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-3 shrink-0 flex-wrap gap-2">
          {row && !rejecting && !gdtSubmitting && (
            <>
              {isDraft && (
                <Button onClick={prepare} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Prepare (send for review)
                </Button>
              )}
              {isPrepared && (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)} disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                  </Button>
                  <Button onClick={review} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Reviewer sign-off
                  </Button>
                </>
              )}
              {isReviewed && (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)} disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                  </Button>
                  <Button onClick={approve} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1.5" />}
                    Partner approve
                  </Button>
                </>
              )}
              {isApproved && (
                <Button onClick={() => setGdtSubmitting(true)} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                  <Upload className="h-4 w-4 mr-1.5" />
                  Submit to GDT…
                </Button>
              )}
              {isSubmitted && (
                <Button onClick={accept} disabled={saving} className="bg-lime-600 hover:bg-lime-700">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}
                  Mark accepted (GDT confirmed)
                </Button>
              )}
            </>
          )}
          {row && gdtSubmitting && (
            <>
              <Button variant="outline" onClick={() => setGdtSubmitting(false)} disabled={saving}>Cancel</Button>
              <Button
                onClick={submitGdt}
                disabled={saving || !gdtRef.trim()}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                Confirm GDT submission
              </Button>
            </>
          )}
          {row && rejecting && (
            <>
              <Button variant="outline" onClick={() => setRejecting(false)} disabled={saving}>Cancel</Button>
              <Button onClick={doReject} disabled={saving || !rejectNotes.trim()} className="bg-rose-600 hover:bg-rose-700">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                Send back
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrailLine({ label, name, at, note }: { label: string; name: string | null; at: string | null; note?: string | null }) {
  if (!name && !at && !note) return null;
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="text-gray-800">
        {name ?? <span className="text-gray-400 italic">—</span>}
        {at && <span className="text-gray-400 text-[10px] ml-1">{new Date(at).toLocaleString()}</span>}
      </div>
      {note && <div className="text-gray-600 whitespace-pre-wrap mt-0.5">{note}</div>}
    </div>
  );
}
