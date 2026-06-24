/**
 * POS receipt — shared HTML builder + print helper (V130 family).
 *
 * Built as a plain HTML-string generator (no React) so it can be
 * called from anywhere — the POS page after checkout, the Invoice
 * detail dialog when re-printing a POS-originated invoice (V135),
 * or any future "send receipt" path. Keeping the markup in one place
 * means the on-paper layout stays in sync no matter who triggers it.
 */
import type { PosOrder } from '../api/pos';
import type { AccountingSettings } from '../api/accountingSettings';
import type { Item } from '../api/items';

/** Escape a string for safe interpolation into HTML. Defensive — the
 *  order data comes from the API but lines might carry an operator-
 *  typed name / note with `<` in it. */
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Resolve a per-line SKU from the items catalog. The cart snapshot
 *  doesn't carry SKU — we look it up from {@code stockItemId} when
 *  the settings ask for the prefix. Falls back to null when the
 *  link is missing. */
function lineSku(stockItemId: string | null, items: Item[]): string | null {
  if (!stockItemId) return null;
  const it = items.find(i => i.id === stockItemId);
  return it?.sku ?? null;
}

interface BuildArgs {
  order: PosOrder;
  settings: AccountingSettings;
  items: Item[];
  /** Used when {@code settings.posShopName} is blank (typical for
   *  fresh tenants). The Invoice detail can pass the tenant's name
   *  here so the receipt still carries a real header. */
  shopNameFallback?: string;
}

/** Returns the inner HTML of the receipt — the part that lives
 *  inside the body, without the wrapping <html>/<style>. Useful when
 *  embedding the receipt into an existing on-screen container too. */
export function buildPosReceiptInner(args: BuildArgs): string {
  const { order, settings, items, shopNameFallback } = args;
  const when = new Date(order.checkedOutAt ?? order.createdAt);
  const datePart = when.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
  const shopName = (settings.posShopName ?? '').trim() || shopNameFallback || 'SHOP NAME';

  const star = '*'.repeat(36);
  const dot  = '- '.repeat(18).trim();

  // V138 — optional shop logo + V138 cashier line. Both are gated on
  // their respective data so a tenant without a logo / unlinked user
  // still gets a clean header.
  const logo = (settings.posLogoUrl ?? '').trim()
    ? `<div class="logo-wrap"><img src="${esc(settings.posLogoUrl!)}" alt="" class="logo" /></div>`
    : '';
  const cashierParts: string[] = [];
  if (order.createdByName)  cashierParts.push(esc(order.createdByName));
  if (order.createdByPhone) cashierParts.push(esc(order.createdByPhone));
  const cashier = cashierParts.length
    ? `<div class="cashier">Cashier: ${cashierParts.join(' · ')}</div>`
    : '';

  const lines = order.items.map(i => {
    const sku = lineSku(i.stockItemId, items);
    const labelCore = settings.posShowSku && sku ? `${esc(sku)}   ${esc(i.name)}` : esc(i.name);
    const qtyPrefix = i.quantity > 1 ? `${i.quantity} × ` : '';
    const note = i.notes
      ? `<div class="line-note">· ${esc(i.notes)}</div>`
      : '';
    return `<div class="line">
        <div class="flex">
          <span class="line-name">${qtyPrefix}${labelCore}</span>
          <span class="line-amt">$${i.lineTotal.toFixed(2)}</span>
        </div>
        ${note}
      </div>`;
  }).join('');

  const subtotalRow = order.subtotal !== order.total
    ? `<div class="flex"><span>SUBTOTAL</span><span>$${order.subtotal.toFixed(2)}</span></div>`
    : '';
  const discountRow = order.discountValue > 0
    ? `<div class="flex"><span>DISCOUNT</span><span>-$${order.discountValue.toFixed(2)}</span></div>`
    : '';
  const taxLabel = order.invoiceKind === 'tax' ? 'TAX (VAT 10%)' : 'TAX';
  const taxRow = order.taxAmount > 0
    ? `<div class="flex"><span>${taxLabel}</span><span>$${order.taxAmount.toFixed(2)}</span></div>`
    : '';

  const methodLabel = (order.paymentMethod ?? 'cash').toUpperCase();
  const received = order.paymentReceived ?? order.total;
  const change   = order.paymentChange ?? 0;
  const changeRow = change > 0
    ? `<div class="flex"><span>CHANGE</span><span>$${change.toFixed(2)}</span></div>`
    : '';

  // V141 — KHR equivalent + exchange rate. Only printed for USD
  // orders where the snapshot rate is positive (which is the common
  // path — POS hardcodes USD on the cart side, the rate comes from
  // POS Settings → Receipt). A KHR-priced order wouldn't need the
  // conversion line, so we skip it there.
  const rate = order.exchangeRate ?? 0;
  const khrTotal = order.currency === 'USD' && rate > 0 ? order.total * rate : 0;
  // Single combined line: "Total KHR (@ 4,100)    ៛ 410,000". The
  // rate sits inside the label parens — keeps the receipt compact
  // (fits one 80mm thermal line) and matches what the customer
  // display shows.
  const khrRows = khrTotal > 0
    ? `<div class="flex khr-total"><span>TOTAL KHR (@ ${rate.toLocaleString('en-US')})</span><span>៛ ${khrTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>`
    : '';

  const paidStamp = settings.posShowPaidStamp
    ? `<div class="paid-wrap"><span class="paid-stamp">PAID</span></div>`
    : '';

  // Receipt prints only the zero-padded sequence (e.g. "001") — the
  // full stored queueNo also carries the prefix + date, but those are
  // implicit context the customer doesn't need on the slip. Gated on
  // the posShowQueueNo setting (V137) so a tenant who wants a cleaner
  // slip can hide it.
  const seq = String(order.queueSeq).padStart(3, '0');
  const showQueue = settings.posShowQueueNo;
  const kindFooter = showQueue
    ? (order.invoiceKind
        ? `#${seq} · ${order.invoiceKind === 'tax' ? 'Tax' : 'Commercial'}`
        : `#${seq}`)
    : (order.invoiceKind === 'tax' ? 'Tax' : 'Commercial');

  return `
    ${logo}
    <div class="text-center break-all">${star}</div>
    <div class="title">RECEIPT</div>
    <div class="text-center break-all">${star}</div>

    <div class="shop">${esc(shopName)}</div>
    ${cashier}

    <div class="break-all dim my">${dot}</div>
    <div class="flex">
      <span>DATE :- ${esc(datePart)}</span>
      <span>${esc(timePart)}</span>
    </div>
    <div class="break-all dim my">${dot}</div>

    ${lines}

    <div class="rule"></div>

    ${subtotalRow}
    ${discountRow}
    ${taxRow}
    <div class="flex total"><span>TOTAL</span><span>$${order.total.toFixed(2)}</span></div>
    ${khrRows}
    <div class="flex"><span>${esc(methodLabel)}</span><span>$${received.toFixed(2)}</span></div>
    ${changeRow}

    ${paidStamp}

    <div class="thanks">THANK YOU!</div>
    <div class="footer">${kindFooter}</div>
  `;
}

/** Full document including <style> + @page rule for the chosen paper
 *  size. Used by {@link printPosReceipt} as the pop-up body. */
function buildPosReceiptDoc(args: BuildArgs): string {
  const paper = args.settings.posPaperSize;
  // @page: thermal_80 is continuous-roll, sized 80mm × auto. A4/A5/A6
  // use the matching desktop sheet with normal margins.
  const pageCss = paper === 'thermal_80'
    ? '@page { size: 80mm auto; margin: 4mm; }'
    : `@page { size: ${paper.toUpperCase()}; margin: 10mm; }`;
  const inner = buildPosReceiptInner(args);

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Receipt</title>
    <style>
      ${pageCss}
      body { font: 11px/1.45 'Courier New', monospace; color: #111; margin: 0; padding: 4mm; }
      .text-center { text-align: center; }
      .break-all { word-break: break-all; }
      .my { margin: 4px 0; }
      .dim { color: #555; }
      .flex { display: flex; justify-content: space-between; gap: 8px; }
      .flex > span:first-child { text-align: left; }
      .flex > span:last-child  { text-align: right; }
      .title { text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.15em; margin: 4px 0; }
      .logo-wrap { text-align: center; margin-bottom: 4px; }
      .logo { max-height: 60px; max-width: 100%; object-fit: contain; }
      .shop { font-weight: 700; margin-top: 8px; }
      .cashier { font-size: 10px; color: #555; margin-top: 2px; }
      .line { margin-top: 1px; }
      .line-name { padding-right: 8px; flex: 1; }
      .line-note { padding-left: 12px; font-style: italic; font-size: 10px; color: #333; }
      .rule { border-top: 1px dashed #000; margin: 6px 0; }
      .total { font-weight: 700; }
      .khr-total { font-weight: 700; }
      .paid-wrap { text-align: center; margin-top: 8px; }
      .paid-stamp { display: inline-block; border: 2px double #000; padding: 2px 10px; font-weight: 700; letter-spacing: 0.2em; }
      .thanks { text-align: center; font-weight: 600; margin-top: 8px; }
      .footer { text-align: center; color: #555; font-size: 10px; margin-top: 2px; }
    </style></head><body>${inner}</body></html>`;
}

/** Open a print window with the receipt rendered for the supplied
 *  paper size + show options. Returns true when the window opened,
 *  false when blocked (caller can show a toast). */
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
