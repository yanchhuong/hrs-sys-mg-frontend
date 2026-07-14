import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Send, XCircle, RotateCcw, CheckCircle2, Clock, User2 } from 'lucide-react';
import type {
  CaseDetail, CasePriority, CaseCategory, CaseStatus,
} from '../../../api/agencyCases';
import * as casesApi from '../../../api/agencyCases';

type Side = 'agency' | 'tenant';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string | null;
  /** {@code agency} → hits /api/v1/agency/cases; {@code tenant} → hits /api/v1/cases. */
  side: Side;
  /** Called after any state mutation so the parent list refreshes. */
  onChanged?: () => void;
}

const STATUS_CLS: Record<CaseStatus, string> = {
  open:            'bg-blue-100 text-blue-700 border-blue-200',
  pending_client:  'bg-amber-100 text-amber-700 border-amber-200',
  pending_agency:  'bg-violet-100 text-violet-700 border-violet-200',
  escalated:       'bg-rose-100 text-rose-700 border-rose-200',
  closed:          'bg-gray-100 text-gray-600 border-gray-200',
};

const PRIORITY_CLS: Record<CasePriority, string> = {
  low:      'bg-slate-50 text-slate-700 border-slate-200',
  normal:   'bg-gray-100 text-gray-700 border-gray-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  blocking: 'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-2 — shared case detail surface.
 *
 * Renders the header, conversation thread and activity timeline for
 * one case. Actions gate on {@code side}:
 *
 * <ul>
 *   <li><b>agency</b> — reply, update status/priority/category,
 *       close (with root-cause tag), reopen. All calls hit
 *       {@code /api/v1/agency/cases/**}.</li>
 *   <li><b>tenant</b> — reply, close. All calls hit
 *       {@code /api/v1/cases/**}.</li>
 * </ul>
 *
 * Same visual for both sides so operators trained on one recognise
 * the other; the underlying API namespace is picked by {@code side}.
 */
export function CaseDetailDialog({ open, onOpenChange, caseId, side, onChanged }: Props) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeTag, setCloseTag] = useState('');
  const [closeNote, setCloseNote] = useState('');

  const api = side === 'agency' ? casesApi.agency : casesApi.tenant;

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const d = await api.get(caseId);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [caseId, api]);

  useEffect(() => {
    if (open && caseId) {
      setReplyBody('');
      setClosing(false);
      setCloseTag('');
      setCloseNote('');
      void load();
    }
  }, [open, caseId, load]);

  const doReply = async () => {
    if (!caseId || !replyBody.trim()) return;
    setSaving(true);
    try {
      const d = await api.postMessage(caseId, { body: replyBody.trim() });
      setDetail(d);
      setReplyBody('');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to post reply');
    } finally {
      setSaving(false);
    }
  };

  const doClose = async () => {
    if (!caseId) return;
    setSaving(true);
    try {
      await api.close(caseId, {
        rootCauseTag: closeTag.trim() || null,
        closingNote:  closeNote.trim() || null,
      });
      toast.success('Case closed');
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to close case');
    } finally {
      setSaving(false);
    }
  };

  const doReopen = async () => {
    if (!caseId || side !== 'agency') return;
    setSaving(true);
    try {
      await casesApi.agency.reopen(caseId);
      toast.success('Case reopened');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reopen');
    } finally {
      setSaving(false);
    }
  };

  const doPatch = async (patch: { status?: CaseStatus; priority?: CasePriority; category?: CaseCategory }) => {
    if (!caseId || side !== 'agency') return;
    setSaving(true);
    try {
      await casesApi.agency.update(caseId, patch);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update case');
    } finally {
      setSaving(false);
    }
  };

  const isClosed = detail?.header.status === 'closed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="pr-8 truncate">
            {detail?.header.title ?? 'Case'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {detail
              ? <>
                  {detail.header.relatedDocType}
                  {detail.header.tenantName ? ` · ${detail.header.tenantName}` : ''}
                  {detail.header.openedByName ? ` · opened by ${detail.header.openedByName}` : ''}
                </>
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {loading && !detail && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading case…
            </div>
          )}

          {detail && (
            <>
              {/* ---- Header pills ---- */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border ${STATUS_CLS[detail.header.status]}`}>
                  {detail.header.status.replace('_', ' ')}
                </Badge>
                <Badge className={`border ${PRIORITY_CLS[detail.header.priority]}`}>
                  {detail.header.priority}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {detail.header.category.replace('_', ' ')}
                </Badge>
                <span className="text-[11px] text-gray-500 inline-flex items-center gap-1 ml-auto">
                  <Clock className="h-3 w-3" />
                  SLA due {new Date(detail.header.slaResponseDue).toLocaleString()}
                </span>
              </div>

              {detail.header.description && (
                <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2 text-sm whitespace-pre-wrap text-gray-700">
                  {detail.header.description}
                </div>
              )}

              {/* ---- Agency-only quick pickers ---- */}
              {side === 'agency' && !isClosed && (
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs">
                    <div className="text-gray-500 mb-1">Status</div>
                    <Select
                      value={detail.header.status}
                      onValueChange={v => doPatch({ status: v as CaseStatus })}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">open</SelectItem>
                        <SelectItem value="pending_client">pending client</SelectItem>
                        <SelectItem value="pending_agency">pending agency</SelectItem>
                        <SelectItem value="escalated">escalated</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="text-xs">
                    <div className="text-gray-500 mb-1">Priority</div>
                    <Select
                      value={detail.header.priority}
                      onValueChange={v => doPatch({ priority: v as CasePriority })}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="normal">normal</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                        <SelectItem value="blocking">blocking</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="text-xs">
                    <div className="text-gray-500 mb-1">Category</div>
                    <Select
                      value={detail.header.category}
                      onValueChange={v => doPatch({ category: v as CaseCategory })}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clarification">clarification</SelectItem>
                        <SelectItem value="missing_doc">missing doc</SelectItem>
                        <SelectItem value="correction">correction</SelectItem>
                        <SelectItem value="classification">classification</SelectItem>
                        <SelectItem value="reclassification">reclassification</SelectItem>
                        <SelectItem value="recommendation">recommendation</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              )}

              {/* ---- Conversation ---- */}
              <div>
                <div className="text-xs font-medium text-gray-600 mb-2">Conversation</div>
                {detail.messages.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No replies yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {detail.messages.map(m => (
                      <li
                        key={m.id}
                        className={`rounded-md border px-3 py-2 ${
                          m.senderSide === 'agency'
                            ? 'border-blue-200 bg-blue-50/30 ml-0 mr-8'
                            : 'border-emerald-200 bg-emerald-50/30 ml-8 mr-0'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1">
                          <User2 className="h-3 w-3" />
                          <span className="font-medium text-gray-700">{m.senderDisplayName}</span>
                          <span>·</span>
                          <span>{m.senderSide}</span>
                          <span className="ml-auto">{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap text-gray-800">{m.body}</div>
                        {m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                          >
                            Attachment
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ---- Activity timeline ---- */}
              {detail.activities.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">Activity</div>
                  <ul className="text-xs text-gray-500 space-y-1">
                    {detail.activities.map(a => (
                      <li key={a.id} className="flex items-baseline gap-1.5">
                        <span className="tabular-nums">{new Date(a.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span className="text-gray-700">{a.actorDisplayName}</span>
                        <span className="text-gray-400">({a.actorSide})</span>
                        <span>·</span>
                        <span className="font-medium">{a.action.replace('_', ' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ---- Reply composer (hidden when closed) ---- */}
              {!isClosed && !closing && (
                <div className="border-t pt-3">
                  <Label className="text-xs">Your reply</Label>
                  <Textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder="Type your response…"
                    rows={3}
                    className="mt-1 text-sm"
                    disabled={saving}
                  />
                </div>
              )}

              {/* ---- Close pane ---- */}
              {!isClosed && closing && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-medium">Close this case</div>
                  <Input
                    value={closeTag}
                    onChange={e => setCloseTag(e.target.value)}
                    placeholder="Root-cause tag (e.g. missing-po, misclassified)"
                    className="h-8 text-sm"
                    maxLength={64}
                  />
                  <Textarea
                    value={closeNote}
                    onChange={e => setCloseNote(e.target.value)}
                    placeholder="Closing note (optional — appended to the thread)"
                    rows={2}
                    className="text-sm"
                  />
                </div>
              )}

              {isClosed && detail.header.rootCauseTag && (
                <div className="border-t pt-3 text-sm text-gray-600">
                  <span className="text-xs text-gray-500">Closed with root cause tag:</span>{' '}
                  <span className="font-medium">{detail.header.rootCauseTag}</span>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-3 shrink-0 flex-wrap gap-2">
          {detail && !isClosed && !closing && (
            <>
              <Button variant="outline" onClick={() => setClosing(true)} disabled={saving}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Close case
              </Button>
              <Button onClick={doReply} disabled={saving || !replyBody.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Reply
              </Button>
            </>
          )}
          {detail && !isClosed && closing && (
            <>
              <Button variant="outline" onClick={() => setClosing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={doClose} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
                Confirm close
              </Button>
            </>
          )}
          {detail && isClosed && side === 'agency' && (
            <Button variant="outline" onClick={doReopen} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reopen
            </Button>
          )}
          {detail && isClosed && side === 'tenant' && (
            <div className="text-xs text-gray-500 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ask the agency to reopen if this case needs more work.
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
