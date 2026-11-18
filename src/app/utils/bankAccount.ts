/**
 * Bank-account + KHQR cards for each accounting scope (sale / purchase
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
import type { AccountingScope } from '../api/accountingSettings';
import { apiJson, ApiError } from '../api/client';

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  notes: string;
  /** KHQR image as a base64 data URL (e.g. `data:image/png;base64,…`).
   *  Empty string when no image uploaded yet. */
  qrDataUrl: string;
  /** When true this card is one of the rails printed on the invoice.
   *  Capped at two checked rows — the printed footer only has room
   *  for two QR cards side by side. Optional on the type so legacy
   *  localStorage rows (pre-V112) deserialise without an explicit
   *  value; {@link loadBankAccounts} defaults missing values to
   *  false so a stored card doesn't suddenly start printing. */
  showOnInvoice?: boolean;
  /** {@code manual} — operator uploads a fixed KHQR image (default,
   *  legacy behaviour). {@code auto} — POS asks PayWay to mint a
   *  dynamic KHQR per transaction with the cart total baked in.
   *  Optional for legacy rows; missing value treated as {@code manual}. */
  mode?: 'manual' | 'auto';
}

/** Hard cap on the number of bank cards that can render on the
 *  printed invoice — two side-by-side QRs fit; a third spills onto
 *  a second row and breaks the bilingual print layout. Surfaced as a const
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
  mode: 'manual',
};

const TENANT_KEY = 'hrms:tenantSlug';
// AccountingSettingsDialog is one generic dialog shared by every
// settings scope, and it unconditionally loads/saves a bank-card
// bucket per scope regardless of which tab is open — so this needs
// to cover the same full set, not just the original sale/purchase/
// receipt trio.
type Scope = AccountingScope;

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

/* ------------------------------------------------------------------ */
/* v-shop-khqr-proof — scope 'pos' lives on the server.                */
/* ------------------------------------------------------------------ */
//
// POS Setup → Bank Account is one list for every till (web and mobile),
// the customer Display and the public shop page: GET / PUT
// /api/v1/bank-accounts/pos. This browser keeps its copy in localStorage
// for when the server cannot be reached. Every other scope is still
// browser-only, as above.

const SERVER_SCOPE: Scope = 'pos';

/** The server's answer: the list, and whether it was ever saved. */
interface StoredAccounts { accounts: Partial<BankAccount>[]; saved: boolean }

/** Server rows carry null where this type carries ''. */
function fromServer(rows: Partial<BankAccount>[] | null | undefined): BankAccount[] {
  return (rows ?? []).map(r => ({
    ...EMPTY_BANK_ACCOUNT,
    ...r,
    id: r.id ?? newBankAccountId(),
    bankName: r.bankName ?? '',
    accountName: r.accountName ?? '',
    accountNumber: r.accountNumber ?? '',
    notes: r.notes ?? '',
    qrDataUrl: r.qrDataUrl ?? '',
    showOnInvoice: r.showOnInvoice ?? false,
    mode: r.mode ?? 'manual',
  }));
}

async function putServer(accounts: BankAccount[]): Promise<BankAccount[]> {
  const r = await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`, { method: 'PUT', json: accounts });
  return fromServer(r.accounts);
}

/**
 * The cards for `scope`, from the server for 'pos'. Cards this browser
 * held from before the server kept them are moved up once — only while
 * nothing was ever saved there, so a list emptied on purpose stays empty.
 */
export async function loadBankAccountsSynced(scope: Scope): Promise<BankAccount[]> {
  const local = loadBankAccounts(scope);
  if (scope !== SERVER_SCOPE) return local;
  let server: StoredAccounts;
  try {
    server = await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`);
  } catch {
    return local;   // offline, or this user may not read POS
  }
  if (!server.saved && local.length > 0) {
    try {
      const moved = await putServer(local);
      saveBankAccounts(scope, moved);
      return moved;
    } catch {
      return local; // no pos:update here — keep showing this browser's copy
    }
  }
  const accounts = fromServer(server.accounts);
  saveBankAccounts(scope, accounts);
  return accounts;
}

/** Save `scope`'s cards: to the server for 'pos' (throws when it
 *  refuses, so Save can say so), this browser only otherwise. */
export async function saveBankAccountsSynced(scope: Scope, accounts: BankAccount[]): Promise<void> {
  if (scope !== SERVER_SCOPE) { saveBankAccounts(scope, accounts); return; }
  try {
    saveBankAccounts(scope, await putServer(accounts));
  } catch (e) {
    // An API from before V418 has no /bank-accounts endpoint (the web app
    // deploys on push, the API by hand): keep this browser's copy, as
    // before, rather than fail the whole Save. Anything else — a refused
    // image, no permission — still reaches Save's error toast.
    if (e instanceof ApiError && e.status === 404) { saveBankAccounts(scope, accounts); return; }
    throw e;
  }
}
