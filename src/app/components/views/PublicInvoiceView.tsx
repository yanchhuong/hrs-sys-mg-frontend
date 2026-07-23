import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../../api/client';
import type { Invoice } from '../../api/invoices';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Printer } from 'lucide-react';

/** V271 — /invoice/view/:id — the destination of the emailed invoice
 *  link. Anonymous read of a single invoice by its UUID.
 *
 *  Auth model: the invoice UUID IS the secret (128-bit random, unguessable).
 *  The server enforces the same on {@code /api/v1/public/invoices/{id}}.
 */
export function PublicInvoiceView() {
  const invoiceId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const parts = window.location.pathname.split('/').filter(Boolean);
    // /invoice/view/{id}
    const i = parts.indexOf('view');
    return i >= 0 && i + 1 < parts.length ? parts[i + 1] : '';
  }, []);

  const [inv, setInv] = useState<Invoice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await apiJson<Invoice>(
          `/api/v1/public/invoices/${encodeURIComponent(invoiceId)}`,
          { auth: false },
        );
        if (alive) setInv(data);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Unable to load invoice');
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (invoiceId) load();
    else { setErr('Missing invoice id in URL'); setLoading(false); }
    return () => { alive = false; };
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (err || !inv) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle className="text-lg">Invoice not available</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-600">
            {err ?? 'The invoice link may have expired or been retracted. Please contact the sender for a fresh copy.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const money = (n: number | null | undefined) => {
    if (n == null) return '';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="max-w-2xl mx-auto bg-white shadow rounded-lg overflow-hidden print:shadow-none print:rounded-none">
        <div className="p-6 border-b flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Invoice {inv.invoiceNo}</h1>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{inv.kind}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-6 text-sm mb-6">
            <div>
              <div className="text-slate-500 mb-1">Issue date</div>
              <div className="font-medium">{inv.issueDate}</div>
            </div>
            {inv.dueDate && (
              <div>
                <div className="text-slate-500 mb-1">Due date</div>
                <div className="font-medium">{inv.dueDate}</div>
              </div>
            )}
            <div>
              <div className="text-slate-500 mb-1">Status</div>
              <div className="font-medium capitalize">{inv.status}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">Currency</div>
              <div className="font-medium">{inv.currency}</div>
            </div>
          </div>

          <table className="w-full text-sm border-t border-slate-200">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 px-2 font-medium text-right">Qty</th>
                <th className="py-2 px-2 font-medium text-right">Unit</th>
                <th className="py-2 pl-2 font-medium text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id} className="border-b last:border-b-0 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-slate-900">{it.name}</div>
                    {it.description && <div className="text-xs text-slate-500">{it.description}</div>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{money(it.unitPrice)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{money(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="tabular-nums">{money(inv.subtotal)}</span>
              </div>
              {inv.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Discount</span>
                  <span className="tabular-nums">-{money(inv.discountAmount)}</span>
                </div>
              )}
              {inv.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Tax</span>
                  <span className="tabular-nums">{money(inv.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 mt-2 font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{money(inv.total)} {inv.currency}</span>
              </div>
              {inv.paidAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Paid</span>
                  <span className="tabular-nums">{money(inv.paidAmount)}</span>
                </div>
              )}
            </div>
          </div>

          {inv.notes && (
            <div className="mt-6 pt-4 border-t text-sm">
              <div className="text-slate-500 mb-1">Notes</div>
              <div className="whitespace-pre-wrap text-slate-800">{inv.notes}</div>
            </div>
          )}
          {inv.terms && (
            <div className="mt-4 text-xs text-slate-500 whitespace-pre-wrap">{inv.terms}</div>
          )}
        </div>
      </div>
    </div>
  );
}
