/**
 * V-library-payment-invoice-view — read-only Invoice popup opened
 * from Payment History without leaving the page.
 *
 * <p>Fetches the invoice on open, renders a printable layout (header,
 * customer line, items table, totals, purpose, payments). The Print
 * button uses window.print() with a print-scoped stylesheet that
 * hides everything on the page except the invoice card.</p>
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Printer, Loader2, Send, Mail, Share2, ChevronDown } from 'lucide-react';
import { useForwardShare } from '../../common/ForwardShareDialog';
import { printWithKhmerFonts } from '../../../utils/printFonts';
import { Button } from '../../ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../../ui/dropdown-menu';
import * as invoicesApi from '../../../api/invoices';
import * as settingsApi from '../../../api/settings';
import { useDateFormat } from '../../../context/DateFormatContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
  memberName?: string | null;   // passed from the caller so we don't
  memberNo?: string | null;     // need a second /customers round-trip
}

export function InvoiceViewDialog({ open, onOpenChange, invoiceId, memberName, memberNo }: Props) {
  const { formatDate } = useDateFormat();
  const [invoice, setInvoice] = useState<invoicesApi.Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // V-library-invoice-print-pro — company info feeds the print
  // template's header (name, address, phone, logo, VAT TIN).
  const [companyInfo, setCompanyInfo] = useState<settingsApi.CompanyInfo | null>(null);
  useEffect(() => {
    settingsApi.getCompanyInfo().then(setCompanyInfo).catch(() => setCompanyInfo(null));
  }, []);

  /** V-library-invoice-forward-share — reuse the sale-side hook so
   *  Forward-to matches the Invoice / Quotation flow verbatim:
   *  captures the popup's {@code .print-tax-invoice} body via
   *  html2canvas, downloads the PNG, and opens Telegram Web /
   *  Messenger Web (desktop) or the OS share sheet (mobile). */
  const forwardShare = useForwardShare({
    buildConfig: () => invoice ? {
      title: `Invoice ${invoice.invoiceNo}`,
      summary: [
        `Invoice ${invoice.invoiceNo}`,
        memberName && `Customer: ${memberName}`,
        invoice.issueDate && `Issue date: ${formatDate(invoice.issueDate)}`,
        invoice.dueDate && `Due: ${formatDate(invoice.dueDate)}`,
        `Total: ${fmtMoney(invoice.total, invoice.currency)}`,
      ].filter((s): s is string => typeof s === 'string').join('\n'),
      fileNameStem: invoice.invoiceNo,
    } : null,
    busy: sending,
    setBusy: setSending,
  });


  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    setLoading(true);
    setInvoice(null);
    invoicesApi.get(invoiceId)
      .then(inv => { if (!cancelled) setInvoice(inv); })
      .catch(e => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, invoiceId]);

  const statusBadge = (s: string) => {
    const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      paid: 'default',
      issued: 'default',
      draft: 'outline',
      void: 'destructive',
      overdue: 'destructive',
    };
    return <Badge variant={map[s] ?? 'secondary'} className="capitalize">{s}</Badge>;
  };

  // V-library-money-symbol-prefix — render amounts as
  // "$ 560.00" / "៛ 5,600" instead of the trailing "560.00 USD"
  // form. USD/KHR handled explicitly; anything else falls back to
  // the trailing-code form so a future currency isn't silently
  // formatted with a mismatched glyph.
  const currencySymbol = (c: string | null | undefined): string | null => {
    if (!c) return null;
    if (c === 'USD') return '$';
    if (c === 'KHR') return '៛';
    return null;
  };
  const fmtMoney = (n: number | null | undefined, currency?: string | null) => {
    const amt = (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sym = currencySymbol(currency);
    return sym ? `${sym} ${amt}` : (currency ? `${amt} ${currency}` : amt);
  };

  /** V-library-invoice-print-inline — same concept the sale-side
   *  Invoice dialog uses: mark a body class before firing
   *  {@code window.print()}, then a scoped {@code @media print}
   *  rule (below the dialog return) hides everything except this
   *  popup's {@code .print-tax-invoice} body. No new tab, no
   *  cross-window state — the printout matches what the operator
   *  is looking at, styled for A4. */
  const doPrint = async () => {
    if (!invoice) return;
    document.body.classList.add('printing-library-invoice');
    const cleanup = () => {
      document.body.classList.remove('printing-library-invoice');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    await printWithKhmerFonts();
  };

  /** V-library-invoice-send-email — reuses the sale-side endpoint.
   *  Uses the member's on-file email; server 400 if none set. */
  const sendEmail = async () => {
    if (!invoiceId) return;
    setSending(true);
    try {
      const res = await invoicesApi.sendEmail(invoiceId, {});
      if (res.delivered) toast.success(`Emailed to ${res.to}`);
      else               toast.warning(`Could not deliver to ${res.to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Email send failed');
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl invoice-view-print-root">
        <DialogHeader>
          <DialogTitle>Invoice {invoice?.invoiceNo ?? ''}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-8 flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {invoice && !loading && (
          // Compact on-screen preview — kept minimal because Print /
          // Forward now render through the professional
          // .print-tax-invoice template mounted below (V-library-
          // invoice-print-pro). This block is what the operator
          // scans; the printout / PNG is the pro layout.
          <div className="invoice-print-body space-y-4 text-sm">
            {/* Header block */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase text-gray-500">Bill To</div>
                <div className="font-medium">{memberName ?? '—'}</div>
                {memberNo && <div className="text-xs text-gray-500 font-mono">{memberNo}</div>}
                {/* V-library-invoice-badge-under-name — status
                    used to sit in the title; moved under the name
                    so it reads as a status of THIS bill-to line
                    rather than getting cropped by the Radix
                    portal's fixed right-edge close button. */}
                <div className="mt-1.5">{statusBadge(invoice.status)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-gray-500">Issue Date</div>
                <div>{formatDate(invoice.issueDate)}</div>
                {invoice.dueDate && (
                  <>
                    <div className="text-xs uppercase text-gray-500 mt-2">Due</div>
                    <div>{formatDate(invoice.dueDate)}</div>
                  </>
                )}
              </div>
            </div>

            {invoice.purpose && (
              <div className="rounded-md border-l-4 border-indigo-300 bg-indigo-50 px-3 py-2">
                <div className="text-xs uppercase text-indigo-700">Purpose</div>
                <div className="text-indigo-900">{invoice.purpose}</div>
              </div>
            )}

            {/* Items */}
            <div className="rounded-md border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Unit Price</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map(it => (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{it.name}</div>
                        {it.description && (
                          <div className="text-xs text-gray-500">{it.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {Number(it.quantity).toLocaleString()}{it.unit ? ` ${it.unit}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmtMoney(it.unitPrice, invoice.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmtMoney(Number(it.quantity) * Number(it.unitPrice), invoice.currency)}
                      </td>
                    </tr>
                  ))}
                  {invoice.items.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-4 text-gray-500">No line items.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <table className="text-sm">
                <tbody>
                  <tr>
                    <td className="pr-6 py-1 text-right text-gray-600">Subtotal</td>
                    <td className="text-right tabular-nums">{fmtMoney(invoice.subtotal, invoice.currency)}</td>
                  </tr>
                  {Number(invoice.discountAmount) > 0 && (
                    <tr>
                      <td className="pr-6 py-1 text-right text-gray-600">Discount</td>
                      <td className="text-right tabular-nums text-red-600">
                        − {fmtMoney(invoice.discountAmount, invoice.currency)}
                      </td>
                    </tr>
                  )}
                  {Number(invoice.taxAmount) > 0 && (
                    <tr>
                      <td className="pr-6 py-1 text-right text-gray-600">Tax</td>
                      <td className="text-right tabular-nums">{fmtMoney(invoice.taxAmount, invoice.currency)}</td>
                    </tr>
                  )}
                  <tr className="border-t">
                    <td className="pr-6 py-1 text-right font-semibold">Total</td>
                    <td className="text-right tabular-nums font-semibold">
                      {fmtMoney(invoice.total, invoice.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-6 py-1 text-right text-gray-600">Paid</td>
                    <td className="text-right tabular-nums text-emerald-700">
                      {fmtMoney(invoice.paidAmount, invoice.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-6 py-1 text-right font-semibold">Balance</td>
                    <td className="text-right tabular-nums font-semibold">
                      {fmtMoney((Number(invoice.total) - Number(invoice.paidAmount)), invoice.currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {invoice.notes && (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-xs uppercase text-gray-500">Notes</div>
                <div className="whitespace-pre-wrap">{invoice.notes}</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>

          {/* V-library-invoice-send-menu — Email + Forward to.
              (Bot Link removed — Forward to is the canonical
              image-share path.) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!invoice || loading || sending}>
                {sending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Send className="h-4 w-4 mr-2" />}
                Send
                <ChevronDown className="h-3 w-3 ml-1.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void sendEmail(); }}
                                disabled={sending}>
                <Mail className="h-4 w-4 mr-2 text-blue-600" />
                Email
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); forwardShare.open(); }}>
                <Share2 className="h-4 w-4 mr-2 text-blue-600" />
                Forward to
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={doPrint} disabled={!invoice || loading}
                  title="Open the professional invoice template in a new tab">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </DialogFooter>

        {/* V-library-invoice-forward-share — shared big-icon
            Telegram + Messenger chooser. Same flow the sale-side
            Invoice / Quotation dialogs use: captures the popup's
            .print-tax-invoice body via html2canvas + downloads
            the PNG + opens the target app (desktop) or the OS
            share sheet (mobile). */}
        {forwardShare.dialog}

        {/* V-library-invoice-print-pro — Cambodian tax-invoice
            layout mirroring the sale-side PrintTaxInvoice output.
            display:none on screen; @media print shows it (and hides
            everything else). Also carries the .print-tax-invoice
            class so capturePrintImage renders THIS for Forward-to,
            not the compact preview above. */}
        {invoice && (
          <ProInvoicePrint
            invoice={invoice}
            memberName={memberName ?? null}
            memberNo={memberNo ?? null}
            company={companyInfo}
            formatDate={formatDate}
            fmtMoney={fmtMoney}
          />
        )}

        {/* V-library-invoice-print-inline — @media print scope.
            When body.printing-library-invoice is on:
              1. everything is display:none,
              2. except any .print-tax-invoice descendant chain
                 (Radix portals the dialog to body, so we can't
                 use a `body >` direct-child selector like the
                 sale-side Invoice does — a general descendant
                 rule covers both portal + non-portal mounts),
              3. the invoice body itself is re-anchored top-left
                 at full width so the printout uses the whole
                 sheet rather than the Radix modal's centered box.
            @page margin drops to 12mm so the compact preview
            spreads to a normal A4 print without cramping. */}
        <style>{`
          @media print {
            /* A4 with zero @page margin so the pro template fills the
               whole sheet + we don't get the browser's default 1cm
               white belt around it. The template's own 12mm padding
               provides the visual gutter. */
            @page { size: A4; margin: 0; }

            html, body { margin: 0 !important; padding: 0 !important; }

            body.printing-library-invoice * { visibility: hidden !important; }
            body.printing-library-invoice .print-tax-invoice,
            body.printing-library-invoice .print-tax-invoice * { visibility: visible !important; }

            /* position:fixed anchors to the viewport (the printed
               page) instead of the Dialog's centered layer, so the
               invoice starts at the top-left of A4 instead of
               floating in the middle. */
            body.printing-library-invoice .print-tax-invoice {
              display: block !important;
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 210mm !important;
              min-height: 297mm !important;
              box-sizing: border-box !important;
              background: white !important;
              box-shadow: none !important;
              margin: 0 !important;
              padding: 12mm !important;
              color: black !important;
              font-family: 'Battambang', 'Noto Sans Khmer', system-ui, sans-serif !important;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================================
   V-library-invoice-print-pro — Cambodian tax-invoice layout.

   Mirrors the sale-side PrintTaxInvoice output (Store-Demo style):
   company header, VAT-TIN boxes, bilingual Khmer/English labels,
   item table, subtotal + grand totals, signature blocks. PAID stamp
   overlays diagonally when invoice.status === 'paid'.

   Rendered display:none on screen. Print CSS in the parent dialog
   shows THIS element and hides everything else so window.print()
   produces the professional layout regardless of what the popup's
   compact preview shows.
   ============================================================================ */
function ProInvoicePrint({
  invoice, memberName, memberNo, company, formatDate, fmtMoney,
}: {
  invoice: invoicesApi.Invoice;
  memberName: string | null;
  memberNo: string | null;
  company: settingsApi.CompanyInfo | null;
  formatDate: (d: string) => string;
  fmtMoney: (n: number | null | undefined, currency?: string | null) => string;
}) {
  const isPaid = invoice.status === 'paid';
  const primary = invoice.currency || 'USD';
  const rate = Number(invoice.exchangeRate) || 0;
  const showKhr = primary === 'USD' && rate > 0;
  const khrTotal = showKhr ? Math.round(Number(invoice.total) * rate) : 0;

  // Portal to document.body — Radix DialogContent uses `transform:
  // translate(-50%, -50%)` for centering, which anchors any
  // position:fixed descendant to itself instead of the viewport.
  // Rendering here as a body-level sibling restores viewport-anchored
  // fixed positioning so the printed template starts at 0,0 and fills
  // A4.
  return createPortal(
    <div
      className="print-tax-invoice"
      style={{
        position: 'fixed',
        left: '-10000px',
        top: 0,
        width: '210mm',       // A4 portrait width — same as @page
        minHeight: '297mm',   // A4 portrait height
        boxSizing: 'border-box',
        background: 'white',
        padding: '12mm',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        .print-tax-invoice { padding: 0; font-family: 'Battambang', 'Noto Sans Khmer', system-ui, sans-serif; color: #000; }
        .print-tax-invoice .kh-title { font-family: 'Khmer OS Muol Light', 'Moul', 'Battambang', serif; font-weight: 400; letter-spacing: 0.5px; }
        .print-tax-invoice table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .print-tax-invoice table td, .print-tax-invoice table th { word-wrap: break-word; overflow-wrap: break-word; }
        .print-tax-invoice td, .print-tax-invoice th { border: 1px solid #000; padding: 4px 6px; font-size: 12px; vertical-align: top; }
        .print-tax-invoice .thead th { text-align: center; font-weight: 700; }
        .print-tax-invoice .kh-label { color: #6b21a8; font-size: 11px; }
        .print-tax-invoice .totals-row td { border: 1px solid #000; text-align: right; padding: 4px 6px; }
        .print-tax-invoice .totals-row td:last-child { font-weight: 700; }
        .print-tax-invoice .paid-stamp {
          position: absolute; top: 90px; right: 40px;
          border: 4px solid #dc2626; color: #dc2626;
          padding: 8px 24px; font-weight: 900; font-size: 32px;
          transform: rotate(-18deg); letter-spacing: 4px;
          font-family: system-ui, sans-serif; opacity: 0.85;
          box-shadow: 0 0 0 2px #dc2626 inset;
        }
        .print-tax-invoice .vat-tin-box { display: inline-block; border: 1px solid #000; width: 20px; height: 24px; text-align: center; font-family: monospace; font-size: 14px; line-height: 24px; margin-right: 2px; }
        .print-tax-invoice .sig-block { border-top: 1px solid #000; padding-top: 6px; text-align: center; margin-top: 60px; }
      `}</style>

      {/* Header — company block */}
      <div style={{ position: 'relative', textAlign: 'center', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ width: 90 }}>
            {company?.logoUrl && (
              <img src={company.logoUrl} alt="" style={{ width: 80, height: 'auto', objectFit: 'contain' }} />
            )}
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{company?.name ?? '—'}</div>
            <div style={{ fontSize: 11, marginTop: 2, whiteSpace: 'pre-line' }}>{company?.address ?? ''}</div>
            <div style={{ fontSize: 11 }}>{company?.phone ?? ''}</div>
          </div>
          <div style={{ width: 90 }} />
        </div>

        {/* VAT TIN */}
        {company?.taxId && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11 }}>
            <span>លេខអត្តសញ្ញាណកម្ម អតប <span className="kh-label">VAT TIN</span></span>
            <span>
              {company.taxId.replace(/[^A-Za-z0-9]/g, '').split('').map((ch, i) => (
                <span key={i} className="vat-tin-box">{ch}</span>
              ))}
            </span>
          </div>
        )}

        <div style={{ borderTop: '1px solid #000', marginTop: 12 }} />

        {/* Bilingual title */}
        <div style={{ margin: '18px 0 6px' }}>
          <div className="kh-title" style={{ fontSize: 26 }}>វិក័យបត្រ</div>
          <div style={{ fontSize: 12, letterSpacing: 2 }}>INVOICE</div>
        </div>

        {isPaid && <div className="paid-stamp">PAID</div>}
      </div>

      {/* Meta grid: customer + invoice + issue date */}
      <div style={{ marginTop: 20, fontSize: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 6, marginBottom: 6 }}>
          <div>
            <div>ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន</div>
            <div className="kh-label">Company Name / Customer</div>
          </div>
          <div style={{ fontWeight: 700 }}>{memberName ?? '—'}{memberNo ? ` (${memberNo})` : ''}</div>
          <div>
            <div>លេខវិក័យបត្រ</div>
            <div className="kh-label">Invoice N°</div>
          </div>
          <div style={{ fontWeight: 700 }}>{invoice.invoiceNo}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 6, marginBottom: 6 }}>
          <div>
            <div>អាសយដ្ឋាន</div>
            <div className="kh-label">Address</div>
          </div>
          <div>—</div>
          <div>
            <div>កាលបរិច្ឆេទ</div>
            <div className="kh-label">Issue Date</div>
          </div>
          <div>{formatDate(invoice.issueDate)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', gap: 6 }}>
          <div>
            <div>ទូរស័ព្ទលេខ , អ្នកតំណាង</div>
            <div className="kh-label">Telephone No. , Representative</div>
          </div>
          <div>—</div>
          <div>
            <div>ថ្ងៃផុតកំណត់បង់ប្រាក់</div>
            <div className="kh-label">Payment Due Date</div>
          </div>
          <div>{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</div>
        </div>
      </div>

      {/* Items table */}
      <table style={{ marginTop: 18 }}>
        <thead className="thead">
          <tr>
            <th style={{ width: 40 }}>ល.រ.<br /><span className="kh-label">N°</span></th>
            <th>មុខទំនិញឬសេវាកម្ម ឬ សេវាកម្ម<br /><span className="kh-label">Item</span></th>
            <th style={{ width: 60 }}>ឯកតា<br /><span className="kh-label">UOM</span></th>
            <th style={{ width: 60 }}>ចំនួន<br /><span className="kh-label">Qty</span></th>
            <th style={{ width: 90 }}>តម្លៃរាយ<br /><span className="kh-label">Unit Price</span></th>
            <th style={{ width: 90 }}>បញ្ចុះតម្លៃ<br /><span className="kh-label">Discount</span></th>
            <th style={{ width: 90 }}>តម្លៃទំនិញ<br /><span className="kh-label">Total</span></th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={it.id}>
              <td style={{ textAlign: 'center' }}>{i + 1}</td>
              <td>{it.name}{it.description ? ` — ${it.description}` : ''}</td>
              <td style={{ textAlign: 'center' }}>{it.unit ?? 'pcs'}</td>
              <td style={{ textAlign: 'center' }}>{Number(it.quantity).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(it.unitPrice, primary)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(0, primary)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(Number(it.quantity) * Number(it.unitPrice), primary)}</td>
            </tr>
          ))}
          {/* Totals */}
          <tr className="totals-row">
            <td colSpan={6} style={{ textAlign: 'right' }}>សរុប ({primary}) / Sub Total ({primary})</td>
            <td>{fmtMoney(invoice.subtotal, primary)}</td>
          </tr>
          <tr className="totals-row">
            <td colSpan={6} style={{ textAlign: 'right' }}>សរុប ({primary}) / Grand Total ({primary})</td>
            <td>{fmtMoney(invoice.total, primary)}</td>
          </tr>
          {showKhr && (
            <tr className="totals-row">
              <td colSpan={6} style={{ textAlign: 'right' }}>សរុប (KHR) / Grand Total (KHR)</td>
              <td>៛ {khrTotal.toLocaleString()}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Notes + rate */}
      <div style={{ marginTop: 18, fontSize: 12 }}>
        <div style={{ fontWeight: 700 }}>សម្គាល់ / Notes</div>
        <div>អត្រាប្តូរប្រាក់ / Exchange rate : {rate || 1}</div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>Thank you for your business!</div>
      </div>

      {/* Signature blocks */}
      <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, fontSize: 12 }}>
        <div className="sig-block">
          <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
          <div className="kh-label">Customer's Signature &amp; Name</div>
        </div>
        <div className="sig-block">
          <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
          <div className="kh-label">Seller's Signature &amp; Name</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
