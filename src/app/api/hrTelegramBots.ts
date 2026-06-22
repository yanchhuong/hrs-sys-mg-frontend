import { apiJson, apiVoid } from './client';

/**
 * Per-tenant HR Telegram bot config (V117). Sibling of the
 * customer-facing telegramBots API. Phase 1 surface — register the
 * bot + mint employee deep-link URLs. The agent-side polling +
 * /start redemption lands in a follow-up turn.
 */
export interface HrTelegramBot {
  tenantId: string;
  botUsername: string;
  /** Last 4 chars only (e.g. `••••••••AbCd`). Full token never leaves the server. */
  tokenMask: string;
  enabled: boolean;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HrTelegramBotRequest {
  botUsername: string;
  botToken: string;
  enabled?: boolean;
  description?: string;
}

export interface HrTelegramLinkResponse {
  token: string;
  /** `https://t.me/<bot>?start=<token>` */
  url: string;
  expiresAt: string;
}

/** Linked employee row — what the agent records after the employee
 *  clicks /start on the HR bot. Mirrors {@code TelegramCustomer}. */
export interface HrTelegramEmployee {
  id: string;
  employeeId: string;
  chatId: number;
  telegramUsername?: string | null;
  displayName?: string | null;
  linkedAt: string;
}

/** Returns null when no bot is registered yet (204 from the server). */
export async function getBot(): Promise<HrTelegramBot | null> {
  // The backend returns 204 No Content when no bot is registered;
  // apiJson treats empty body as null so the dialog can render the
  // "register" form on first open.
  const res = await apiJson<HrTelegramBot | null>('/api/v1/hr-telegram/bot');
  return res ?? null;
}

export async function registerOrUpdate(req: HrTelegramBotRequest): Promise<HrTelegramBot> {
  return apiJson('/api/v1/hr-telegram/bot', { method: 'PUT', json: req });
}

export async function deleteBot(): Promise<void> {
  return apiVoid('/api/v1/hr-telegram/bot', { method: 'DELETE' });
}

export async function setEnabled(enabled: boolean): Promise<HrTelegramBot> {
  return apiJson('/api/v1/hr-telegram/bot/enabled', { method: 'POST', json: { enabled } });
}

export async function generateLink(employeeId: string): Promise<HrTelegramLinkResponse> {
  return apiJson('/api/v1/hr-telegram/links', { method: 'POST', json: { employeeId } });
}

/** Per-employee linkage lookup — null when the employee hasn't
 *  redeemed a link yet (controller returns 204). */
export async function getLinkedEmployee(employeeId: string): Promise<HrTelegramEmployee | null> {
  return (await apiJson<HrTelegramEmployee | null>(`/api/v1/hr-telegram/employees/${employeeId}`)) ?? null;
}

/** All linked employees in the tenant — drives the per-row state
 *  on the Employees roster table without N+1 lookups. */
export async function listLinkedEmployees(): Promise<HrTelegramEmployee[]> {
  return apiJson('/api/v1/hr-telegram/employees');
}

export async function unlinkEmployee(employeeId: string): Promise<void> {
  return apiVoid(`/api/v1/hr-telegram/employees/${employeeId}`, { method: 'DELETE' });
}
