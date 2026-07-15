import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Loader2, Send, MessageCircle, FileText, Receipt as ReceiptIcon, Wallet } from 'lucide-react';
import { tenantDocComments, type DocCommentDto } from '../../api/agencyDocComments';
import type { PortfolioDocType } from '../../api/agencyPortfolioDocs';

interface Props {
  /** The doc reference to open the thread for. Null to keep closed. */
  target: { type: PortfolioDocType; id: string; docNo?: string | null } | null;
  onClose: () => void;
}

const TYPE_META: Record<PortfolioDocType, { label: string; icon: JSX.Element }> = {
  invoice: { label: 'Invoice', icon: <FileText className="h-4 w-4 text-blue-600" /> },
  bill:    { label: 'Bill',    icon: <ReceiptIcon className="h-4 w-4 text-orange-600" /> },
  expense: { label: 'Expense', icon: <Wallet className="h-4 w-4 text-emerald-600" /> },
};

/**
 * v-agency-doc-comments-tenant-reply — tenant-side comment thread
 * dialog for one Invoice / Bill / Expense. Opened from the
 * NotificationsBell when the user clicks an agency-comment
 * notification. Posting a reply pings every agency user who's
 * spoken on the thread (best-effort).
 */
export function TenantDocCommentDialog({ target, onClose }: Props) {
  const [thread, setThread] = useState<DocCommentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    try {
      setThread(await tenantDocComments.list(target.type, target.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!target) {
      setThread([]);
      setDraft('');
      return;
    }
    void load();
  }, [target, load]);

  const send = async () => {
    if (!target || !draft.trim()) return;
    setSending(true);
    try {
      const c = await tenantDocComments.post(target.type, target.id, draft.trim());
      setThread(prev => [...prev, c]);
      setDraft('');
      toast.success('Reply sent. Your agency has been notified.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (!target) return null;
  const typeMeta = TYPE_META[target.type];

  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2 text-base">
            {typeMeta.icon}
            {typeMeta.label}
            {target.docNo && (
              <span className="text-sm text-gray-500 tabular-nums font-normal">{target.docNo}</span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs inline-flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3" />
            Comment thread with your agency. Post a reply and they'll get a bell ping.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-2">
          {loading && thread.length === 0 ? (
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : thread.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No comments yet.</p>
          ) : (
            <ul className="space-y-2">
              {thread.map(c => (
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
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 shrink-0">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Reply to your agency…"
            className="text-sm"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-gray-400">
              Your agency's members on this thread get a bell ping.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>Close</Button>
              <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Send reply
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
