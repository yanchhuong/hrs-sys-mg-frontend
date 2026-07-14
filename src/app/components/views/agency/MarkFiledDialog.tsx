import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';
import * as taxApi from '../../../api/agencyTax';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** {@code agency} → hits /api/v1/agency/tax-calendar/mark-filed with
   *  clientTenantId. {@code tenant} → hits /api/v1/tax-calendar/mark-filed. */
  side: 'agency' | 'tenant';
  clientTenantId?: string;
  /** The row being filed — obligation + period are read-only inside
   *  the dialog. */
  entry: taxApi.CalendarEntry | null;
  onSaved?: () => void;
}

/**
 * v-agency-fe-3 — record a Cambodian tax filing done. Same dialog
 * on both sides; the {@code side} prop picks the API namespace.
 * Existing filing metadata (referenceNo / attachmentUrl / notes)
 * seeds the form so re-filing a previously-recorded row is an edit,
 * not a fresh submission.
 */
export function MarkFiledDialog({ open, onOpenChange, side, clientTenantId, entry, onSaved }: Props) {
  const [referenceNo, setReferenceNo] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    setReferenceNo(entry.referenceNo ?? '');
    setAttachmentUrl(entry.attachmentUrl ?? '');
    setNotes(entry.notes ?? '');
  }, [open, entry]);

  const submit = async () => {
    if (!entry) return;
    if (side === 'agency' && !clientTenantId) {
      toast.error('Missing client scope');
      return;
    }
    setSaving(true);
    try {
      const req: taxApi.MarkFiledRequest = {
        obligationCode: entry.obligationCode,
        period: entry.period,
        referenceNo: referenceNo.trim() || null,
        attachmentUrl: attachmentUrl.trim() || null,
        notes: notes.trim() || null,
      };
      if (side === 'agency') {
        await taxApi.agency.markFiled(clientTenantId!, req);
      } else {
        await taxApi.tenant.markFiled(req);
      }
      toast.success('Filing recorded');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record filing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record filing</DialogTitle>
          <DialogDescription>
            {entry ? (
              <>Mark <b>{entry.obligationName}</b> for period <b>{entry.period}</b> as filed.</>
            ) : 'Mark this obligation as filed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">GDT confirmation number (or your ref)</Label>
            <Input
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              placeholder="e.g. GDT-2026-000123"
              className="h-9 text-sm mt-1"
              maxLength={128}
            />
          </div>
          <div>
            <Label className="text-xs">Attachment URL (proof / receipt)</Label>
            <Input
              value={attachmentUrl}
              onChange={e => setAttachmentUrl(e.target.value)}
              placeholder="https://…"
              className="h-9 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional — filed late, amended, etc."
              rows={3}
              className="text-sm mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !entry}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Record filing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
