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
}

export function buildPosReceiptInner(args: BuildArgs): string {
  const { order, settings, items, shopNameFallback } = args;
  const when = new Date(order.checkedOutAt ?? order.createdAt);
  const datePart = when.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  const shopName = (settings.posShopName ?? '').trim() || shopNameFallback || 'SHOP NAME';

  const logo = (settings.posLogoUrl ?? '').trim()
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

  const customerBlock = `
    <div class="kv"><span class="kv-k">Customer</span><span class="kv-v">${esc(customerName || '—')}</span></div>
    <div class="kv"><span class="kv-k">Receipt No</span><span class="kv-v">${receiptNo}</span></div>
    <div class="kv"><span class="kv-k">Date</span><span class="kv-v">${esc(datePart)} · ${esc(timePart)}</span></div>
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
      <span class="stamp-date">${esc(datePart)}</span>
      ${paidStamp}
    </div>
  `;

  const queueFooter = settings.posShowQueueNo
    ? `<div class="queue">#${seq}</div>`
    : '';

  return `
    <div class="receipt">
      <div class="title">Receipt</div>
      ${logo}
      <div class="shop">${esc(shopName)}</div>
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
      <div class="kv"><span class="kv-k">Paid Amount</span><span class="kv-v">$${received.toFixed(2)}</span></div>
      ${changeRow}
      ${khrRow}
      <div class="kv"><span class="kv-k">Method</span><span class="kv-v">${esc(methodLabel)}</span></div>

      ${stampRow}

      <div class="thanks">Thank you!</div>
      ${queueFooter}
    </div>
  `;
}

function buildPosReceiptDoc(args: BuildArgs): string {
  const paper = args.settings.posPaperSize;
  const pageCss = paper === 'thermal_80'
    ? '@page { size: 80mm auto; margin: 4mm; }'
    : `@page { size: ${paper.toUpperCase()}; margin: 10mm; }`;
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
      .cashier { text-align: center; font-size: 10px; color: #6b7280; margin-top: 2px; }

      .rule { border-top: 1px solid #e5e7eb; margin: 10px 0; }

      .big-total {
        color: #dc2626;
        font-size: 24px;
        font-weight: 700;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
      }
      .big-total-sub { font-size: 11px; color: #4b5563; margin-top: 2px; margin-bottom: 8px; }

      .customer .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; padding: 2px 0; }
      .customer .kv-k { color: #6b7280; }
      .customer .kv-v { color: #111827; text-align: right; }

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
      .stamp-date { color: #dc2626; font-size: 11px; font-weight: 500; }
      .paid-stamp {
        display: inline-block;
        border: 2px solid #ef4444;
        color: #dc2626;
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
  const w = window.open('', '_blank', 'width=380,height=720');
  if (!w) return false;
  w.document.write(buildPosReceiptDoc(args));
  w.document.close();
  w.focus();
  w.print();
  setTimeout(() => { try { w.close(); } catch { /* user may have closed already */ } }, 600);
  return true;
}
