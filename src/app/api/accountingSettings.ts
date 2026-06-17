import { apiJson } from './client';

/** Independent settings per Sale-side document (V106). Each scope is
 *  fetched / saved independently:
 *  - sale     → Invoice form (INV/TAX/CN/DN prefixes, has Bank Accounts)
 *  - purchase → Bill form
 *  - receipt  → Receipt form
 *  - quotation → Quotation form (single QT prefix, no Bank Accounts)
 *  - voucher   → General Voucher form (single VCH prefix, no Bank Accounts) */
export type AccountingScope = 'sale' | 'purchase' | 'receipt' | 'quotation' | 'voucher';

export interface AccountingSettings {
  showNotes: boolean;
  showTerms: boolean;
  showDiscount: boolean;
  showTax: boolean;
  /** When true, the Invoice form auto-fires a Telegram send after a
   *  successful save. Surfaced as a toggle in the Sale-scope
   *  Accountant Settings popup only — other scopes carry the column
   *  but the UI doesn't expose it (yet). */
  autoSendTelegram: boolean;
  /** Scope-relative prefix fields. For 'sale' these mean Invoice /
   *  Tax Invoice / Credit Note / Debit Note (INV / TAX / CN / DN
   *  defaults). For 'purchase' they mean Bill / Tax Bill / Bill CN
   *  / Bill DN (BILL / TBILL / BCN / BDN defaults). */
  prefixCommercial: string;
  prefixTax: string;
  prefixCreditNote: string;
  prefixDebitNote: string;
  /** Enabled taxation pattern keys for this scope — subset of
   *  ['1','2','3','11','12']. Empty list means no patterns will
   *  appear in the Taxation dropdown on the form. */
  taxTypesEnabled: string[];
  /** Telegram-reminder cadence (V111). All six fields are surfaced
   *  in the Sale-scope dialog only — other scopes carry the columns
   *  but the popup doesn't expose the toggles yet. */
  reminderBeforeDueEnabled: boolean;
  /** How many days before due-date to send the "due soon" ping.
   *  0 = on the due date itself. Range 0..365 enforced server-side. */
  reminderBeforeDueDays: number;
  reminderAfterDueEnabled: boolean;
  /** When false, the past-due reminder fires once and stops. When
   *  true it re-fires on {@link reminderAfterDueFrequency} cadence. */
  reminderAfterDueRepeat: boolean;
  /** 'daily' or 'weekly' — the dialog dropdown enforces the set; the
   *  server's CHECK constraint rejects anything else. */
  reminderAfterDueFrequency: 'daily' | 'weekly';
  /** Fires a one-shot "payment received" message on the PAID
   *  ledger transition. Event-driven, no scheduler involvement. */
  reminderPaidEnabled: boolean;
  /** Date portion of the auto-generated Sale-scope invoice number
   *  (V112). Drives the format string the backend mints next: e.g.
   *  'DDMMYYYY' → INV-17062026-001. */
  numberDateFormat: 'DDMMYYYY' | 'MMYYYY' | 'YYYY';
  /** Zero-pad width for the sequence portion. Dialog allows 2/3/4. */
  numberSeqWidth: number;
  /** ISO-8601 timestamp of the last save, or null when the popup
   *  is still showing baked-in defaults (no row yet). */
  updatedAt: string | null;
  /** Email of the user who last saved this scope's settings. Null
   *  when no row exists or the lookup failed. */
  updatedByEmail: string | null;
}

/** Single-prefix scopes (Receipt / Quotation / Voucher) reuse the
 *  same value in all four prefix slots so the dialog can read just
 *  {@link AccountingSettings.prefixCommercial} without branching. */
function defaultPrefix(scope: AccountingScope): string {
  switch (scope) {
    case 'sale':      return 'INV';
    case 'purchase':  return 'BILL';
    case 'receipt':   return 'RCPT';
    case 'quotation': return 'QT';
    case 'voucher':   return 'VCH';
  }
}

export function defaultsFor(scope: AccountingScope): AccountingSettings {
  const receipt = scope === 'receipt';
  return {
    showNotes: true,
    showTerms: true,
    showDiscount: true,
    showTax: true,
    // Opt-in: a fresh tenant doesn't auto-send anything until the
    // operator explicitly turns the toggle on.
    autoSendTelegram: false,
    prefixCommercial: defaultPrefix(scope),
    prefixTax:        scope === 'sale' ? 'TAX'  : scope === 'purchase' ? 'TBILL' : defaultPrefix(scope),
    prefixCreditNote: scope === 'sale' ? 'CN'   : scope === 'purchase' ? 'BCN'   : defaultPrefix(scope),
    prefixDebitNote:  scope === 'sale' ? 'DN'   : scope === 'purchase' ? 'BDN'   : defaultPrefix(scope),
    // Receipt = the 4 WHT patterns; everything else keeps the
    // original 5 VAT-and-WHT keys.
    taxTypesEnabled: receipt
      ? ['11', '15', '16', '20']
      : ['1', '2', '3', '11', '12'],
    // Reminders default off — the operator turns them on per tenant.
    reminderBeforeDueEnabled: false,
    reminderBeforeDueDays: 1,
    reminderAfterDueEnabled: false,
    reminderAfterDueRepeat: false,
    reminderAfterDueFrequency: 'daily',
    reminderPaidEnabled: false,
    // Number-format defaults match the dialog preview INV-2026-001.
    numberDateFormat: 'YYYY',
    numberSeqWidth: 3,
    updatedAt: null,
    updatedByEmail: null,
  };
}

/** Convenience for callers that don't know the scope yet — Sale
 *  defaults. Useful as initial state on the Invoice page. */
export const DEFAULT_ACCOUNTING_SETTINGS: AccountingSettings = defaultsFor('sale');

const urlFor = (scope: AccountingScope) =>
  scope === 'sale'      ? '/api/v1/invoices/settings'
  : scope === 'purchase' ? '/api/v1/bills/settings'
  : scope === 'receipt'  ? '/api/v1/receipts/settings'
  : scope === 'quotation' ? '/api/v1/quotations/settings'
  :                        '/api/v1/vouchers/settings';

export async function get(scope: AccountingScope): Promise<AccountingSettings> {
  return apiJson(urlFor(scope));
}

export async function update(scope: AccountingScope, req: AccountingSettings): Promise<AccountingSettings> {
  return apiJson(urlFor(scope), { method: 'PUT', json: req });
}
