import { apiJson } from './client';

/**
 * Company-wide Telegram group the HR bot posts team activity into
 * (invoices, expenses, approvals, cash advance, activities). Linked by
 * minting a short code here and sending `/link <code>` in the group.
 * Employees' private chats with the HR bot are unaffected.
 */
export interface HrTelegramGroup {
  linked: boolean;
  title: string | null;
  linkedAt: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
  postInvoices: boolean;
  postExpenses: boolean;
  postApprovals: boolean;
  postCashAdvance: boolean;
  postActivity: boolean;
}

export type HrTelegramGroupEvents = Partial<Pick<HrTelegramGroup,
  'postInvoices' | 'postExpenses' | 'postApprovals' | 'postCashAdvance' | 'postActivity'>>;

export async function getGroup(): Promise<HrTelegramGroup> {
  return apiJson('/api/v1/hr-telegram/group');
}

/** Mints a fresh `/link` code (valid 24h). */
export async function createLinkCode(): Promise<HrTelegramGroup> {
  return apiJson('/api/v1/hr-telegram/group/link-code', { method: 'POST' });
}

export async function updateEvents(events: HrTelegramGroupEvents): Promise<HrTelegramGroup> {
  return apiJson('/api/v1/hr-telegram/group/events', { method: 'PUT', json: events });
}

/** Disconnects the group; event switches are kept server-side. */
export async function disconnectGroup(): Promise<HrTelegramGroup> {
  return apiJson('/api/v1/hr-telegram/group', { method: 'DELETE' });
}
