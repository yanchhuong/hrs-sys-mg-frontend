import { forwardRef } from 'react';

/**
 * Card-style payment receipt — issued to a customer when they pay
 * against a sale invoice. Mirrors the design mockup the operator
 * shared: centred logo + company header, the amount in accent red
 * with the due-on line under it, a bilingual customer / receipt-no
 * / date meta block, an Item / Amount strip, totals with the paid
 * amount on the last row, a PAID stamp with the payment date, and
 * a "Thank you!" sign-off.
 *
 * <p>All section separators use <b>dashed</b> borders rather than
 * solid lines so the card reads as a printable thermal-receipt
 * silhouette rather than a heavy boxed table — the operator asked
 * for "no black line, keep -----" specifically.</p>
 *
 * <p>Inline styles only (no Tailwind / external CSS) so html2canvas
 * or window.print can snapshot the component exactly as rendered
 * regardless of host page styles.</p>
 */

export interface ReceiptLine {
  name: string;
  /** Optional secondary line under the item name ("Caramel", "Strawberry"). */
  note?: string | null;
  /** Optional quantity-+-unit hint ("1 x Kilogram"). Right-column small text. */
  quantityHint?: string | null;
  /** Amount in this row's currency, already formatted for display
   *  (the caller decides 2dp / 0dp). */
  amount: string;
}

export interface PaymentReceiptProps {
  /** Company logo URL (data: or hosted). Hidden when null. */
  logoUrl?: string | null;
  /** Big company name under the logo. */
  companyName: string;
  /** Two address lines stacked. Either or both may be empty. */
  addressLine1?: string | null;
  addressLine2?: string | null;
  /** Big accent total — e.g. "$1.00". Caller pre-formats. */
  totalDue: string;
  /** "Due on 08 Feb 2025" — caller pre-formats. Blank to hide. */
  dueOn?: string | null;
  /** Customer name (already resolved). */
  customerName: string;
  /** Document number, e.g. "PO-233000-#001". */
  receiptNo: string;
  /** Payment-date string ("01 Feb 2025"). */
  dateText: string;
  /** Item rows in display order. */
  items: ReceiptLine[];
  /** Pre-formatted strings for the bottom totals block. */
  subtotal: string;
  totalDueFooter: string;
  paidAmount: string;
  /** Stamp date — same date as the payment, drives the "01 Feb 2025"
   *  text shown next to the PAID stamp. */
  stampDate: string;
  /** When false, hides the PAID stamp + stampDate row (e.g. a
   *  partial-payment receipt). Default true. */
  showPaidStamp?: boolean;
}

const ACCENT = '#D03B30';   // matches the screenshot's red header amount + PAID stamp
const INK    = '#111';
const RULE   = '#9CA3AF';   // muted grey for dashed dividers — never pure black
const MUTED  = '#6B7280';

export const PaymentReceiptCard = forwardRef<HTMLDivElement, PaymentReceiptProps>(
  function PaymentReceiptCard({
    logoUrl, companyName, addressLine1, addressLine2,
    totalDue, dueOn,
    customerName, receiptNo, dateText,
    items,
    subtotal, totalDueFooter, paidAmount,
    stampDate, showPaidStamp = true,
  }, ref) {
    // Shared style — every horizontal separator on the card uses the
    // SAME dashed rule. Defined once so a future tweak (colour,
    // thickness) lands in one spot.
    const dashed: React.CSSProperties = {
      borderTop: `1px dashed ${RULE}`,
      margin: '12px 0',
    };
    return (
      <div
        ref={ref}
        style={{
          maxWidth: 360,
          padding: '20px 22px',
          background: '#fff',
          color: INK,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.45,
          borderRadius: 6,
          // No border on the OUTER card — the dashed rules between
          // sections are the only horizontal strokes. Mimics the
          // mockup which has no card border, just internal dividers.
        }}
      >
        {/* Title strip — centered "Receipt" label */}
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Receipt
        </div>

        {/* Logo + company block, all centred */}
        <div style={{ textAlign: 'center' }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ maxHeight: 56, maxWidth: '70%', objectFit: 'contain', marginBottom: 6 }}
            />
          )}
          <div style={{ fontWeight: 700, fontSize: 15 }}>{companyName}</div>
          {addressLine1 && (
            <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{addressLine1}</div>
          )}
          {addressLine2 && (
            <div style={{ color: MUTED, fontSize: 12 }}>{addressLine2}</div>
          )}
        </div>

        <div style={dashed} />

        {/* Big accent amount + due-on caption */}
        <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT, lineHeight: 1.15 }}>
          {totalDue}
        </div>
        {dueOn && (
          <div style={{ marginTop: 2, fontWeight: 600 }}>{dueOn}</div>
        )}

        <div style={dashed} />

        {/* Meta block: Customer / Receipt No. / Date — left label,
            right value. Three rows stacked. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
          <div style={{ color: MUTED }}>Customer</div>
          <div style={{ textAlign: 'right', fontWeight: 500 }}>{customerName}</div>

          <div style={{ color: MUTED }}>Receipt No.</div>
          <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{receiptNo}</div>

          <div style={{ color: MUTED }}>Date</div>
          <div style={{ textAlign: 'right' }}>{dateText}</div>
        </div>

        <div style={dashed} />

        {/* Item table — header row, body rows, no footer. Amounts
            right-aligned in their own column. The "quantity hint"
            ("1 x Kilogram") sits as small muted text under the
            amount on the right column so it reads alongside its
            line item without forcing a wide multi-column table. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12 }}>
          <div style={{ fontWeight: 700 }}>Item</div>
          <div style={{ fontWeight: 700, textAlign: 'right' }}>Amount</div>
        </div>

        <div style={dashed} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 12, columnGap: 12 }}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'contents' }}>
              <div>
                <div style={{ fontWeight: 500 }}>{it.name}</div>
                {it.note && (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{it.note}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>{it.amount}</div>
                {it.quantityHint && (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{it.quantityHint}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={dashed} />

        {/* Totals strip — Subtotal / Total Due (emphasised) /
            Paid Amount. Two-column rows aligned with the item
            grid above so the figures stack cleanly under the
            Amount column. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12 }}>
          <div style={{ fontWeight: 600 }}>Subtotal</div>
          <div style={{ textAlign: 'right' }}>{subtotal}</div>

          <div style={{ fontWeight: 700 }}>Total Due</div>
          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{totalDueFooter}</div>

          <div style={{ fontWeight: 600 }}>Paid Amount</div>
          <div style={{ textAlign: 'right' }}>{paidAmount}</div>
        </div>

        {/* PAID stamp row — date on the left, double-bordered
            stamp on the right. Both render in the accent red so
            the eye lands here. Hidden when showPaidStamp=false
            (e.g. partial-payment receipts). */}
        {showPaidStamp && (
          <div style={{
            marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
          }}>
            <div style={{ color: ACCENT, fontFamily: 'monospace', fontWeight: 700 }}>{stampDate}</div>
            <div style={{
              border: `2px solid ${ACCENT}`,
              borderRadius: 4,
              color: ACCENT,
              fontWeight: 700,
              letterSpacing: 2,
              padding: '4px 12px',
              fontSize: 14,
            }}>
              PAID
            </div>
          </div>
        )}

        {/* Sign-off — centered, slightly muted so the eye returns
            from the stamp gracefully. */}
        <div style={{ textAlign: 'center', marginTop: 18, color: MUTED, fontWeight: 500 }}>
          Thank you!
        </div>
      </div>
    );
  },
);
