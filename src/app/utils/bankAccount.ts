/**
 * Bank-account + KHRQR cards for each accounting scope (sale / purchase
 * / receipt). Persisted in browser localStorage keyed by the active
 * tenant; the printed Invoice / Bill / Receipt renders the list so
 * customers can scan whichever rail (Bakong / Wing / ABA) they prefer.
 *
 * <p>The on-disk shape is an array — every entry is a self-contained
 * card with its own image and account fields. Older deployments wrote
 * a single object under the same key; {@link loadBankAccounts}
 * transparently migrates that legacy row into a one-item array on
 * read, so users don't lose their setup when the dialog upgrades.
 */
export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  notes: string;
  /** KHRQR image as a base64 data URL (e.g. `data:image/png;base64,…`).
   *  Empty string when no image uploaded yet. */
  qrDataUrl: string;
  /** When true this card is one of the rails printed on the invoice.
   *  Capped at two checked rows — the printed footer only has room
   *  for two QR cards side by side. Optional on the type so legacy
   *  localStorage rows (pre-V112) deserialise without an explicit
   *  value; {@link loadBankAccounts} defaults missing values to
   *  false so a stored card doesn't suddenly start printing. */
  showOnInvoice?: boolean;
}

/** Hard cap on the number of bank cards that can render on the
 *  printed invoice — two side-by-side QRs fit; a third spills onto
 *  a second row and breaks the WABOOKS layout. Surfaced as a const
 *  so the dialog + the print filter stay in lockstep. */
export const MAX_BANK_ACCOUNTS_ON_INVOICE = 2;

export const EMPTY_BANK_ACCOUNT: BankAccount = {
  id: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  notes: '',
  qrDataUrl: '',
  showOnInvoice: false,
};

const TENANT_KEY = 'hrms:tenantSlug';
type Scope = 'sale' | 'purchase' | 'receipt';

function storageKey(scope: Scope): string {
  const tenant = (typeof localStorage !== 'undefined' && localStorage.getItem(TENANT_KEY)) || 'default';
  return `hrms:bankInfo:${tenant}:${scope}`;
}

/** Cheap unique id — only used as a React key + delete handle. */
export function newBankAccountId(): string {
  return `b_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function normalize(raw: Partial<BankAccount>): BankAccount {
  return {
    ...EMPTY_BANK_ACCOUNT,
    ...raw,
    id: raw.id || newBankAccountId(),
  };
}

export function loadBankAccounts(scope: Scope): BankAccount[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Backward-compat: the v1 dialog wrote a single object. If we see
    // that shape, lift it into the new array form so reads keep
    // working — the next save() persists the migrated layout.
    if (Array.isArray(parsed)) {
      return parsed.map((row): BankAccount => normalize(row));
    }
    if (parsed && typeof parsed === 'object') {
      const legacy = parsed as Partial<BankAccount>;
      if (legacy.bankName || legacy.accountName || legacy.accountNumber || legacy.qrDataUrl) {
        return [normalize(legacy)];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveBankAccounts(scope: Scope, accounts: BankAccount[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(scope), JSON.stringify(accounts));
}
