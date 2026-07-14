import { useEffect, useState } from 'react';
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
import * as docsApi from '../../../api/agencyDocs';
import type { DocCategory } from '../../../api/agencyDocs';
import { useAgencyClient } from '../../../context/AgencyClientContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-selected client when the page has a picked client. */
  defaultTenantId?: string | null;
  onCreated?: () => void;
}

const CATEGORY_LABEL: Record<DocCategory, string> = {
  bank_statement: 'Bank statement',
  invoice:        'Invoice',
  bill:           'Bill',
  receipt:        'Receipt',
  contract:       'Contract',
  payroll_slip:   'Payroll slip',
  tax_notice:     'Tax notice (GDT)',
  patent_cert:    'Patent certificate',
  kyc_doc:        'KYC document',
  other:          'Other',
};

export function NewDocRequestDialog({ open, onOpenChange, defaultTenantId, onCreated }: Props) {
  const { portfolio } = useAgencyClient();

  const [tenantId, setTenantId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocCategory>('bank_statement');
  const [period, setPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTenantId(defaultTenantId ?? '');
    setTitle('');
    setDescription('');
    setCategory('bank_statement');
    setPeriod('');
    setDueDate('');
  }, [open, defaultTenantId]);

  const submit = async () => {
    if (!tenantId || !title.trim()) return;
    setSaving(true);
    try {
      await docsApi.agency.create({
        tenantId,
        title: title.trim(),
        description: description.trim() || null,
        category,
        period: period.trim() || null,
        dueDate: dueDate || null,
      });
      toast.success('Request sent to client');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a document</DialogTitle>
          <DialogDescription>
            The tenant admin sees this in their Document Center inbox with a
            bell ping. Once they upload, you review and either accept or send
            it back with a note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Client</div>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick a client…" /></SelectTrigger>
                <SelectContent>
                  {portfolio.map(c => (
                    <SelectItem key={c.tenantId} value={c.tenantId}>
                      {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Category</div>
              <Select value={category} onValueChange={v => setCategory(v as DocCategory)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as DocCategory[]).map(k => (
                    <SelectItem key={k} value={k}>{CATEGORY_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div>
            <Label className="text-xs">Title (what to request)</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={255}
              placeholder="e.g. December 2025 ACLEDA bank statement"
              className="h-9 text-sm mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Description / notes</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="text-sm mt-1"
              placeholder="Any context — format, deadline reason, where to grab it."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Period (optional)</Label>
              <Input
                value={period}
                onChange={e => setPeriod(e.target.value)}
                maxLength={16}
                placeholder="e.g. 2025-12 or 2025"
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Due by (optional)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="h-9 text-sm mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !tenantId || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
