import { apiJson, apiOrigin, apiPath, apiVoid } from './client';

/**
 * Top-bar notification bell. Feed merges two sources:
 *   • {@code kind: 'announcement'} — broadcast announcements the user
 *     is in the audience for (V127).
 *   • {@code kind: 'notification'} — per-user targeted pings, e.g.
 *     "you were assigned a new encounter / appointment" (V198).
 * The FE reads {@code kind} to route mark-read + pick the right
 * click-through destination via {@code entityType} + {@code entityId}.
 */
export type NotificationKind = 'announcement' | 'notification';

/** Type strings. Announcement types are the V127 categories; the
 *  V198 per-user pings use lower_snake identifiers. */
export type NotificationType =
  | 'HOLIDAY' | 'NEWS' | 'EVENTS' | 'OTHERS'
  | 'encounter_assigned' | 'appointment_assigned';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  type: NotificationType;
  status: string | null;
  publishAt: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  /** Who caused it; null for system-generated / pre-existing rows. */
  actorUserId?: string | null;
  actorName?: string | null;
}

export async function list(): Promise<Notification[]> {
  return apiJson('/api/v1/notifications');
}

export async function unreadCount(): Promise<number> {
  const r = await apiJson<{ count: number }>('/api/v1/notifications/unread-count');
  return r.count;
}

/** V198 — mark-read polymorphic on kind. Pass the item's own
 *  {@code kind} so the backend routes to the correct read-state
 *  store (announcement_reads vs notifications.read_at). */
export async function markRead(kind: NotificationKind, id: string): Promise<void> {
  return apiVoid(`/api/v1/notifications/${kind}/${id}/read`, { method: 'POST' });
}

export async function markAllRead(): Promise<void> {
  return apiVoid('/api/v1/notifications/read-all', { method: 'POST' });
}

/**
 * Live notification stream (spec §14/§15).
 *
 * The server emits only `{"type":"NOTIFICATION_CHANGED"}` — never the
 * count. `onChange` should re-read {@link unreadCount}, so the backend
 * stays the single source of truth and two devices can't drift apart
 * the way `unreadCount++` would let them.
 *
 * EventSource can't set an Authorization header, so we first mint a
 * single-use 60s ticket over the authenticated client and pass that.
 *
 * v-bell-quiet-poll — two things this used to get wrong, which together
 * left the bell polling unread-count every minute for the whole session:
 *   • Health was only noticed on a `notification` event. An idle stream
 *     carries nothing but SSE comments ("connected", the 25s "ping"),
 *     which EventSource never surfaces, so a quiet account looked
 *     disconnected forever. `onOpen` now fires on every (re)connect.
 *   • EventSource's own retry re-sends the SAME url, and the ticket was
 *     consumed on first use — after any drop (deploy, Wi-Fi blip, laptop
 *     sleep) the retry got a 401 and the browser gave up for good. On
 *     error we now close it ourselves and reconnect with a fresh ticket,
 *     backing off 5s → 10s → … → 5 min.
 *
 * Returns a disposer synchronously, so an unmount that lands before the
 * ticket comes back still closes the stream.
 */
export function subscribeToChanges(
  onChange: () => void,
  onDown?: () => void,
  onOpen?: () => void,
): () => void {
  let source: EventSource | null = null;
  let retryTimer = 0;
  let attempt = 0;
  let disposed = false;

  const reconnectLater = () => {
    if (disposed) return;
    const delay = Math.min(5_000 * 2 ** attempt, 5 * 60_000);
    attempt += 1;
    retryTimer = window.setTimeout(() => { void connect(); }, delay);
  };

  const connect = async () => {
    let ticket: string;
    try {
      const res = await apiJson<{ ticket: string }>(
        '/api/v1/notifications/stream-ticket', { method: 'POST' },
      );
      ticket = res.ticket;
    } catch {
      reconnectLater();
      return;
    }
    if (disposed) return;

    const path = apiPath(`/api/v1/notifications/stream?ticket=${encodeURIComponent(ticket)}`);
    const es = new EventSource(`${apiOrigin()}${path}`);
    source = es;
    let openedAt = 0;
    es.onopen = () => { openedAt = Date.now(); onOpen?.(); };
    es.addEventListener('notification', () => onChange());
    es.onerror = () => {
      es.close();
      if (source === es) source = null;
      // Only a connection that held for a while earns a fast retry —
      // one that drops straight after opening keeps backing off.
      if (openedAt && Date.now() - openedAt > 60_000) attempt = 0;
      onDown?.();
      reconnectLater();
    };
  };

  void connect();
  return () => {
    disposed = true;
    window.clearTimeout(retryTimer);
    source?.close();
  };
}
