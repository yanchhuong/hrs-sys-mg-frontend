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
import { Loader2, Send, CheckCircle2, ThumbsUp, Package, XCircle, Download } from 'lucide-react';
import type { DeliverableDto, DeliverableStatus } from '../../../api/agencyDeliverables';
import * as delivsApi from '../../../api/agencyDeliverables';

type Side = 'agency' | 'tenant';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deliverableId: string | null;
  side: Side;
  onChanged?: () => void;
}

const STATUS_CLS: Record<DeliverableStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  reviewed:  'bg-violet-100 text-violet-700 border-violet-200',
  approved:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  delivered: 'bg-teal-100 text-teal-700 border-teal-200',
  rejected:  'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-3 — deliverable detail + four-eyes actions.
 *
 * <p>The tenant side gets a read-only version (delivered vault) —
 * the agency side gets the state-machine actions
 * (submit / review / approve / reject / deliver). All actions
 * fire against the /api/v1/agency/deliverables/{id}/... endpoints;
 * BE enforces four-eyes so a UI mistake still 403s.</p>
 */
export function DeliverableDetailDialog({ open, onOpenChange, deliverableId, side, onChanged }: Props) {
  const [row, setRow] = useState<DeliverableDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Delivery + rejection panes
  const [delivering, setDelivering] = useState(false);
  const [deliverUrl, setDeliverUrl] = useState('');
  const [deliverFilename, setDeliverFilename] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  // Notes on the positive transitions
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!deliverableId) return;
    setLoading(true);
    try {
      const d = side === 'agency'
        ? await delivsApi.agency.get(deliverableId)
        : await delivsApi.tenant.get(deliverableId);
      setRow(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [deliverableId, side]);

  useEffect(() => {
    if (open && deliverableId) {
      setDelivering(false); setRejecting(false);
      setDeliverUrl(''); setDeliverFilename(''); setRejectNotes(''); setNote('');
      void load();
    }
  }, [open, deliverableId, load]);

  const act = async (fn: () => Promise<DeliverableDto>) => {
    setSaving(true);
    try {
      const d = await fn();
      setRow(d);
      setNote('');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const submit  = () => row && act(() => delivsApi.agency.submit(row.id,  { notes: note || null }));
  const review  = () => row && act(() => delivsApi.agency.review(row.id,  { notes: note || null }));
  const approve = () => row && act(() => delivsApi.agency.approve(row.id, { notes: note || null }));
  const deliver = () => row && act(() => delivsApi.agency.deliver(row.id, {
    attachmentUrl: deliverUrl.trim(),
    filename:      deliverFilename.trim(),
  })).then(() => { setDelivering(false); toast.success('Delivered'); });
  const reject  = () => row && act(() => delivsApi.agency.reject(row.id, {
    notes: rejectNotes.trim(),
  })).then(() => { setRejecting(false); toast.success('Sent back to preparer'); });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="pr-8 truncate">
            {row?.title ?? 'Deliverable'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {row ? <>{row.kind.replace(/_/g, ' ')} · {row.period}{row.tenantName ? ` · ${row.tenantName}` : ''}</> : 'Loading…'}
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
                <Badge className={`border ${STATUS_CLS[row.status]}`}>
                  {row.status}
                </Badge>
              </div>

              {row.description && (
                <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2 text-sm whitespace-pre-wrap text-gray-700">
                  {row.description}
                </div>
              )}

              {/* Four-eyes trail */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <TrailLine label="Preparer" name={row.preparerName} at={row.preparedAt} />
                <TrailLine label="Reviewer" name={row.reviewerName} at={row.reviewedAt} note={row.reviewNotes} />
                <TrailLine label="Approver (partner)" name={row.approverName} at={row.approvedAt} note={row.approvalNotes} />
                <TrailLine label="Delivered" name={null} at={row.deliveredAt} />
              </div>

              {row.deliveredAttachmentUrl && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center gap-2 text-sm">
                  <Download className="h-4 w-4 text-emerald-700" />
                  <a href={row.deliveredAttachmentUrl} target="_blank" rel="noreferrer"
                     className="text-emerald-700 font-medium hover:underline truncate">
                    {row.deliveredFilename ?? 'Delivered artefact'}
                  </a>
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

              {/* Agency-only action panes */}
              {side === 'agency' && !delivering && !rejecting && row.status !== 'delivered' && (
                <div className="border-t pt-3 space-y-2">
                  {(row.status === 'submitted' || row.status === 'reviewed') && (
                    <>
                      <Label className="text-xs">Note (optional — recorded on this sign-off)</Label>
                      <Textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </>
                  )}
                </div>
              )}

              {side === 'agency' && delivering && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-medium">Deliver artefact</div>
                  <Input
                    placeholder="Attachment URL (link to the PDF / XLSX)"
                    value={deliverUrl}
                    onChange={e => setDeliverUrl(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Filename shown in tenant vault"
                    value={deliverFilename}
                    onChange={e => setDeliverFilename(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {side === 'agency' && rejecting && (
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
          {row && side === 'agency' && !delivering && !rejecting && (
            <>
              {row.status === 'draft' && (
                <Button onClick={submit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Submit for review
                </Button>
              )}
              {row.status === 'submitted' && (
                <>
                  <Button variant="outline" onClick={() => setRejecting(true)} disabled={saving}>
                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                  </Button>
                  <Button onClick={review} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Approve as reviewer
                  </Button>
                </>
              )}
              {row.status === 'reviewed' && (
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
              {row.status === 'approved' && (
                <Button onClick={() => setDelivering(true)} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                  <Package className="h-4 w-4 mr-1.5" />
                  Deliver to client…
                </Button>
              )}
            </>
          )}
          {row && side === 'agency' && delivering && (
            <>
              <Button variant="outline" onClick={() => setDelivering(false)} disabled={saving}>Cancel</Button>
              <Button
                onClick={deliver}
                disabled={saving || !deliverUrl.trim() || !deliverFilename.trim()}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Package className="h-4 w-4 mr-1.5" />}
                Confirm delivery
              </Button>
            </>
          )}
          {row && side === 'agency' && rejecting && (
            <>
              <Button variant="outline" onClick={() => setRejecting(false)} disabled={saving}>Cancel</Button>
              <Button onClick={reject} disabled={saving || !rejectNotes.trim()} className="bg-rose-600 hover:bg-rose-700">
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
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className="text-gray-800">
        {name ? name : <span className="text-gray-400 italic">—</span>}
        {at && <span className="text-gray-400 text-[10px] ml-1">{new Date(at).toLocaleString()}</span>}
      </div>
      {note && <div className="text-gray-600 whitespace-pre-wrap mt-0.5">{note}</div>}
    </div>
  );
}
