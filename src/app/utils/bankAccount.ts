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
//
// Moving this browser's cards up (v-shop-khqr-proof-hardening). Cards
// that only this browser held are never discarded unseen: the first time
// it syncs, any card the server lacks is added to the server's list —
// whether or not another device saved first — and from then on (a
// per-tenant marker) the server's list wins, so a card deleted
// elsewhere stays deleted. Only someone who may change the payment
// cards (settings:update) can move them up; for anyone else this
// browser keeps showing its own cards next to the server's until such a
// person opens POS here.

const SERVER_SCOPE: Scope = 'pos';
/** The server's limit on one list. */
const MAX_SERVER_CARDS = 10;

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

/** Set once this browser's cards are reconciled with the server's list;
 *  from then on the server's list wins. Per tenant, like the cards. */
const syncedKey = (): string => `${storageKey(SERVER_SCOPE)}:synced`;
function isSynced(): boolean {
  try { return localStorage.getItem(syncedKey()) === '1'; } catch { return false; }
}
function markSynced(): void {
  try { localStorage.setItem(syncedKey(), '1'); } catch { /* best effort */ }
}
/** This session was refused the upload (no settings:update): don't ask
 *  again on every load. */
let uploadRefused = false;

/** Cards this browser holds that the server's list does not (by id). */
export function cardsOnlyHere(local: BankAccount[], server: BankAccount[]): BankAccount[] {
  const ids = new Set(server.map(c => c.id));
  return local.filter(c => !!c.id && !ids.has(c.id));
}

async function putServer(accounts: BankAccount[]): Promise<BankAccount[]> {
  const r = await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`, { method: 'PUT', json: accounts });
  return fromServer(r.accounts);
}

/**
 * The cards for `scope` as the server has them (reconciling this
 * browser's own cards first, see above), or null when the server could
 * not be asked. Callers that let someone EDIT the list use this: a null
 * means there is no trustworthy list to edit.
 */
export async function loadBankAccountsFromServer(scope: Scope): Promise<BankAccount[] | null> {
  if (scope !== SERVER_SCOPE) return loadBankAccounts(scope);
  const local = loadBankAccounts(scope);
  let server: BankAccount[];
  try {
    server = fromServer((await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`)).accounts);
  } catch {
    return null;   // offline, an API from before V418, or no pos:view
  }
  if (isSynced()) {
    saveBankAccounts(scope, server);
    return server;
  }
  const extra = cardsOnlyHere(local, server);
  if (extra.length === 0) {
    saveBankAccounts(scope, server);
    markSynced();
    return server;
  }
  const merged = [...server, ...extra].slice(0, MAX_SERVER_CARDS);
  if (!uploadRefused) {
    try {
      const stored = await putServer(merged);
      saveBankAccounts(scope, stored);
      markSynced();
      return stored;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) uploadRefused = true;
      else console.warn('[bank-accounts] could not move this browser\'s cards to the server', e);
    }
  }
  // Not moved up from this session: show the server's cards and this
  // browser's own, and leave the local copy as it is for a session that
  // can move it.
  return merged;
}

/** The cards for `scope`: the server's for 'pos' when it answers, this
 *  browser's copy when it does not. For screens that only SHOW cards. */
export async function loadBankAccountsSynced(scope: Scope): Promise<BankAccount[]> {
  return (await loadBankAccountsFromServer(scope)) ?? loadBankAccounts(scope);
}

/** Save `scope`'s cards: to the server for 'pos' (throws when it
 *  refuses, so Save can say so), this browser only otherwise. */
export async function saveBankAccountsSynced(scope: Scope, accounts: BankAccount[]): Promise<void> {
  if (scope !== SERVER_SCOPE) { saveBankAccounts(scope, accounts); return; }
  try {
    saveBankAccounts(scope, await putServer(accounts));
    markSynced();
  } catch (e) {
    // An API from before V418 has no /bank-accounts endpoint (the web app
    // deploys on push, the API by hand): keep this browser's copy, as
    // before, rather than fail the whole Save. Anything else — a refused
    // image, no permission — still reaches Save's error toast.
    if (e instanceof ApiError && e.status === 404) { saveBankAccounts(scope, accounts); return; }
    throw e;
  }
}
