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
import * as casesApi from '../../../api/agencyCases';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The client Company this case will be filed against. */
  clientTenantId: string;
  clientName?: string | null;
  onCreated?: () => void;
}

/**
 * v-agency-fe-2 — open a new case against a client Company's
 * financial document. The related-doc pair is entered by hand for
 * MVP (invoice / bill / receipt / payroll_item / other + optional
 * UUID). A future turn will replace the free-text ID field with a
 * picker driven off the client's tenant data.
 */
export function NewCaseDialog({ open, onOpenChange, clientTenantId, clientName, onCreated }: Props) {
  const [relatedDocType, setRelatedDocType] =
      useState<casesApi.CaseRelatedDocType>('invoice');
  const [relatedDocId, setRelatedDocId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<casesApi.CasePriority>('normal');
  const [category, setCategory] = useState<casesApi.CaseCategory>('clarification');
  const [slaHours, setSlaHours] = useState<number>(24);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    if (relatedDocType !== 'other' && !relatedDocId.trim()) {
      toast.error('relatedDocId is required unless type=other');
      return;
    }
    setSaving(true);
    try {
      await casesApi.agency.open({
        tenantId: clientTenantId,
        relatedDocType,
        relatedDocId: relatedDocType === 'other'
          ? null
          : relatedDocId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        priority,
        category,
        slaResponseHours: slaHours,
      });
      toast.success('Case opened');
      // Reset for the next one.
      setTitle(''); setDescription(''); setRelatedDocId('');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New case</DialogTitle>
          <DialogDescription>
            {clientName ? `Filed against ${clientName}.` : 'Filed against the selected client.'}
            {' '}The client admin sees this in their Cases inbox with a bell ping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Related document</div>
              <Select
                value={relatedDocType}
                onValueChange={v => setRelatedDocType(v as casesApi.CaseRelatedDocType)}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="bill">Bill</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="payroll_item">Payroll item</SelectItem>
                  <SelectItem value="other">Other (no source doc)</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">
                Doc ID {relatedDocType === 'other' && <span className="text-gray-400">(not required)</span>}
              </div>
              <Input
                value={relatedDocId}
                onChange={e => setRelatedDocId(e.target.value)}
                placeholder={relatedDocType === 'other' ? 'n/a' : 'UUID of the document'}
                disabled={relatedDocType === 'other'}
                className="h-9 text-sm"
              />
            </label>
          </div>

          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short summary the client will see"
              maxLength={255}
              className="h-9 text-sm mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Context, what you need from the client, links to the transaction…"
              rows={4}
              className="text-sm mt-1"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Priority</div>
              <Select value={priority} onValueChange={v => setPriority(v as casesApi.CasePriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <Select value={category} onValueChange={v => setCategory(v as casesApi.CaseCategory)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
            <label className="text-xs">
              <div className="text-gray-500 mb-1">SLA (hours)</div>
              <Input
                type="number"
                min={1}
                value={slaHours}
                onChange={e => setSlaHours(Math.max(1, parseInt(e.target.value, 10) || 24))}
                className="h-9 text-sm"
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Open case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
