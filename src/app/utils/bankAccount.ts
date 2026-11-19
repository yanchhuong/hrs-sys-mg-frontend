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
import { apiJson, ApiError, getToken } from '../api/client';

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

/** The signed-in tenant's slug, as this browser's keys use it. */
export function currentTenant(): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(TENANT_KEY)) || 'default';
}

function keyFor(tenant: string, scope: Scope): string {
  return `hrms:bankInfo:${tenant}:${scope}`;
}

function storageKey(scope: Scope): string {
  return keyFor(currentTenant(), scope);
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
  return readCards(storageKey(scope));
}

function readCards(key: string): BankAccount[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
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
// Reconciling with the server (v-shop-khqr-proof-hardening). The cards
// decide where customers' money goes, so:
//  - Nothing saved on the server yet: this browser's cards ARE the shop's.
//    They are used, and moved up by the first session allowed to
//    (settings:update).
//  - A saved list exists: it wins, at checkout and on the Display. A card
//    only this browser holds is never shown to customers and never
//    uploaded unattended — it could be a stale copy of a card the owner
//    deleted, or one planted in this browser. It is set aside
//    ("pending") for an owner to add, or drop, in POS Settings with an
//    explicit Save.
//  - Once reconciled (a per-tenant marker), the server's list wins.

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

// Every key below belongs to ONE tenant, fixed when a sync or a save
// starts (v-shop-khqr-proof-round3). Signing out and in as another tenant
// — in this tab, or another: tabs share localStorage — while a request is
// out must never land one tenant's cards in another's keys, or on its
// server list.
const posKey = (tenant: string): string => keyFor(tenant, SERVER_SCOPE);
/** Set once this browser's cards are reconciled with the server's list;
 *  from then on the server's list wins. */
const syncedKey = (tenant: string): string => `${posKey(tenant)}:synced`;
/** Cards set aside for an owner's review (see above). */
const pendingKey = (tenant: string): string => `${posKey(tenant)}:pending`;
function isSynced(tenant: string): boolean {
  try { return localStorage.getItem(syncedKey(tenant)) === '1'; } catch { return false; }
}
function markSynced(tenant: string): void {
  try { localStorage.setItem(syncedKey(tenant), '1'); } catch { /* best effort */ }
}
function readPending(tenant: string): BankAccount[] {
  try {
    const raw = localStorage.getItem(pendingKey(tenant));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
/** False when the browser refused it (quota). */
function writePending(tenant: string, list: BankAccount[]): boolean {
  try {
    if (list.length === 0) localStorage.removeItem(pendingKey(tenant));
    else localStorage.setItem(pendingKey(tenant), JSON.stringify(list));
    return true;
  } catch { return false; }
}
/** The till's copy must never be OLDER than the list just received: when
 *  the new one does not fit (quota), the copy is removed instead, so an
 *  offline till shows no KHQR rather than a card the owner removed or one
 *  set aside for review. */
function writeCache(tenant: string, list: BankAccount[]): boolean {
  try { localStorage.setItem(posKey(tenant), JSON.stringify(list)); return true; } catch {
    try { localStorage.removeItem(posKey(tenant)); } catch { /* nothing more to do */ }
    return false;
  }
}

/** The sign-in a sync or a save started with. */
interface Session { tenant: string; token: string | null }
const sessionNow = (): Session => ({ tenant: currentTenant(), token: getToken() });
const sameSession = (s: Session): boolean => currentTenant() === s.tenant && getToken() === s.token;

/** The sign-in (token) that was refused the upload — no settings:update.
 *  A different sign-in tries again; a page-wide flag blocked the owner
 *  who signs in after a cashier on the same tab. */
let refusedFor: string | null = null;

/** Cards this browser holds that the server's list does not (by id). */
export function cardsOnlyHere(local: BankAccount[], server: BankAccount[]): BankAccount[] {
  const ids = new Set(server.map(c => c.id));
  return local.filter(c => !!c.id && !ids.has(c.id));
}

/** The set-aside list after a load: cards the server's list has by now
 *  drop out (an owner saved them from elsewhere, or a Save whose reply was
 *  lost went through) — a live card is never labelled "Not saved" and
 *  deleted as a leftover; `found` joins. */
export function nextPending(stored: BankAccount[], server: BankAccount[], found: BankAccount[]): BankAccount[] {
  const kept = cardsOnlyHere(stored, server);
  const ids = new Set(kept.map(c => c.id));
  return [...kept, ...found.filter(c => !ids.has(c.id))];
}

/** Store the set-aside list after a load and return it. Refused (quota):
 *  those cards cannot be kept aside here; they go with the old copy,
 *  never left where an offline till would show them. */
function settlePending(tenant: string, server: BankAccount[], found: BankAccount[]): BankAccount[] {
  const before = readPending(tenant);
  const next = nextPending(before, server, found);
  const changed = next.length !== before.length || next.some((c, i) => c.id !== before[i].id);
  if (changed && !writePending(tenant, next)) return cardsOnlyHere(before, server);
  return next;
}

async function putServer(accounts: BankAccount[]): Promise<BankAccount[]> {
  const r = await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`, { method: 'PUT', json: accounts });
  return fromServer(r.accounts);
}

/** A reconciled load: the till's list, the cards set aside for an owner,
 *  and the tenant it was done for. */
interface Synced { show: BankAccount[]; pending: BankAccount[]; tenant: string }

/** The till's list and the cards set aside for an owner, reconciled with
 *  the server; null when the server could not be asked, or the sign-in
 *  changed while it was. */
async function syncPos(): Promise<Synced | null> {
  const session = sessionNow();
  const { tenant } = session;
  const local = readCards(posKey(tenant));
  let stored: StoredAccounts;
  try {
    stored = await apiJson<StoredAccounts>(`/api/v1/bank-accounts/${SERVER_SCOPE}`);
  } catch {
    return null;   // offline, an API from before V418, or no pos:view
  }
  // Signed out, or in as someone else, while the server answered: this
  // answer is not the current tenant's. Touch nothing.
  if (!sameSession(session)) return null;
  const server = fromServer(stored.accounts);
  if (isSynced(tenant)) {
    writeCache(tenant, server);
    return { show: server, pending: settlePending(tenant, server, []), tenant };
  }
  if (!stored.saved) {
    // Nothing stored yet: this browser's cards are the shop's.
    if (local.length === 0) { markSynced(tenant); return { show: server, pending: readPending(tenant), tenant }; }
    if (refusedFor !== session.token) {
      try {
        const moved = await putServer(local.slice(0, MAX_SERVER_CARDS));
        if (!sameSession(session)) return null;
        writeCache(tenant, moved);
        // Deliberately NOT marked in step: if another till moved its own
        // cards up at the same moment and won, the next load finds a saved
        // list without this browser's cards and sets them aside, instead
        // of the server's list silently replacing them.
        return { show: moved, pending: readPending(tenant), tenant };
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) refusedFor = session.token;
        else console.warn('[bank-accounts] could not move this browser\'s cards to the server', e);
      }
    }
    // Not moved up from this sign-in: keep using this browser's cards
    // (the server has none) until someone allowed opens POS here.
    return { show: local, pending: readPending(tenant), tenant };
  }
  // A saved list wins. Cards only here are set aside for an owner.
  const pending = settlePending(tenant, server, cardsOnlyHere(local, server));
  if (writeCache(tenant, server)) markSynced(tenant);
  return { show: server, pending, tenant };
}

/** The cards for `scope` as the till should use them, or null when the
 *  server could not be asked. */
export async function loadBankAccountsFromServer(scope: Scope): Promise<BankAccount[] | null> {
  if (scope !== SERVER_SCOPE) return loadBankAccounts(scope);
  return (await syncPos())?.show ?? null;
}

/** POS Settings: the list to edit, plus cards only this browser had (to
 *  be added by an owner's explicit Save, or dropped), and the tenant they
 *  belong to — pass it back to {@link saveBankAccountsSynced}. Null: the
 *  server list could not be read, so there is nothing trustworthy to edit. */
export async function loadBankAccountsForEdit(
  scope: Scope,
): Promise<{ accounts: BankAccount[]; pending: BankAccount[]; tenant: string } | null> {
  if (scope !== SERVER_SCOPE) return { accounts: loadBankAccounts(scope), pending: [], tenant: currentTenant() };
  const r = await syncPos();
  return r ? { accounts: r.show, pending: r.pending, tenant: r.tenant } : null;
}

/** The cards for `scope`: the server's for 'pos' when it answers, this
 *  browser's copy when it does not. For screens that only SHOW cards. */
export async function loadBankAccountsSynced(scope: Scope): Promise<BankAccount[]> {
  try {
    return (await loadBankAccountsFromServer(scope)) ?? loadBankAccounts(scope);
  } catch {
    return loadBankAccounts(scope);
  }
}

/** What a save refused because another tenant is signed in says. */
export const SWITCHED_TENANT = 'Signed in to another company since this opened. Reopen it to edit.';

/**
 * Save `scope`'s cards: to the server for 'pos' (throws when it refuses,
 * so Save can say so), this browser only otherwise. `tenant` is the one
 * the list was LOADED for: if another is signed in by now (another tab),
 * nothing is sent, rather than one company's cards replacing another's.
 */
export async function saveBankAccountsSynced(scope: Scope, accounts: BankAccount[], tenant?: string | null): Promise<void> {
  if (scope !== SERVER_SCOPE) { saveBankAccounts(scope, accounts); return; }
  const session = sessionNow();
  if (tenant && tenant !== session.tenant) throw new Error(SWITCHED_TENANT);
  try {
    const saved = await putServer(accounts);
    if (!sameSession(session)) return;
    writeCache(session.tenant, saved);
    markSynced(session.tenant);
    // The owner has reviewed this list: what they kept is now stored.
    writePending(session.tenant, []);
  } catch (e) {
    // An API from before V418 has no /bank-accounts endpoint (the web app
    // deploys on push, the API by hand): keep this browser's copy, as
    // before, rather than fail the whole Save. Anything else — a refused
    // image, no permission — still reaches Save's error toast.
    if (e instanceof ApiError && e.status === 404) { saveBankAccounts(scope, accounts); return; }
    throw e;
  }
}
