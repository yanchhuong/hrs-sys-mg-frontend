/**
 * v-telegram-login (phase 1) — "Continue with Telegram" and Profile → Sign in
 * with Telegram.
 *
 * The browser leaves for Telegram by a plain redirect to the API host and
 * comes back to /auth/telegram with the outcome in the URL fragment: a
 * one-minute single-use code (traded here for the same session a password
 * sign-in returns), "connected", or an error code. Nothing secret ever sits
 * in a query string or the address bar.
 */
import { apiJson, apiOrigin, setToken, USER_KEY, TENANT_KEY } from './client';
import type { LoginResponse } from './auth';

export interface TelegramOptions { enabled: boolean; layout: 'A' | 'B' }
/**
 * The Account screen's one Telegram row (spec v1.3 §12.7): `linked` = sign-in,
 * `notifications` = the HR bot; plus what this company offers.
 */
export interface TelegramStatus {
  linked: boolean;
  username: string | null;
  photoUrl: string | null;
  linkedAt: string | null;
  notifications?: boolean;
  displayName?: string | null;
  botAvailable?: boolean;
  signInAvailable?: boolean;
}

/**
 * The API host the browser is sent to. Not the /api-02 proxy the app's own
 * calls go through: Telegram returns to the API host it was configured with
 * (https://api.hr-share.com), and the round trip's cookie lives there.
 */
export function telegramAuthOrigin(): string {
  const o = apiOrigin();
  if (/^https?:\/\//i.test(o)) return new URL(o).origin;
  return 'https://api.hr-share.com';
}

/**
 * v-telegram-own-sites — "Continue with Telegram" only on the real sites.
 * Telegram hands the sign-in back to https://hr-share.com or
 * https://m.hr-share.com, so from localhost or a Vercel preview link the
 * round trip would end on production instead of the page that started it.
 */
const TELEGRAM_SITES = ['hr-share.com', 'www.hr-share.com', 'm.hr-share.com'];
export const telegramSiteOk = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:'
  && TELEGRAM_SITES.includes(window.location.hostname.toLowerCase());

/** v-telegram-companies — `?company=<code>` on the page opens that company only (spec §12.2, BR-08). */
export function companyHintFromUrl(): string | null {
  try {
    const c = new URLSearchParams(window.location.search).get('company');
    return c && /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(c) ? c : null;
  } catch { return null; }
}

export const telegramLoginUrl = (company: string | null = companyHintFromUrl(), handoff: string | null = null): string =>
  `${telegramAuthOrigin()}/auth/telegram/login?app=web${company ? `&company=${encodeURIComponent(company)}` : ''}`
  + (handoff ? `&handoff=${encodeURIComponent(handoff)}` : '');

/* ---------------- v-telegram-handoff ----------------
 * Telegram's page runs in a pop-up; this page waits and finishes the
 * sign-in itself. The attempt's secret stays in this browser — only its
 * SHA-256 goes with the start — and the API hands the outcome over to the
 * holder of the secret, after the window that finished confirms it
 * (silently in this same browser, after a tap anywhere else). */

const HANDOFF_KEY = 'hrms:tgHandoff';
/** As long as the API keeps a parked outcome. */
export const HANDOFF_TTL_MS = 5 * 60_000;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Whether this browser can keep a secret for the wait (Web Crypto). */
export const handoffSupported = (): boolean =>
  typeof window !== 'undefined' && !!window.crypto?.subtle && typeof window.crypto.getRandomValues === 'function';

/** A fresh attempt: the secret is kept here, the hash goes with the start. */
export async function newHandoff(): Promise<{ secret: string; hash: string }> {
  const raw = new Uint8Array(32);
  window.crypto.getRandomValues(raw);
  const secret = b64url(raw);
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  try { localStorage.setItem(HANDOFF_KEY, JSON.stringify({ secret, at: Date.now() })); } catch { /* private mode: the wait still works in this tab */ }
  return { secret, hash: b64url(new Uint8Array(digest)) };
}

/** The secret of an attempt still running in this browser, if any. */
export function handoffSecret(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(HANDOFF_KEY) || 'null') as { secret?: unknown; at?: unknown } | null;
    return v && typeof v.secret === 'string' && typeof v.at === 'number' && Date.now() - v.at < HANDOFF_TTL_MS ? v.secret : null;
  } catch { return null; }
}

export function clearHandoff(): void {
  try { localStorage.removeItem(HANDOFF_KEY); } catch { /* nothing kept */ }
}

/** The finishing window hands the outcome over; false = ask the person first, then call again with tapped. */
export async function confirmHandoff(ticket: string, secret: string | null, tapped = false): Promise<boolean> {
  const r = await apiJson<{ confirmed: boolean }>('/api/v1/auth/telegram/handoff/confirm', {
    method: 'POST', json: { ticket, secret, tapped }, auth: false,
  });
  return !!r?.confirmed;
}

/** The waiting page collects: the fragment to follow once it is ready, else null. */
export async function claimHandoff(secret: string): Promise<string | null> {
  const r = await apiJson<{ status: string; fragment?: string | null }>('/api/v1/auth/telegram/handoff/claim', {
    method: 'POST', json: { secret }, auth: false,
  });
  return r?.status === 'ready' && r.fragment ? r.fragment : null;
}

/** Follow a handed-over fragment as if Telegram had landed here (a full load of /auth/telegram). */
export function followTelegramFragment(fragment: string): void {
  window.location.replace(`/auth/telegram?h=${Date.now()}#${fragment}`);
}

export const telegramConnectUrl = (ticket: string): string =>
  `${telegramAuthOrigin()}/auth/telegram/connect?app=web&ticket=${encodeURIComponent(ticket)}`;

/**
 * Back from Telegram with the browser's Back button, the page comes out of
 * the back/forward cache exactly as it was left — spinner included. Runs
 * `cb` then, so the screen can drop its busy state. Returns the unsubscribe.
 */
export function onBackForward(cb: () => void): () => void {
  const h = (e: PageTransitionEvent) => { if (e.persisted) cb(); };
  window.addEventListener('pageshow', h);
  return () => window.removeEventListener('pageshow', h);
}

/** Whether the login screen offers Telegram (and in which layout). Off on any doubt. */
export async function telegramOptions(): Promise<TelegramOptions> {
  if (!telegramSiteOk()) return { enabled: false, layout: 'A' };
  try {
    const r = await apiJson<TelegramOptions>('/api/v1/auth/telegram/options', { auth: false });
    return { enabled: !!r?.enabled, layout: r?.layout === 'B' ? 'B' : 'A' };
  } catch {
    return { enabled: false, layout: 'A' };
  }
}

export async function connectTicket(): Promise<string> {
  const r = await apiJson<{ ticket: string }>('/api/v1/auth/telegram/connect-ticket', { method: 'POST' });
  return r.ticket;
}

/** Trade the round trip's code for a session and keep it as a password sign-in does. */
export async function exchangeAndStore(code: string): Promise<void> {
  const res = await apiJson<LoginResponse>('/api/v1/auth/telegram/exchange', {
    method: 'POST', json: { code, app: 'web' }, auth: false,
  });
  storeSession(res);
}

/** Keep a session the way a password sign-in does (also used by invites). */
export function storeSession(res: LoginResponse | null | undefined): void {
  if (!res?.token || !res.user) throw new Error('telegram_error');
  setToken(res.token);
  localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  if (res.user.tenantSlug) localStorage.setItem(TENANT_KEY, res.user.tenantSlug);
}

export async function myTelegram(): Promise<TelegramStatus> {
  return apiJson<TelegramStatus>('/api/v1/auth/me/telegram');
}

export async function disconnectTelegram(): Promise<void> {
  await apiJson('/api/v1/auth/me/telegram', { method: 'DELETE' });
}

/** Spec §10 — the same words on www and m. */
const MESSAGES: Record<string, string> = {
  telegram_not_connected: "Your Telegram isn't connected to Smart HRMS yet. If you received an invite link, open it to get started. Already have a password? Sign in below, then connect Telegram in your profile.",
  not_member_of_company: "Your Telegram account isn't part of this company. Contact your HR admin.",
  user_inactive: 'Your account is inactive. Contact your HR admin.',
  company_inactive: "This company's workspace is unavailable. Contact your HR admin.",
  telegram_error: "Telegram sign-in didn't finish. Try again.",
  selection_expired: 'Your sign-in took too long. Sign in again.',
  already_linked: 'This account already has a Telegram connected. Disconnect it first.',
  telegram_used_by_another_account: 'This Telegram account is already connected to another user in this company.',
  too_many_attempts: 'Too many tries. Wait a while, then try again.',
  // v-user-invites (spec §10)
  invite_invalid: "This invite link isn't valid. Ask your HR admin for a new one.",
  invite_used: 'This invite was already used. Sign in instead.',
  invite_expired: 'This invite has expired. Ask your HR admin to resend it.',
  // v-telegram-one-connection (spec v1.3, BR-14)
  telegram_mismatch_with_bot: "Use the same Telegram account that's connected to the HR bot.",
};

export function telegramErrorMessage(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || MESSAGES.telegram_error;
}

/* ---------------- hand-off across the reload ---------------- */

/** Left by /auth/telegram for the app that loads next. */
export type TelegramNote =
  | { kind: 'login_error'; code: string }
  | { kind: 'connected' }
  | { kind: 'connect_error'; code: string };

const NOTE_KEY = 'hrms:telegramNote';

export function leaveTelegramNote(note: TelegramNote): void {
  try { sessionStorage.setItem(NOTE_KEY, JSON.stringify(note)); } catch { /* private mode */ }
}

export function peekTelegramNote(): TelegramNote | null {
  try {
    const raw = sessionStorage.getItem(NOTE_KEY);
    return raw ? (JSON.parse(raw) as TelegramNote) : null;
  } catch { return null; }
}

/** The note, once — only when it is of `kind`. */
export function takeTelegramNote<K extends TelegramNote['kind']>(kind: K): Extract<TelegramNote, { kind: K }> | null {
  const n = peekTelegramNote();
  if (!n || n.kind !== kind) return null;
  try { sessionStorage.removeItem(NOTE_KEY); } catch { /* ignore */ }
  return n as Extract<TelegramNote, { kind: K }>;
}

/* ---------------- v-telegram-pending (spec phase 2b) ----------------
 * A Telegram sign-in turned away as "not connected" comes back with a
 * 10-minute code. This tab keeps it; the password sign-in that follows
 * offers "Connect Telegram @username?". Signing out forgets it. */

const PENDING_KEY = 'hrms:telegramPending';

export interface PendingTelegram { username: string | null; name: string | null; photoUrl: string | null }

export function keepTelegramPending(code: string): void {
  clearTelegramPending();   // a newer attempt replaces the older one
  try { sessionStorage.setItem(PENDING_KEY, code); } catch { /* private mode */ }
}

export function peekTelegramPending(): string | null {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}

/** Forget it here and (unless it was already used) on the server. */
export function clearTelegramPending(dismissOnServer = true): void {
  const code = peekTelegramPending();
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  if (code && dismissOnServer) {
    void apiJson('/api/v1/auth/telegram/pending/dismiss', { method: 'POST', json: { code }, auth: false }).catch(() => {});
  }
}

/** Who the pending Telegram is; null when it expired or was dismissed. */
export async function lookupTelegramPending(code: string): Promise<PendingTelegram | null> {
  try {
    return await apiJson<PendingTelegram>('/api/v1/auth/telegram/pending/lookup', { method: 'POST', json: { code } });
  } catch {
    return null;
  }
}

/** Connect it to the signed-in account. Throws with the spec §10 code on a refusal. */
export async function confirmTelegramPending(code: string): Promise<void> {
  await apiJson('/api/v1/auth/telegram/pending/confirm', { method: 'POST', json: { code } });
}

/* ---------------- v-telegram-companies (spec phase 3) ---------------- */

/** One company in the picker or the header switcher. */
export interface TelegramCompany {
  userId: string;
  tenantId: string;
  code: string;
  name: string;
  logoUrl: string | null;
  lastUsed: boolean;
  current: boolean;
}

/** The picker's list for a selection code; throws ApiError 401 "selection_expired" when it is gone. */
export const companiesForSelection = (selection: string) =>
  apiJson<TelegramCompany[]>('/api/v1/auth/telegram/companies', { method: 'POST', json: { selection }, auth: false });

/** The picker's choice → that company's session, kept as a password sign-in keeps one. */
export async function selectCompany(selection: string, userId: string): Promise<void> {
  storeSession(await apiJson<LoginResponse>('/api/v1/auth/telegram/select-company',
    { method: 'POST', json: { selection, userId, app: 'web' }, auth: false }));
}

/** Companies the signed-in user's Telegram opens (the switcher shows from two). */
export async function myCompanies(): Promise<TelegramCompany[]> {
  try { return await apiJson<TelegramCompany[]>('/api/v1/auth/my-companies'); } catch { return []; }
}

/** Open another company: a new session for that account. The caller reloads the app. */
export async function switchCompany(tenantId: string): Promise<void> {
  storeSession(await apiJson<LoginResponse>('/api/v1/auth/switch-company',
    { method: 'POST', json: { tenantId, app: 'web' } }));
}

/** v-user-invites — the invite page's "Sign in" opens the login screen, not the landing page. */
const OPEN_LOGIN_KEY = 'hrms:openLogin';
export function leaveOpenLogin(): void {
  try { sessionStorage.setItem(OPEN_LOGIN_KEY, '1'); } catch { /* ignore */ }
}
export function takeOpenLogin(): boolean {
  try {
    const v = sessionStorage.getItem(OPEN_LOGIN_KEY) === '1';
    sessionStorage.removeItem(OPEN_LOGIN_KEY);
    return v;
  } catch { return false; }
}

/* ---------------- "Sign in faster next time" ---------------- */

const JUST_PASSWORD_KEY = 'hrms:passwordSignInJustNow';
const SNOOZE_KEY = 'hrms:telegramPromptSnoozedUntil';

/** Set by a password sign-in; the prompt shows once after it. */
export function markPasswordSignIn(): void {
  try { sessionStorage.setItem(JUST_PASSWORD_KEY, '1'); } catch { /* ignore */ }
}
export function takePasswordSignIn(): boolean {
  try {
    const v = sessionStorage.getItem(JUST_PASSWORD_KEY) === '1';
    sessionStorage.removeItem(JUST_PASSWORD_KEY);
    return v;
  } catch { return false; }
}
export function promptSnoozed(): boolean {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
}
/** "Not now": quiet for 7 days. */
export function snoozePrompt(): void {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch { /* ignore */ }
}
