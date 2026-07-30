import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../../api/client';
import type { Invoice } from '../../api/invoices';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Loader2, Printer, ShieldCheck } from 'lucide-react';
import { LinkifiedText } from '../common/LinkifiedText';

/** V271 — /invoice/view/:id — anonymous invoice view rendered from the
 *  same Cambodian tax invoice template that {@code
 *  PrintTaxInvoice} uses inside the tenant app. Anyone with the
 *  invoice UUID can view + print; nobody without it can.
 *
 *  <p>Kept as a compact standalone layout (rather than importing the
 *  full tenant-side PrintTaxInvoice) because the tenant version pulls
 *  in template-config, bank-cards, VAT-TIN boxes and other tenant-
 *  scoped bits that don't belong on a public page.</p>
 */

interface CustomerLite {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  representative?: string | null;
  email?: string | null;
  taxId?: string | null;
}

interface CompanyLite {
  name?: string | null;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
}

interface PublicInvoiceBundle {
  invoice: Invoice;
  customer: CustomerLite | null;
  company: CompanyLite | null;
}

export function PublicInvoiceView() {
  const invoiceId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const parts = window.location.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('view');
    return i >= 0 && i + 1 < parts.length ? parts[i + 1] : '';
  }, []);

  const [data, setData] = useState<PublicInvoiceBundle | null>(null);
  // V-invoice-code-gate — recipient types the invoice number ("Code")
  // into this gate before the view unlocks. Prevents a forwarded link
  // from being opened by anyone who doesn't also have the PDF / paper
  // copy where the number appears.
  const [code, setCode] = useState('');
  const [gateErr, setGateErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Fatal errors — invoice missing / voided / expired. Separate from
  // the gate error so a wrong code doesn't nuke the gate + show an
  // ugly "not available" page instead of just letting the user retry.
  const [fatalErr, setFatalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) setFatalErr('Missing invoice id in URL');
  }, [invoiceId]);

  const submitCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setGateErr('Please enter the invoice number.');
      return;
    }
    setBusy(true);
    setGateErr(null);
    try {
      const payload = await apiJson<PublicInvoiceBundle>(
        `/api/v1/public/invoices/${encodeURIComponent(invoiceId)}?code=${encodeURIComponent(trimmed)}`,
        { auth: false },
      );
      setData(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to load invoice';
      // BE returns BadRequest with message "INVOICE_CODE_REQUIRED"
      // for both missing + mismatched codes (uniform so an attacker
      // can't distinguish "URL is valid" from "URL is invalid").
      if (msg.includes('INVOICE_CODE_REQUIRED')) {
        setGateErr('That invoice number doesn\'t match. Please check the number on your invoice / PDF and try again.');
      } else {
        // Genuine not-found / void / server error — no point letting
        // the user retry the gate.
        setFatalErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (fatalErr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle className="text-lg">Invoice not available</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-600">
            {fatalErr === 'Missing invoice id in URL'
              ? fatalErr
              : 'The invoice link may have expired or been retracted. Please contact the sender for a fresh copy.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  // V-invoice-code-gate — full-screen blue gate. Renders BEFORE any
  // invoice content so a forwarded link can't be viewed without the
  // number. Once the code matches, we swap in the print template below.
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-10">
        <Card className="max-w-md w-full shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-lg">Enter your invoice number</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4 text-center">
              For security, please type the invoice number shown on your emailed PDF
              {/* Examples masked with asterisks — showing a real
                  format (INV-001 / POSQ-22072026-003) would give an
                  attacker hints about the numbering pattern. Masked
                  templates just say "there's a prefix and some
                  characters" without leaking either. */}
              (e.g. <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">INV-***</code> or <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">INV-*******-***</code>).
            </p>
            <form onSubmit={submitCode} className="space-y-3">
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Invoice number"
                className="text-center tracking-wider"
                disabled={busy}
              />
              {gateErr && (
                <p className="text-xs text-red-600 text-center">{gateErr}</p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {busy ? 'Checking…' : 'View invoice'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { invoice: inv, customer, company } = data;
  const paid = (inv.total - inv.paidAmount) <= 0.001;
  const currency = inv.currency || 'USD';
  const currencySymbol = currency === 'USD' ? '$' : currency === 'KHR' ? '៛' : `${currency} `;

  const fmtDate = (iso?: string | null) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
  };

  const fmtMoney = (n: number) => {
    if (currency === 'KHR' || currency === 'KRW') {
      return `${currencySymbol} ${Math.round(n).toLocaleString('en-US')}`;
    }
    return `${currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const grandKhr = Math.round(inv.total * (inv.exchangeRate || 0));

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-2 sm:py-10 print:bg-white print:py-0 print:px-0">
      <div className="max-w-[820px] mx-auto bg-white shadow rounded-lg overflow-hidden print:shadow-none print:rounded-none">

        {/* Print / Save toolbar — hidden when printing */}
        <div className="p-4 border-b flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-500">Invoice {inv.invoiceNo}</div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>

        {/* Print sheet — mirrors PrintTaxInvoice (bilingual print layout) */}
        <div
          className="p-6 sm:p-10 relative"
          style={{
            fontFamily: "'Battambang', 'Noto Sans Khmer', system-ui, sans-serif",
            color: '#000',
            fontSize: '12px',
          }}
        >
          {/* PAID stamp */}
          {paid && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: '160px',
                right: '40px',
                transform: 'rotate(-14deg)',
                transformOrigin: 'top right',
                border: '4px double #dc2626',
                borderRadius: '8px',
                padding: '6px 22px',
                color: '#dc2626',
                fontSize: '48px',
                fontWeight: 900,
                letterSpacing: '6px',
                textTransform: 'uppercase',
                fontFamily: '"Times New Roman", Georgia, serif',
                opacity: 0.85,
                lineHeight: 1,
                zIndex: 10,
              }}
            >
              PAID
            </div>
          )}

          {/* Company header */}
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '22px', marginBottom: '4px' }}>
            {company?.legalName || company?.name || ''}
          </div>
          {(company?.address || company?.phone) && (
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#333', marginBottom: '4px' }}>
              {company?.address}{company?.address && company?.phone ? ' · ' : ''}{company?.phone}
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '10px 0 6px' }} />

          {/* Title */}
          <div style={{ textAlign: 'center', margin: '10px 0 20px' }}>
            <div style={{ fontSize: '28px', fontFamily: "'Moul', 'Battambang', serif", lineHeight: 1 }}>វិក្កយបត្រ</div>
            <div style={{ fontSize: '13px', letterSpacing: '2px' }}>INVOICE</div>
          </div>

          {/* Customer + meta block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: '14px' }}>
            <BiRow kh="ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន" en="Company Name / Customer" value={customer?.name} bold />
            <BiRow kh="លេខរៀងវិក្កយបត្រ" en="Invoice N°" value={inv.invoiceNo} bold />
            <BiRow kh="អាសយដ្ឋាន" en="Address" value={customer?.address} />
            <BiRow kh="កាលបរិច្ឆេទ" en="Issue Date" value={fmtDate(inv.issueDate)} />
            <BiRow
              kh="ទូរស័ព្ទលេខ , អ្នកតំណាង"
              en="Telephone No. , Representative"
              value={[customer?.phone, customer?.representative].filter(Boolean).join(' , ')}
            />
            <BiRow kh="ថ្ងៃផុតកំណត់សង់ប្រាក់" en="Payment Due Date" value={fmtDate(inv.dueDate)} />
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f4f4f4' }}>
                <Th kh="ល.រ." en="N°" width="42px" />
                <Th kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en="Description" />
                <Th kh="ឯកតា" en="UOM" width="60px" />
                <Th kh="បរិមាណ" en="Qty" width="60px" align="right" />
                <Th kh="តម្លៃឯកតា" en="Unit Price" width="90px" align="right" />
                <Th kh="បញ្ចុះតម្លៃ" en="Discount" width="90px" align="right" />
                <Th kh="តម្លៃទាំងអស់" en="Total" width="100px" align="right" />
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={it.id}>
                  <Td align="center">{i + 1}</Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    {it.description && <div style={{ fontSize: '10px', color: '#555' }}>{it.description}</div>}
                  </Td>
                  <Td align="center">{it.unit || ''}</Td>
                  <Td align="right">{it.quantity}</Td>
                  <Td align="right">{fmtMoney(it.unitPrice)}</Td>
                  <Td align="right">{fmtMoney(0)}</Td>
                  <Td align="right">{fmtMoney(it.lineTotal)}</Td>
                </tr>
              ))}
              {/* Totals rows */}
              <tr>
                <Td colSpan={6} align="right" bold>សរុប (USD) / Sub Total ({currency})</Td>
                <Td align="right" bold>{fmtMoney(inv.subtotal)}</Td>
              </tr>
              {inv.discountAmount > 0 && (
                <tr>
                  <Td colSpan={6} align="right">បញ្ចុះតម្លៃ / Discount</Td>
                  <Td align="right">-{fmtMoney(inv.discountAmount)}</Td>
                </tr>
              )}
              {inv.taxAmount > 0 && (
                <tr>
                  <Td colSpan={6} align="right">អាករ / VAT</Td>
                  <Td align="right">{fmtMoney(inv.taxAmount)}</Td>
                </tr>
              )}
              <tr>
                <Td colSpan={6} align="right" bold>សរុប ({currency}) / Grand Total ({currency})</Td>
                <Td align="right" bold>{fmtMoney(inv.total)}</Td>
              </tr>
              {currency !== 'KHR' && grandKhr > 0 && (
                <tr>
                  <Td colSpan={6} align="right" bold>សរុប (KHR) / Grand Total (KHR)</Td>
                  <Td align="right" bold>៛ {grandKhr.toLocaleString('en-US')}</Td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Notes block */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontWeight: 600 }}>សម្គាល់ / Notes</div>
            {inv.exchangeRate && currency !== 'KHR' && (
              <div style={{ fontSize: '11px', marginTop: '2px' }}>
                អត្រាប្តូរប្រាក់ / Exchange rate : {inv.exchangeRate}
              </div>
            )}
            {inv.notes && (
              <div style={{ marginTop: '6px' }}>
                <LinkifiedText text={inv.notes} className="whitespace-pre-wrap block" />
              </div>
            )}
            {!inv.notes && (
              <div style={{ marginTop: '6px', fontWeight: 600 }}>Thank you for your business!</div>
            )}
            {inv.terms && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#555', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                {inv.terms}
              </div>
            )}
          </div>

          {/* Signature blocks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '60px' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '4px', textAlign: 'center' }}>
              <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
              <div style={{ fontSize: '10px', color: '#555' }}>Customer's Signature &amp; Name</div>
            </div>
            <div style={{ borderTop: '1px solid #000', paddingTop: '4px', textAlign: 'center' }}>
              <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
              <div style={{ fontSize: '10px', color: '#555' }}>Seller's Signature &amp; Name</div>
            </div>
          </div>
        </div>
      </div>

      {/* Print media styles — bleed to page edges, hide toolbar */}
      <style>{`
        @media print {
          html, body { background: white !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local helpers — bilingual label rows + table cells                         */
/* -------------------------------------------------------------------------- */

function BiRow({ kh, en, value, bold }: { kh: string; en: string; value?: string | null; bold?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '10px', alignItems: 'baseline' }}>
      <div>
        <div style={{ fontSize: '11px' }}>{kh}</div>
        <div style={{ fontSize: '9px', color: '#555' }}>{en}</div>
      </div>
      <div style={{ fontWeight: bold ? 700 : 400 }}>{value || ''}</div>
    </div>
  );
}

function Th({ kh, en, width, align }: { kh: string; en: string; width?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      style={{
        borderTop: '1px solid #000',
        borderLeft: '1px solid #000',
        borderRight: '1px solid #000',
        borderBottom: '1px solid #000',
        padding: '6px 6px',
        width,
        textAlign: align ?? 'center',
        fontSize: '11px',
        fontWeight: 700,
      }}
    >
      <div>{kh}</div>
      <div style={{ fontSize: '9px', color: '#555', fontWeight: 400 }}>{en}</div>
    </th>
  );
}

function Td({
  children, align, colSpan, bold,
}: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; colSpan?: number; bold?: boolean }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        borderLeft: '1px solid #000',
        borderRight: '1px solid #000',
        borderBottom: '1px solid #000',
        padding: '5px 6px',
        textAlign: align ?? 'left',
        fontWeight: bold ? 700 : 400,
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}
