/**
 * POS receipt — shared HTML builder + print helper (V130 family).
 *
 * Built as a plain HTML-string generator (no React) so it can be
 * called from anywhere — the POS page after checkout, the Invoice
 * detail dialog when re-printing a POS-originated invoice (V135),
 * or any future "send receipt" path. Keeping the markup in one place
 * means the on-paper layout stays in sync no matter who triggers it.
 *
 * Layout mirrors the in-dialog PosReceiptBody preview: Receipt header,
 * optional logo, shop name + cashier, big red total, customer block,
 * Item/Amount table, totals, tilted PAID stamp, "Thank you!", queue #.
 */
import type { PosOrder } from '../api/pos';
import type { AccountingSettings } from '../api/accountingSettings';
import type { Item } from '../api/items';
import { printHtmlViaIframe } from './printHtml';
import type { TemplateConfig } from '../api/invoiceTemplates';

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lineSku(stockItemId: string | null, items: Item[]): string | null {
  if (!stockItemId) return null;
  const it = items.find(i => i.id === stockItemId);
  return it?.sku ?? null;
}

interface BuildArgs {
  order: PosOrder;
  settings: AccountingSettings;
  items: Item[];
  shopNameFallback?: string;
  /** Optional override for the "Date" line at the top of the
   *  receipt. When set, drives the printed DATE portion; the TIME
   *  portion still comes from the order's checkout timestamp
   *  (transaction time). Lets a re-print from the invoice detail
   *  dialog honour the invoice's issueDate — which may have been
   *  edited off the raw checkout date. Empty / undefined → fall back
   *  to the order's checkout date. Accepts YYYY-MM-DD or Date. */
  issueDateOverride?: string | Date | null;
  /** Optional override for the date printed next to the PAID stamp.
   *  When set, uses this (the payment's actual date) instead of the
   *  order's checkout date. Lets a re-print from the invoice detail
   *  dialog honour a backdated / separately-recorded payment. Empty
   *  or undefined → fall back to the order's checkout date. Accepts
   *  an ISO YYYY-MM-DD string or a Date. */
  paidDateOverride?: string | Date | null;
  /** The company's own address / phone, printed under the shop name so
   *  the receipt says who issued it and how to reach them. */
  company?: { address?: string | null; phone?: string | null } | null;
  /** The customer RECORD's phone / address (a POS order carries only a
   *  name). Each row prints only when filled in, so a walk-in looks as
   *  before. */
  customer?: { phone?: string | null; address?: string | null } | null;
  /**
   * v-receipt-follows-template — the tenant's default RECEIPT
   * template.
   *
   * Until now nothing called getDefault('receipt'): a Receipt
   * template could be configured, set as default and previewed, and
   * no print path ever read it. The receipt was driven entirely by
   * POS settings instead.
   *
   * Where the two describe the same thing the TEMPLATE wins — title,
   * logo, company block, thank-you line, paper size. POS settings
   * keep everything the template has no field for: the SKU prefix,
   * the queue number, the cashier line, the PAID stamp.
   *
   * Null (no default receipt template saved) means POS settings
   * alone, exactly as receipts printed before, so a tenant who never
   * made one sees no change.
   */
  template?: TemplateConfig | null;
}

export function buildPosReceiptInner(args: BuildArgs): string {
  const { order, settings, items, shopNameFallback, issueDateOverride, paidDateOverride, company, customer } = args;
  const when = new Date(order.checkedOutAt ?? order.createdAt);
  // Time portion — always from the transaction (checkedOutAt). The
  // date can drift (via edited issueDate or backdated payment) but
  // the wall-clock moment of sale is a fact.
  const timePart = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtShortDate = (d: Date) =>
    d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Top-of-receipt "Date" — invoice issueDate wins when supplied,
  // falls back to the order's checkout date. Prints the invoice's
  // authoritative date rather than the raw POS-order timestamp,
  // which the operator may have shifted via Edit.
  const issueWhen: Date | null = issueDateOverride
    ? (issueDateOverride instanceof Date ? issueDateOverride : new Date(issueDateOverride))
    : null;
  const datePart = issueWhen && !Number.isNaN(issueWhen.getTime())
    ? fmtShortDate(issueWhen)
    : fmtShortDate(when);
  // Stamp date — payment's actual date when supplied. Kept separate
  // from datePart because the two can legitimately differ (e.g.
  // invoice issued Aug 12 but paid Aug 11).
  const paidWhen: Date | null = paidDateOverride
    ? (paidDateOverride instanceof Date ? paidDateOverride : new Date(paidDateOverride))
    : null;
  const stampDatePart = paidWhen && !Number.isNaN(paidWhen.getTime())
    ? fmtShortDate(paidWhen)
    : datePart;
  const shopName = (settings.posShopName ?? '').trim() || shopNameFallback || 'SHOP NAME';

  /* The saved Receipt template. Each test below mirrors the one the
   * thermal preview uses, so what the operator configured is what
   * comes off the printer. With no template every old behaviour is
   * kept verbatim — and there is no legacy to preserve for a tenant
   * who HAS one, because this config has never reached a printer. */
  const tpl = args.template ?? null;
  const th  = tpl?.header ?? {};
  const tf  = tpl?.footer ?? {};
  const accent     = th.accentColor ?? '#dc2626';
  const showLogo   = tpl ? !!th.showLogo : true;
  const showCoBlk  = tpl ? th.showCompanyBlock !== false : true;
  const titleText  = (th.title ?? '').trim() || 'Receipt';
  const showThanks = tpl ? tf.showThankYou !== false : true;
  const thanksText = (tf.thankYouText ?? '').trim() || 'Thank you!';

  const logo = showLogo && (settings.posLogoUrl ?? '').trim()
    ? `<div class="logo-wrap"><img src="${esc(settings.posLogoUrl!)}" alt="" class="logo" /></div>`
    : '';
  const cashierParts: string[] = [];
  if (order.createdByName)  cashierParts.push(esc(order.createdByName));
  if (order.createdByPhone) cashierParts.push(esc(order.createdByPhone));
  const cashier = cashierParts.length
    ? `<div class="cashier">Cashier: ${cashierParts.join(' · ')}</div>`
    : '';

  const customerName = (order.customerName ?? '').trim();
  const seq = String(order.queueSeq).padStart(3, '0');
  const receiptNo = `#${seq}`;

  // Company contact under the shop name — address, then phone, each
  // only when set (same order as the mobile receipt).
  const companyAddress = (company?.address ?? '').trim();
  const companyPhone = (company?.phone ?? '').trim();
  const shopContact = !showCoBlk ? '' : [
    companyAddress ? `<div class="shop-sub">${esc(companyAddress)}</div>` : '',
    companyPhone ? `<div class="shop-sub">Tel: ${esc(companyPhone)}</div>` : '',
  ].join('');

  // Customer phone / address rows. An address may run long, so its
  // value wraps instead of being cut at the paper edge. The date is
  // printed once, under the big total — not repeated here.
  const custPhone = (customer?.phone ?? '').trim();
  const custAddress = (customer?.address ?? '').trim();
  const phoneRow = custPhone
    ? `<div class="kv"><span class="kv-k">Phone</span><span class="kv-v">${esc(custPhone)}</span></div>`
    : '';
  const addressRow = custAddress
    ? `<div class="kv"><span class="kv-k">Address</span><span class="kv-v kv-wrap">${esc(custAddress)}</span></div>`
    : '';
  const customerBlock = `
    <div class="kv"><span class="kv-k">Customer</span><span class="kv-v">${esc(customerName || '—')}</span></div>
    ${phoneRow}
    ${addressRow}
    <div class="kv"><span class="kv-k">Receipt No</span><span class="kv-v">${receiptNo}</span></div>
  `;

  const lines = order.items.map(i => {
    const sku = lineSku(i.stockItemId, items);
    const label = settings.posShowSku && sku ? `${esc(sku)}  ${esc(i.name)}` : esc(i.name);
    const qtySub = i.quantity > 1
      ? `<div class="line-sub">${i.quantity} × $${(i.lineTotal / i.quantity).toFixed(2)}</div>`
      : '';
    const note = i.notes ? `<div class="line-note">· ${esc(i.notes)}</div>` : '';
    return `<div class="line">
        <div class="line-row">
          <span class="line-name">${label}</span>
          <span class="line-amt">$${i.lineTotal.toFixed(2)}</span>
        </div>
        ${qtySub}
        ${note}
      </div>`;
  }).join('');

  const subtotalRow = order.subtotal !== order.total
    ? `<div class="kv"><span class="kv-k">Subtotal</span><span class="kv-v">$${order.subtotal.toFixed(2)}</span></div>`
    : '';
  const discountRow = order.discountValue > 0
    ? `<div class="kv"><span class="kv-k">Discount</span><span class="kv-v">-$${order.discountValue.toFixed(2)}</span></div>`
    : '';
  const taxLabel = order.invoiceKind === 'tax' ? 'Tax (VAT 10%)' : 'Tax';
  const taxRow = order.taxAmount > 0
    ? `<div class="kv"><span class="kv-k">${taxLabel}</span><span class="kv-v">$${order.taxAmount.toFixed(2)}</span></div>`
    : '';

  const methodLabel = (order.paymentMethod ?? 'cash').toUpperCase();
  const received = order.paymentReceived ?? order.total;
  const change   = order.paymentChange ?? 0;
  /* v-receipt-deposit-remain — a part payment says so.
   *
   * The receipt printed "Paid Amount" and stopped, so a customer who
   * put money down saw what they had paid and no sign of what was
   * left — the one number that matters on a deposit. The A4 invoice
   * has carried Deposit / Remain for this case all along; the
   * receipt now uses the same two words for the same situation.
   *
   * Partial means money taken but not all of it. A full payment
   * keeps the single "Paid Amount" line it has always had, and
   * overpayment stays Paid Amount + Change rather than a negative
   * remainder. */
  const remaining = order.total - received;
  const isPartial = received > 0 && remaining > 0.005;
  const paidRows = isPartial
    ? `<div class="kv"><span class="kv-k">Deposit</span><span class="kv-v">${received.toFixed(2)}</span></div>
       <div class="kv"><span class="kv-k">Remain</span><span class="kv-v">${remaining.toFixed(2)}</span></div>`
    : `<div class="kv"><span class="kv-k">Paid Amount</span><span class="kv-v">${received.toFixed(2)}</span></div>`;
  const changeRow = change > 0
    ? `<div class="kv"><span class="kv-k">Change</span><span class="kv-v">$${change.toFixed(2)}</span></div>`
    : '';

  const rate = order.exchangeRate ?? 0;
  const khrTotal = order.currency === 'USD' && rate > 0 ? order.total * rate : 0;
  const khrRow = khrTotal > 0
    ? `<div class="kv"><span class="kv-k">Total KHR (@ ${rate.toLocaleString('en-US')})</span><span class="kv-v">៛ ${khrTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>`
    : '';

  const paidStamp = settings.posShowPaidStamp
    ? `<span class="paid-stamp">PAID</span>`
    : '';

  const stampRow = `
    <div class="stamp-row">
      <span class="stamp-date">${esc(stampDatePart)}</span>
      ${paidStamp}
    </div>
  `;

  const queueFooter = settings.posShowQueueNo
    ? `<div class="queue">#${seq}</div>`
    : '';

  return `
    <div class="receipt" style="--rcpt-accent: ${esc(accent)}">
      <div class="title">${esc(titleText)}</div>
      ${logo}
      ${showCoBlk ? `<div class="shop">${esc(shopName)}</div>` : ''}
      ${shopContact}
      ${cashier}

      <div class="rule"></div>

      <div class="big-total">$${order.total.toFixed(2)}</div>
      <div class="big-total-sub">Date ${esc(datePart)} · ${esc(timePart)}</div>

      <div class="customer">
        ${customerBlock}
      </div>

      <div class="rule"></div>

      <div class="th"><span>Item</span><span>Amount</span></div>
      <div class="th-rule"></div>
      ${lines}

      <div class="rule"></div>

      ${subtotalRow}
      ${discountRow}
      ${taxRow}
      <div class="kv total"><span class="kv-k">Total Due</span><span class="kv-v">$${order.total.toFixed(2)}</span></div>
      ${paidRows}
      ${changeRow}
      ${khrRow}
      <div class="kv"><span class="kv-k">Method</span><span class="kv-v">${esc(methodLabel)}</span></div>

      ${stampRow}

      ${showThanks ? `<div class="thanks">${esc(thanksText)}</div>` : ''}
      ${queueFooter}
    </div>
  `;
}

function buildPosReceiptDoc(args: BuildArgs): string {
  /* The template's paper wins when it names a roll width; otherwise
   * the POS setting decides, as before. */
  const tplPaper = args.template?.paperSize;
  const paper = args.settings.posPaperSize;
  const pageCss =
      tplPaper === '58mm'    ? '@page { size: 58mm auto; margin: 3mm; }'
    : tplPaper === '80mm'    ? '@page { size: 80mm auto; margin: 4mm; }'
    : paper === 'thermal_80' ? '@page { size: 80mm auto; margin: 4mm; }'
    :                          `@page { size: ${paper.toUpperCase()}; margin: 10mm; }`;
  const inner = buildPosReceiptInner(args);

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Receipt</title>
    <style>
      ${pageCss}
      * { box-sizing: border-box; }
      body {
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #111;
        margin: 0;
        padding: 4mm;
        font-variant-numeric: tabular-nums;
      }
      .receipt { max-width: 300px; margin: 0 auto; }

      .title { text-align: center; font-size: 13px; font-weight: 600; color: #1f2937; }
      .logo-wrap { text-align: center; margin: 6px 0 4px; }
      .logo { max-height: 56px; max-width: 100%; object-fit: contain; }
      .shop { text-align: center; font-weight: 700; margin-top: 4px; }
      .shop-sub { text-align: center; font-size: 10px; color: #4b5563; margin-top: 1px; white-space: pre-line; }
      .cashier { text-align: center; font-size: 10px; color: #6b7280; margin-top: 2px; }

      .rule { border-top: 1px solid #e5e7eb; margin: 10px 0; }

      .big-total {
        /* v-receipt-follows-template — the template's accent, with
           the old red as the fallback for any caller rendering this
           markup without the custom property. */
        color: var(--rcpt-accent, #dc2626);
        font-size: 24px;
        font-weight: 700;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
      }
      .big-total-sub { font-size: 11px; color: #4b5563; margin-top: 2px; margin-bottom: 8px; }

      .customer .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; padding: 2px 0; }
      .customer .kv-k { color: #6b7280; }
      .customer .kv-v { color: #111827; text-align: right; }
      .customer .kv-wrap { white-space: pre-wrap; word-break: break-word; max-width: 62%; }

      .th { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; color: #111827; }
      .th-rule { border-top: 1px solid #111827; margin: 2px 0 6px; }

      .line { margin: 4px 0; }
      .line-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
      .line-name { flex: 1; padding-right: 8px; color: #111827; }
      .line-amt { color: #111827; font-variant-numeric: tabular-nums; }
      .line-sub { font-size: 10px; color: #6b7280; margin-top: 1px; }
      .line-note { font-size: 10px; color: #6b7280; font-style: italic; margin-top: 1px; padding-left: 4px; }

      .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 2px 0; }
      .kv-k { color: #4b5563; }
      .kv-v { color: #111827; text-align: right; font-variant-numeric: tabular-nums; }
      .total .kv-k, .total .kv-v { font-weight: 700; font-size: 13px; color: #111827; }

      .stamp-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 14px;
        min-height: 36px;
      }
      .stamp-date { color: var(--rcpt-accent, #dc2626); font-size: 11px; font-weight: 500; }
      .paid-stamp {
        display: inline-block;
        border: 2px solid var(--rcpt-accent, #ef4444);
        color: var(--rcpt-accent, #dc2626);
        padding: 2px 12px;
        font-weight: 700;
        letter-spacing: 0.15em;
        transform: rotate(-6deg);
        font-size: 14px;
      }

      .thanks { text-align: center; color: #374151; font-size: 12px; margin-top: 12px; }
      .queue { text-align: center; color: #9ca3af; font-size: 10px; margin-top: 4px; }
    </style></head><body>${inner}</body></html>`;
}

export function printPosReceipt(args: BuildArgs): boolean {
  return printHtmlViaIframe(buildPosReceiptDoc(args));
}
