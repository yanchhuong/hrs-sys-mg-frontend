import { apiJson, apiVoid } from './client';

/** Tenant's registered Telegram bot. The {@code botToken} is NEVER
 *  returned by the API in full — only the last-4 tail (e.g.
 *  "•••AAH4") so the admin can confirm which credential is stored
 *  without us leaking it back through the wire. */
export interface TelegramBot {
  tenantId: string;
  botUsername: string;
  tokenTail: string;
  enabled: boolean;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelegramBotRequest {
  botUsername: string;
  botToken: string;
  enabled?: boolean;
  description?: string;
}

export interface TelegramCustomer {
  id: string;
  customerId: string;
  chatId: number;
  telegramUsername?: string | null;
  displayName?: string | null;
  linkedAt: string;
  /** 'tenant' when the customer linked via the company's own bot,
   *  'platform' when they linked via the Super-Admin shared fallback. */
  botSource: 'tenant' | 'platform';
}

/** Returned by GET /telegram/status — tells the tenant Settings UI
 *  which bot is currently delivering their messages. */
export interface ResolvedBotStatus {
  source: 'tenant' | 'platform' | 'none';
  botUsername: string | null;
  description: string | null;
}

/** Super Admin singleton platform-bot DTO. Same masking as the
 *  tenant one — token last-4 only, never the full secret. */
export interface PlatformTelegramBot {
  botUsername: string;
  tokenTail: string;
  enabled: boolean;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformTelegramBotRequest {
  botUsername: string;
  botToken: string;
  enabled?: boolean;
  description?: string;
}

export interface TelegramLinkResponse {
  token: string;
  url: string;
  expiresAt: string;
}

/** GET /bot — controller returns 204 when no row exists, which
 *  apiJson resolves to null (safeJson returns null for empty bodies).
 *  Caller branches between "set up" and "edit" states. */
export async function getBot(): Promise<TelegramBot | null> {
  return (await apiJson<TelegramBot | null>('/api/v1/telegram/bot')) ?? null;
}

export async function putBot(req: TelegramBotRequest): Promise<TelegramBot> {
  return apiJson('/api/v1/telegram/bot', { method: 'PUT', json: req });
}

export async function deleteBot(): Promise<void> {
  return apiVoid('/api/v1/telegram/bot', { method: 'DELETE' });
}

/** Flip the tenant's own-bot preference without re-entering the
 *  token. {@code true} → use own bot; {@code false} → fall through
 *  to the Super-Admin shared bot. 404 when no own bot is registered. */
export async function setBotEnabled(enabled: boolean): Promise<TelegramBot> {
  return apiJson('/api/v1/telegram/bot/enabled', {
    method: 'POST',
    json: { enabled },
  });
}

/** Mint a deep-link URL for the operator to hand to a customer.
 *  Returns the t.me/<bot>?start=<token> URL + expiry timestamp. */
export async function generateLink(customerId: string): Promise<TelegramLinkResponse> {
  return apiJson(`/api/v1/telegram/customers/${customerId}/link`, { method: 'POST' });
}

export async function getLinkedCustomer(customerId: string): Promise<TelegramCustomer | null> {
  return (await apiJson<TelegramCustomer | null>(`/api/v1/telegram/customers/${customerId}`)) ?? null;
}

export async function listLinkedCustomers(): Promise<TelegramCustomer[]> {
  return apiJson('/api/v1/telegram/customers');
}

export async function unlinkCustomer(customerId: string): Promise<void> {
  return apiVoid(`/api/v1/telegram/customers/${customerId}`, { method: 'DELETE' });
}

/** Which bot is currently routing this tenant's invoices —
 *  the tenant's own, the Super-Admin platform fallback, or none. */
export async function getStatus(): Promise<ResolvedBotStatus> {
  return apiJson('/api/v1/telegram/status');
}

/* ---------------------- Super-Admin endpoints ---------------------- */

export async function getPlatformBot(): Promise<PlatformTelegramBot | null> {
  return (await apiJson<PlatformTelegramBot | null>('/api/v1/platform/telegram/bot')) ?? null;
}

export async function putPlatformBot(
  req: PlatformTelegramBotRequest,
): Promise<PlatformTelegramBot> {
  return apiJson('/api/v1/platform/telegram/bot', { method: 'PUT', json: req });
}

export async function deletePlatformBot(): Promise<void> {
  return apiVoid('/api/v1/platform/telegram/bot', { method: 'DELETE' });
}

/** One row in the Super Admin's unified Telegram Bots table.
 *  Two filterable axes:
 *    - {@code kind}     — ownership (Public = platform / Private = tenant)
 *    - {@code audience} — who the bot talks to (customer or employee)
 *  Tenant rows carry {@code tenantId} + {@code tenantName} so the
 *  table can render the owning company alongside the bot username. */
export interface PlatformBotListItem {
  kind: 'platform' | 'tenant';
  audience: 'customer' | 'employee';
  tenantId: string | null;
  tenantName: string | null;
  botUsername: string;
  tokenTail: string;
  enabled: boolean;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function listAllBots(): Promise<PlatformBotListItem[]> {
  return apiJson('/api/v1/platform/telegram/all-bots');
}
