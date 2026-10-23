import { apiJson, apiVoid } from './client';

/**
 * Telegram groups the HR bot posts team activity into (invoices,
 * expenses, approvals, cash advance, activities). A company may connect
 * several groups, each with its own event switches. A group is added as
 * a PENDING row with a short code; sending `/link <code>` in the group
 * links it. Employees' private chats with the HR bot are unaffected.
 */
export interface HrTelegramGroup {
  id: string;
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
  postAttendance: boolean;
  postOvertime: boolean;
  postLeave: boolean;
  postPayroll: boolean;
  postEmployee: boolean;
}

export type HrTelegramGroupEvents = Partial<Pick<HrTelegramGroup,
  'postInvoices' | 'postExpenses' | 'postApprovals' | 'postCashAdvance' | 'postActivity'
  | 'postAttendance' | 'postOvertime' | 'postLeave' | 'postPayroll' | 'postEmployee'>>;

const BASE = '/api/v1/hr-telegram/groups';

/** Connected groups plus pending ones with a live code, oldest first. */
export async function listGroups(): Promise<HrTelegramGroup[]> {
  return apiJson(BASE);
}

/** Adds a new PENDING group with a `/link` code (valid 24h). */
export async function addGroup(): Promise<HrTelegramGroup> {
  return apiJson(BASE, { method: 'POST' });
}

/** Mints a fresh `/link` code for a pending group. */
export async function createLinkCode(id: string): Promise<HrTelegramGroup> {
  return apiJson(`${BASE}/${encodeURIComponent(id)}/link-code`, { method: 'POST' });
}

export async function updateEvents(id: string, events: HrTelegramGroupEvents): Promise<HrTelegramGroup> {
  return apiJson(`${BASE}/${encodeURIComponent(id)}/events`, { method: 'PUT', json: events });
}

/** Disconnects a linked group or cancels a pending one. */
export async function deleteGroup(id: string): Promise<void> {
  return apiVoid(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
