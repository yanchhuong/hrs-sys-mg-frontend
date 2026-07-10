import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Loader2, ExternalLink } from 'lucide-react';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';

/**
 * v-invoice-no-and-auto-payment — read-only preview modal that
 * opens when a linked invoice number (e.g. on the Enrollments
 * page) is clicked. Shows enough to identify the invoice without
 * leaving the source page: number, status, customer, line items,
 * total, paid amount, balance.
 *
 * <p>"Open in Invoices" is a small escape hatch — hands the
 * invoice number off via {@code sessionStorage.invoicesFocus} and
 * asks the parent to navigate. Callers that don't provide
 * {@code onNavigate} just don't render that button.</p>
 */
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: string | null;
  onNavigate?: (view: string) => void;
}

const STATUS_CLS: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  progress:  'bg-blue-100 text-blue-700 border-blue-200',
  partially: 'bg-amber-100 text-amber-700 border-amber-200',
  paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  refunded:  'bg-teal-100 text-teal-700 border-teal-200',
  overdue:   'bg-rose-100 text-rose-700 border-rose-200',
  void:      'bg-gray-200 text-gray-600 border-gray-300',
};

export function InvoicePreviewDialog({ open, onOpenChange, invoiceId, onNavigate }: Props) {
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) { setInvoice(null); setCustomerName(''); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const inv = await invoicesApi.get(invoiceId);
        if (cancelled) return;
        setInvoice(inv);
        try {
          const c = await customersApi.get(inv.customerId);
          if (!cancelled) setCustomerName(c.name);
        } catch {
          // Missing / soft-deleted customer — the invoice preview
          // still shows, just without the person's name.
          if (!cancelled) setCustomerName('—');
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load invoice');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoiceId, onOpenChange]);

  const openFullPage = () => {
    if (!invoice) return;
    try {
      sessionStorage.setItem('invoicesFocus', invoice.invoiceNo);
    } catch { /* best-effort */ }
    onOpenChange(false);
    onNavigate?.('invoices');
  };

  const balance = invoice
    ? Math.max(0, (invoice.total ?? 0) - (invoice.paidAmount ?? 0))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Invoice {invoice?.invoiceNo ?? ''}</span>
            {invoice && (
              <Badge className={`inline-flex items-center border ${STATUS_CLS[invoice.status] ?? ''}`}>
                {invoice.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Read-only preview of the linked invoice.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> Loading…
          </div>
        ) : invoice ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">Customer</div>
                <div className="font-medium">{customerName || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Issue date</div>
                <div className="tabular-nums">{invoice.issueDate}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Kind</div>
                <div className="capitalize">{invoice.kind.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Currency</div>
                <div className="tabular-nums">{invoice.currency}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Line items</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-[80px] text-right">Qty</TableHead>
                    <TableHead className="w-[100px] text-right">Unit</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map(li => (
                    <TableRow key={li.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{li.name}</div>
                        {li.description && (
                          <div className="text-xs text-gray-500 truncate max-w-[280px]" title={li.description}>
                            {li.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{li.quantity}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{li.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{li.lineTotal.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{invoice.subtotal.toFixed(2)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount</span>
                  <span className="tabular-nums">−{invoice.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax</span>
                  <span className="tabular-nums">{invoice.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span className="tabular-nums">{invoice.total.toFixed(2)} {invoice.currency}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Paid</span>
                <span className="tabular-nums">{(invoice.paidAmount ?? 0).toFixed(2)}</span>
              </div>
              {balance > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Balance</span>
                  <span className="tabular-nums">{balance.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-6 text-center">No invoice loaded.</p>
        )}

        <DialogFooter>
          {onNavigate && invoice && (
            <Button variant="outline" onClick={openFullPage}>
              <ExternalLink className="h-4 w-4 mr-1.5" /> Open in Invoices
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
