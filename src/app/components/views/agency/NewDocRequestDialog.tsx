import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Plus } from 'lucide-react';
import * as docsApi from '../../../api/agencyDocs';
import type { DocCategory, RelatedDocType } from '../../../api/agencyDocs';
import { portfolioDocs, type PortfolioDoc, type PortfolioDocType } from '../../../api/agencyPortfolioDocs';
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

/** Map the DocCategory value to the RelatedDocType we can link to.
 *  Only invoice / bill / receipt map to a financial doc; other
 *  categories don't have a related-doc concept. Receipt on the FE
 *  category enum corresponds to expense on the related-doc side
 *  (the DB table is called `receipts` but agency-workspace calls
 *  the surface Expense — v-agency-cases-portfolio-docs). */
const CATEGORY_TO_RELATED: Partial<Record<DocCategory, RelatedDocType>> = {
  invoice: 'invoice',
  bill:    'bill',
  receipt: 'expense',
};

export function NewDocRequestDialog({ open, onOpenChange, defaultTenantId, onCreated }: Props) {
  const { portfolio } = useAgencyClient();

  const [tenantId, setTenantId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocCategory>('bank_statement');
  const [period, setPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [relatedDocId, setRelatedDocId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Candidate list for the related-doc picker. Fetched lazily
  // when both a tenant + a linkable category (invoice / bill /
  // receipt) are picked — no fetch for bank_statement / contract
  // / etc. since those don't attach to a financial doc.
  const relatedType: RelatedDocType | null = CATEGORY_TO_RELATED[category] ?? null;
  const [candidates, setCandidates] = useState<PortfolioDoc[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTenantId(defaultTenantId ?? '');
    setTitle('');
    setDescription('');
    setCategory('bank_statement');
    setPeriod('');
    setDueDate('');
    setRelatedDocId('');
    setCandidates([]);
  }, [open, defaultTenantId]);

  useEffect(() => {
    // Reset the link whenever the axes that drive candidates
    // change — otherwise a stale selection could survive a
    // tenant / category flip and fire a cross-tenant 400 on save.
    setRelatedDocId('');
    if (!open || !tenantId || !relatedType) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setCandidatesLoading(true);
    portfolioDocs.list({ tenantId, type: relatedType })
      .then(list => { if (!cancelled) setCandidates(list); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setCandidatesLoading(false); });
    return () => { cancelled = true; };
  }, [open, tenantId, relatedType]);

  const candidateLabel = useMemo(() => {
    if (!relatedType) return null;
    return relatedType === 'invoice' ? 'invoice' : relatedType === 'bill' ? 'bill' : 'expense';
  }, [relatedType]);

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
        // Send both-or-neither. When the category isn't linkable OR
        // no doc was picked, omit both — the server enforces the
        // same pair invariant.
        relatedDocType: relatedType && relatedDocId ? relatedType : null,
        relatedDocId:   relatedType && relatedDocId ? relatedDocId : null,
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

          {/* Related-doc picker — surfaces only when the category
              is invoice / bill / receipt AND a tenant is picked.
              Optional at save time (blank = no link). */}
          {relatedType && tenantId && (
            <div>
              <Label className="text-xs">Related {candidateLabel} (optional)</Label>
              <Select
                value={relatedDocId}
                onValueChange={v => setRelatedDocId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder={
                    candidatesLoading
                      ? `Loading ${candidateLabel}s…`
                      : candidates.length === 0
                        ? `No ${candidateLabel}s on this Company yet`
                        : `Link to a ${candidateLabel} (optional)…`
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(no link)</SelectItem>
                  {candidates.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.docNo} · {d.issueDate}
                      <span className="text-[10px] text-gray-500 ml-1">
                        {d.currency} {Number(d.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-500 mt-1">
                Linking sets a hard reference — the request lists next to the
                document on the client side.
              </p>
            </div>
          )}

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
