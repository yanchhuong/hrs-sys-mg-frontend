import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Pill, Stethoscope, FlaskConical, Scan, Pencil, Printer, Plus, Loader2, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { AttachmentsPanel } from '../common/AttachmentsPanel';
import * as invoicesApi from '../../api/invoices';
import * as paymentsApi from '../../api/payments';
import * as customersApi from '../../api/customers';
import * as employeesApi from '../../api/employees';
import * as attachmentsApi from '../../api/attachments';
import * as branchesApi from '../../api/branches';
import { API_BASE, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

/**
 * Read-only encounter detail (v-encounters-first-class). Bundles the
 * bits a doctor / receptionist needs after the encounter is created:
 * sectioned item lines, running total, payment history + Record
 * Payment form, Attach Documents. Deliberately DROPS everything the
 * user called out as invoice-specific: Reminder, Credit / Debit Note
 * creation, Notes / Terms text editing, Auto-Send, Issue on Save.
 *
 * <p>Storage is still {@code sale_invoices} kind='medical', so the
 * shared {@code /api/v1/payments} + {@code /api/v1/attachments}
 * endpoints keep working without a data migration. That's the
 * "common is Payment" contract the user asked for.</p>
 */
const SECTIONS: ReadonlyArray<{
  key: invoicesApi.InvoiceItemCategory;
  label: string;
  icon: typeof Pill;
}> = [
  { key: 'medicine', label: 'Prescription',       icon: Pill },
  { key: 'service',  label: 'Services Performed', icon: Stethoscope },
  { key: 'lab',      label: 'Lab Orders',         icon: FlaskConical },
  { key: 'imaging',  label: 'Imaging Orders',     icon: Scan },
];

export function EncounterDetailDialog({
  encounterId, open, onClose, onChanged, onEdit, customerById, doctorById,
}: {
  encounterId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (inv: invoicesApi.Invoice) => void;
  customerById: Map<string, customersApi.Customer>;
  doctorById: Map<string, employeesApi.Employee>;
}) {
  const [enc, setEnc]           = useState<invoicesApi.Invoice | null>(null);
  const [loading, setLoading]   = useState(false);
  const [payments, setPayments] = useState<paymentsApi.Payment[]>([]);
  const [voiding, setVoiding]   = useState(false);
  // Print-header context (v-encounter-branch-default). Reads the
  // tenant's default branch as the letterhead identity — earlier
  // versions read from accounting_settings.header_*, now the
  // canonical source of truth is the Branch table (default row).
  // Silent fallback when nothing is configured — the print block
  // just stays blank.
  const { currentUser } = useAuth();
  const [printHeader, setPrintHeader]   = useState<{name?: string | null; phone?: string | null; address?: string | null}>({});
  const [logoBlobUrl, setLogoBlobUrl]   = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [row, pays] = await Promise.all([
        invoicesApi.get(encounterId),
        paymentsApi.listForInvoice(encounterId).catch(() => [] as paymentsApi.Payment[]),
      ]);
      setEnc(row);
      setPayments(pays);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load encounter');
      onClose();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void reload();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [encounterId, open]);

  // One-shot fetch of the default branch + latest clinic logo when
  // the dialog first opens. Runs in parallel with the encounter
  // reload so it doesn't slow the perceived open time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let revokedUrl: string | null = null;
    (async () => {
      try {
        const rows = await branchesApi.list();
        if (cancelled) return;
        // Prefer the flagged default; fall back to the first row so
        // a tenant that hasn't marked one explicitly still gets a
        // header. Empty list → keep the blank fallback.
        const active = rows.find(b => b.isDefault) ?? rows[0];
        if (active) {
          setPrintHeader({
            name:    active.name    ?? null,
            phone:   active.phone   ?? null,
            address: active.address ?? null,
          });
        }
      } catch {
        setPrintHeader({});
      }
      const tenantId = currentUser?.tenantId;
      if (!tenantId || cancelled) return;
      try {
        const rows = await attachmentsApi.list('hospital_logo', tenantId);
        if (cancelled || rows.length === 0) return;
        const active = rows[0];
        const tok = getToken();
        const res = await fetch(
          `${API_BASE.replace(/\/$/, '')}/api/v1/attachments/${active.id}/download`,
          { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
        );
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        revokedUrl = URL.createObjectURL(blob);
        setLogoBlobUrl(revokedUrl);
      } catch { /* silent — print header just skips the logo */ }
    })();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [open, currentUser?.tenantId]);

  const patient = enc ? customerById.get(enc.customerId) : null;
  const doctor  = enc?.doctorId ? doctorById.get(enc.doctorId) : null;

  const itemsByCategory = useMemo(() => {
    const bucket: Record<string, invoicesApi.InvoiceItem[]> = {
      medicine: [], service: [], lab: [], imaging: [], other: [],
    };
    for (const it of enc?.items ?? []) {
      const cat = (it.category ?? 'other') as string;
      (bucket[cat] ?? bucket.other).push(it);
    }
    return bucket;
  }, [enc]);

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (p.direction === 'debit' ? -p.amount : p.amount), 0),
    [payments],
  );
  const remain = enc ? Math.max(0, enc.total - totalPaid) : 0;

  const fmtMoney = (n: number, currency = enc?.currency ?? 'USD') =>
    `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doVoid = async () => {
    if (!enc) return;
    setVoiding(true);
    try {
      await invoicesApi.voidInvoice(enc.id);
      toast.success(`Encounter ${enc.invoiceNo} voided`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to void encounter');
    } finally {
      setVoiding(false);
    }
  };

  const doPrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[1080px] w-[92vw] max-h-[92vh] overflow-y-auto">
        {/* Header mirrors the Sale > Invoice detail dialog:
            title (doc no) + type/status/date row on the left,
            action buttons on the right. mr-8 leaves room for the
            dialog's built-in X close button. Entire header is
            print:hidden — the printed bill leads with the clinic
            letterhead + Encounter No. strip inside the body, so
            the on-screen title bar would be a duplicate on paper. */}
        <DialogHeader className="print:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="tabular-nums">
                {enc?.invoiceNo ?? 'Encounter'}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1" asChild>
                <div>
                  {loading || !enc ? (
                    <span className="text-xs text-gray-500">Loading encounter…</span>
                  ) : (
                    <>
                      <Badge variant="outline" className="border-teal-300 text-teal-700 bg-teal-50">
                        Encounter
                      </Badge>
                      <Badge variant="outline" className={`capitalize ${statusBadge(enc.status)}`}>
                        {enc.status}
                      </Badge>
                      <span className="text-xs text-gray-500 tabular-nums">{enc.issueDate}</span>
                    </>
                  )}
                </div>
              </DialogDescription>
            </div>
            {enc && enc.status !== 'void' && (
              <div className="flex gap-1.5 mr-8 print:hidden">
                <Button size="sm" variant="outline" onClick={doPrint} title="Print encounter">
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
                {/* Edit disabled once paid — see the "editing after
                    payment invalidates the receipt" rule from
                    v-encounters-first-class. Void remains the only
                    lever on a paid encounter. */}
                {enc.status !== 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(enc)} title="Edit encounter">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                <Button
                  size="sm" variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={doVoid}
                  disabled={voiding}
                  title="Void encounter"
                >
                  <Ban className="h-3.5 w-3.5 mr-1" /> {voiding ? 'Voiding…' : 'Void'}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {loading || !enc ? (
          <div className="py-10 text-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 mr-1 inline animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Print-only Encounter No. line — visible on the printed
                page above the clinic header. On-screen the doc no
                already sits in the dialog title, so this stays
                {@code hidden print:flex} to avoid duplication. */}
            <div className="hidden print:flex items-baseline gap-2">
              <span className="text-xs uppercase text-gray-500">Encounter No.</span>
              <span className="text-base font-semibold tabular-nums">{enc.invoiceNo}</span>
            </div>

            {/* Print-only clinic header (v-encounter-branch-default).
                Reveals ONLY when the browser is printing. Three-column
                letterhead layout: logo on the LEFT, name/phone/address
                CENTERED, empty spacer on the right to balance the
                center block. Blank sections collapse away so a
                partially-configured header stays clean. */}
            <div className="hidden print:flex items-center gap-4 pb-3 border-b">
              <div className="w-24 shrink-0 flex justify-start">
                {logoBlobUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoBlobUrl} alt="" className="h-20 object-contain" />
                )}
              </div>
              <div className="flex-1 text-center space-y-0.5">
                {printHeader.name && (
                  <div className="text-lg font-semibold">{printHeader.name}</div>
                )}
                {printHeader.phone && (
                  <div className="text-sm">{printHeader.phone}</div>
                )}
                {printHeader.address && (
                  <div className="text-sm whitespace-pre-wrap">{printHeader.address}</div>
                )}
              </div>
              {/* Right-side spacer — same width as the logo column
                  so the center block truly centers on the page. */}
              <div className="w-24 shrink-0" aria-hidden="true" />
            </div>

            {/* Header facts */}
            <div className="grid grid-cols-4 gap-4 text-sm">
              <FactField label="Patient">
                <div className="font-medium">{patient?.name ?? '—'}</div>
                {patient?.phone && <div className="text-xs text-gray-500">{patient.phone}</div>}
              </FactField>
              <FactField label="Doctor">
                {doctor ? (
                  <>
                    <div className="font-medium">{doctor.name}</div>
                    {doctor.position && <div className="text-xs text-gray-500">{doctor.position}</div>}
                  </>
                ) : <span className="text-gray-400">Unassigned</span>}
              </FactField>
              <FactField label="Start date">
                <div className="font-medium tabular-nums">{enc.issueDate}</div>
              </FactField>
              <FactField label="Total">
                <div className="font-medium tabular-nums">{fmtMoney(enc.total)}</div>
                <div className="text-xs text-gray-500">Paid {fmtMoney(totalPaid)} · Remain {fmtMoney(remain)}</div>
              </FactField>
            </div>

            {/* Diagnosis — read-only card so it's easy to eyeball. */}
            {enc.diagnosis && (
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs uppercase text-gray-500 mb-1">Diagnosis</div>
                  <div className="whitespace-pre-wrap text-sm">{enc.diagnosis}</div>
                </CardContent>
              </Card>
            )}

            {/* Consolidated items table. One header row at the top,
                then each non-empty section renders a title strip row
                (with the section icon + count + subtotal) followed
                by that section's line rows. Empty sections drop out. */}
            {SECTIONS.some(s => (itemsByCategory[s.key] ?? []).length > 0) && (
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right w-[80px]">Qty</TableHead>
                        <TableHead className="text-right w-[110px]">Unit price</TableHead>
                        <TableHead className="text-right w-[120px]">Line total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {SECTIONS.flatMap(s => {
                        const rows = itemsByCategory[s.key] ?? [];
                        if (rows.length === 0) return [];
                        const Icon = s.icon;
                        const sub = rows.reduce((n, r) => n + r.lineTotal, 0);
                        return [
                          // Section title row spans all columns —
                          // gives a visual break between sections
                          // without repeating the column headers.
                          <TableRow key={`${s.key}-head`} className="bg-gray-50 hover:bg-gray-50">
                            <TableCell colSpan={5} className="py-2">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-gray-500" />
                                  {s.label}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {rows.length} {rows.length === 1 ? 'line' : 'lines'} · {fmtMoney(sub)}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>,
                          ...rows.map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="text-sm font-medium">{r.name}</TableCell>
                              <TableCell className="text-sm text-gray-600">{r.description || '—'}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{r.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{fmtMoney(r.unitPrice)}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{fmtMoney(r.lineTotal)}</TableCell>
                            </TableRow>
                          )),
                        ];
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Payments — hidden on print. The printed medical bill
                shouldn't carry the internal payment log or the
                Record Payment call-to-action; those belong to the
                on-screen operator view only. */}
            <div className="print:hidden">
              <PaymentsBlock
                encounter={enc}
                payments={payments}
                onChanged={async () => {
                  await reload();
                  onChanged();
                }}
                fmtMoney={fmtMoney}
                remain={remain}
              />
            </div>

            {/* Attachments — polymorphic on doc_type='invoice'. Same
                rows the shared Sale invoice detail would see. Also
                hidden on print — lab result PDFs / consent scans
                aren't the point of the printed bill. */}
            <div className="print:hidden">
              <div className="text-xs uppercase text-gray-500 mb-2">Attachments</div>
              <AttachmentsPanel docType="invoice" docId={enc.id} readOnly={enc.status === 'void'} />
            </div>

            {/* Print-only signature block. Two centered signature
                lines at the bottom of the printed bill — Patient
                on the left, Doctor on the right. Names print under
                the signature line so the person signing knows which
                slot they're in. */}
            <div className="hidden print:flex justify-between mt-10 pt-4 gap-16">
              <div className="w-1/3 text-center">
                <div className="border-b border-gray-400 h-14 mb-1" aria-hidden="true" />
                <div className="text-sm font-medium">Patient&apos;s Signature</div>
                {patient?.name && (
                  <div className="text-xs text-gray-600 mt-0.5">{patient.name}</div>
                )}
              </div>
              <div className="w-1/3 text-center">
                <div className="border-b border-gray-400 h-14 mb-1" aria-hidden="true" />
                <div className="text-sm font-medium">Doctor&apos;s Signature</div>
                {doctor?.name && (
                  <div className="text-xs text-gray-600 mt-0.5">Dr. {doctor.name}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer removed — actions moved to the header (top-right,
            beside the built-in X close). Radix's X already handles
            close, so no separate Close button. */}
      </DialogContent>
    </Dialog>
  );
}

function FactField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500 mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function statusBadge(s: invoicesApi.InvoiceStatus): string {
  switch (s) {
    case 'draft':     return 'border-slate-300 text-slate-700 bg-slate-50';
    case 'progress':  return 'border-teal-300 text-teal-700 bg-teal-50';
    case 'partially': return 'border-amber-300 text-amber-700 bg-amber-50';
    case 'paid':      return 'border-emerald-300 text-emerald-700 bg-emerald-50';
    case 'overdue':   return 'border-orange-400 text-orange-800 bg-orange-50';
    case 'void':      return 'border-red-300 text-red-700 bg-red-50';
    default:          return 'border-gray-200 text-gray-700 bg-gray-50';
  }
}

/** Payment history + a compact Record Payment form. Refunds and
 *  Credit/Debit-Note debits are omitted here — an encounter never
 *  spawns a CN/DN in this UI. If the receptionist needs to reverse a
 *  charge, they void the encounter and re-create. */
function PaymentsBlock({ encounter, payments, onChanged, fmtMoney, remain }: {
  encounter: invoicesApi.Invoice;
  payments: paymentsApi.Payment[];
  onChanged: () => void | Promise<void>;
  fmtMoney: (n: number, currency?: string) => string;
  remain: number;
}) {
  const [showForm, setShowForm]   = useState(false);
  const [amount, setAmount]       = useState('');
  const [currency, setCurrency]   = useState<paymentsApi.PaymentCurrency>('USD');
  const [method, setMethod]       = useState<paymentsApi.PaymentMethod>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [payDate, setPayDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    // Prefill the currency to the encounter's own so the receptionist
    // doesn't have to re-pick on every payment.
    setCurrency((encounter.currency === 'KHR' ? 'KHR' : 'USD') as paymentsApi.PaymentCurrency);
    setAmount(remain > 0 ? remain.toFixed(2) : '');
  }, [encounter.currency, encounter.id, remain, showForm]);

  const canRecord = encounter.status !== 'void' && encounter.status !== 'paid';

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) { toast.error('Enter a payment amount greater than zero'); return; }
    setSaving(true);
    try {
      await paymentsApi.create({
        invoiceId: encounter.id,
        amount: amt,
        currency,
        method,
        direction: 'credit',
        paymentDate: payDate,
        referenceNo: referenceNo.trim() || undefined,
      });
      toast.success('Payment recorded');
      setShowForm(false);
      setAmount('');
      setReferenceNo('');
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-gray-500">Payments</div>
        {canRecord && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Record Payment
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-3">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number" step="0.01" min="0"
                  className="tabular-nums"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <select
                  className="h-9 w-full border rounded-md px-2 text-sm bg-background"
                  value={currency}
                  onChange={e => setCurrency(e.target.value as paymentsApi.PaymentCurrency)}
                >
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Method</Label>
                <select
                  className="h-9 w-full border rounded-md px-2 text-sm bg-background"
                  value={method}
                  onChange={e => setMethod(e.target.value as paymentsApi.PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="khqr">KHQR</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reference</Label>
                <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Txn / receipt no." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Payment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 ? (
        <div className="text-sm text-gray-500 py-3">No payments recorded yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right w-[120px]">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map(p => (
              <TableRow key={p.id}>
                <TableCell className="text-sm tabular-nums">{p.paymentDate}</TableCell>
                <TableCell className="text-sm capitalize">{p.method}</TableCell>
                <TableCell className="text-sm text-gray-600">{p.referenceNo || '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {p.direction === 'debit' ? '− ' : ''}{fmtMoney(p.amount, p.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
