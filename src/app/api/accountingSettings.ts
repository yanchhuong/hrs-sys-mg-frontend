import { apiJson } from './client';

/** Independent settings per side (V92). Drives form rendering and
 *  document-number prefixes for either Invoice (Sale) or Bill
 *  (Purchase). Each scope is fetched / saved independently. */
export type AccountingScope = 'sale' | 'purchase' | 'receipt';

export interface AccountingSettings {
  showNotes: boolean;
  showTerms: boolean;
  showDiscount: boolean;
  showTax: boolean;
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
  /** ISO-8601 timestamp of the last save, or null when the popup
   *  is still showing baked-in defaults (no row yet). */
  updatedAt: string | null;
  /** Email of the user who last saved this scope's settings. Null
   *  when no row exists or the lookup failed. */
  updatedByEmail: string | null;
}

export function defaultsFor(scope: AccountingScope): AccountingSettings {
  const sale    = scope === 'sale';
  const receipt = scope === 'receipt';
  // Receipt only has one document kind (RCPT). All four prefix slots
  // get the same default so the dialog can render just the first.
  const commercialDefault = receipt ? 'RCPT' : (sale ? 'INV'  : 'BILL');
  return {
    showNotes: true,
    showTerms: true,
    showDiscount: true,
    showTax: true,
    prefixCommercial: commercialDefault,
    prefixTax:        receipt ? 'RCPT' : (sale ? 'TAX'  : 'TBILL'),
    prefixCreditNote: receipt ? 'RCPT' : (sale ? 'CN'   : 'BCN'),
    prefixDebitNote:  receipt ? 'RCPT' : (sale ? 'DN'   : 'BDN'),
    // Receipt = the 4 WHT patterns; Sale / Purchase keep the
    // original 5 VAT-and-WHT keys.
    taxTypesEnabled: receipt
      ? ['11', '15', '16', '20']
      : ['1', '2', '3', '11', '12'],
    updatedAt: null,
    updatedByEmail: null,
  };
}

/** Convenience for callers that don't know the scope yet — Sale
 *  defaults. Useful as initial state on the Invoice page. */
export const DEFAULT_ACCOUNTING_SETTINGS: AccountingSettings = defaultsFor('sale');

const urlFor = (scope: AccountingScope) =>
  scope === 'sale'    ? '/api/v1/invoices/settings'
  : scope === 'receipt' ? '/api/v1/receipts/settings'
  :                       '/api/v1/bills/settings';

export async function get(scope: AccountingScope): Promise<AccountingSettings> {
  return apiJson(urlFor(scope));
}

export async function update(scope: AccountingScope, req: AccountingSettings): Promise<AccountingSettings> {
  return apiJson(urlFor(scope), { method: 'PUT', json: req });
}
