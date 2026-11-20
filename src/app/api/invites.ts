/**
 * v-user-invites (Telegram login spec, phase 2) — an admin creates a user and
 * shares a one-time link; the person opening it sets up their own sign-in
 * with Telegram or a password they choose.
 *
 * The token travels in request bodies, never in an API path, so it stays out
 * of the API's access logs.
 */
import { apiJson, apiVoid } from './client';
import type { LoginResponse } from './auth';
import { storeSession, telegramAuthOrigin } from './telegramAuth';

/** Returned once, right after create / resend: the link is never shown again. */
export interface InviteCreated {
  inviteUrl: string;
  expiresAt: string;
  resent: boolean;
  /** The server can email it (mail set up and the user has an address). */
  emailAvailable: boolean;
}

export interface InvitePreview {
  fullName: string;
  email: string | null;
  companyName: string;
  roleName: string | null;
  invitedByName: string | null;
  expiresAt: string;
}

/* ---------------- admin ---------------- */

export const createInvite = (userId: string) =>
  apiJson<InviteCreated>(`/api/v1/users/${userId}/invites`, { method: 'POST' });

export const revokeInvite = (userId: string) =>
  apiVoid(`/api/v1/users/${userId}/invites/active`, { method: 'DELETE' });

/** Email the link just shown (the server never kept it, so it is sent back). */
export const emailInvite = (userId: string, inviteUrl: string) =>
  apiVoid(`/api/v1/users/${userId}/invites/email`, { method: 'POST', json: { token: tokenOf(inviteUrl) } });

/** Disconnect a user's Telegram sign-in (this company only). */
export const unlinkUserTelegram = (userId: string) =>
  apiVoid(`/api/v1/users/${userId}/telegram`, { method: 'DELETE' });

export function tokenOf(inviteUrl: string): string {
  return inviteUrl.slice(inviteUrl.lastIndexOf('/') + 1);
}

/** https://t.me/share/url — opens Telegram's "share to a chat" with the link. */
export function telegramShareUrl(inviteUrl: string, companyName?: string | null): string {
  const text = companyName
    ? `You're invited to join ${companyName} on Smart HRMS. Set up your account here:`
    : "You're invited to Smart HRMS. Set up your account here:";
  return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
}

/* ---------------- the invite page (public) ---------------- */

export const previewInvite = (token: string) =>
  apiJson<InvitePreview>('/api/v1/public/user-invites/preview', { method: 'POST', json: { token }, auth: false });

/** "Continue with Telegram": a one-minute ticket stands in for the token on the way to Telegram. */
export async function startInviteTelegram(token: string, app: 'web' | 'mobile' = 'web'): Promise<void> {
  const r = await apiJson<{ ticket: string }>('/api/v1/public/user-invites/telegram-ticket',
    { method: 'POST', json: { token }, auth: false });
  window.location.assign(`${telegramAuthOrigin()}/auth/telegram/login?app=${app}&invite=${encodeURIComponent(r.ticket)}`);
}

/** "Set a password instead": sets it, accepts the invite and keeps the session. */
export async function acceptInviteWithPassword(token: string, password: string): Promise<void> {
  const res = await apiJson<LoginResponse>('/api/v1/public/user-invites/accept-password',
    { method: 'POST', json: { token, password, app: 'web' }, auth: false });
  storeSession(res);
}
