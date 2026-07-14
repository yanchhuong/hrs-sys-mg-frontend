import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Plus } from 'lucide-react';
import * as delivsApi from '../../../api/agencyDeliverables';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientTenantId: string;
  clientName?: string | null;
  onCreated?: () => void;
}

/** UI-facing labels for the 12 kinds. */
const KIND_LABEL: Record<delivsApi.DeliverableKind, string> = {
  management_accounts:    'Management accounts (P&L / BS / CF)',
  tax_filing_package:     'Tax filing package',
  bank_recon:             'Bank reconciliation',
  ar_ap_aging:            'AR / AP aging',
  vat_reconciliation:     'VAT reconciliation',
  wht_reconciliation:     'WHT reconciliation',
  ptoi_vs_actual:         'PToI vs Actual',
  statutory_financials:   'Statutory financials',
  cit_return:             'CIT return',
  patent_renewal:         'Patent renewal',
  disclosure_notes:       'Disclosure notes',
  other:                  'Other',
};

const MONTHLY_KINDS: delivsApi.DeliverableKind[] =
  ['management_accounts', 'tax_filing_package', 'bank_recon', 'ar_ap_aging'];
const QUARTERLY_KINDS: delivsApi.DeliverableKind[] =
  ['vat_reconciliation', 'wht_reconciliation', 'ptoi_vs_actual'];
const ANNUAL_KINDS: delivsApi.DeliverableKind[] =
  ['statutory_financials', 'cit_return', 'patent_renewal', 'disclosure_notes'];

/** Placeholder text for the period input based on kind. */
function periodHint(kind: delivsApi.DeliverableKind): string {
  if (MONTHLY_KINDS.includes(kind)) return 'YYYY-MM (e.g. 2026-01)';
  if (QUARTERLY_KINDS.includes(kind)) return 'YYYY-Qn (e.g. 2026-Q1)';
  if (ANNUAL_KINDS.includes(kind)) return 'YYYY (e.g. 2025)';
  return 'free-form for Other';
}

export function NewDeliverableDialog({ open, onOpenChange, clientTenantId, clientName, onCreated }: Props) {
  const [kind, setKind] = useState<delivsApi.DeliverableKind>('management_accounts');
  const [period, setPeriod] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !period.trim()) return;
    setSaving(true);
    try {
      await delivsApi.agency.create({
        tenantId: clientTenantId,
        kind,
        period: period.trim(),
        title: title.trim(),
        description: description.trim() || null,
      });
      toast.success('Deliverable created (draft)');
      setTitle(''); setDescription(''); setPeriod('');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New deliverable</DialogTitle>
          <DialogDescription>
            {clientName ? `For ${clientName}. ` : ''}Starts in <b>draft</b>. You'll be
            set as the preparer; a different agency user reviews before a partner approves.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Kind</div>
              <Select value={kind} onValueChange={v => setKind(v as delivsApi.DeliverableKind)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as delivsApi.DeliverableKind[]).map(k => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Period</div>
              <Input
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder={periodHint(kind)}
                className="h-9 text-sm"
                maxLength={16}
              />
            </label>
          </div>

          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Working title (e.g. Management accounts — Jan 2026)"
              maxLength={255}
              className="h-9 text-sm mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Description (brief for the reviewer)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="text-sm mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !title.trim() || !period.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
