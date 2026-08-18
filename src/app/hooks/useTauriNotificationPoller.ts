/**
 * V-fcm-3-tauri — polling fallback for the Windows desktop app.
 *
 * <p>WebView2 (the engine Tauri uses on Windows) does not reliably
 * receive Web-Push messages the way Chrome/Firefox do — the
 * FCM foreground handler in {@code useFcmToken} may never fire.
 * To keep the desktop app parity with browsers, we poll the
 * server-side notifications feed here and raise a Tauri-native
 * Action-Center toast for every ID we haven't shown yet.</p>
 *
 * <p>Kept independent of the {@code NotificationsBell} component so
 * the poller keeps ticking even when the bell popover is closed —
 * and the bell's own 60s count-only poll stays cheap and independent.</p>
 */

import { useEffect } from 'react';
import * as api from '../api/notifications';
import { isTauriHost, showTauriNotification } from '../utils/tauriNotifier';

/** localStorage key for the "already shown" set of notification IDs.
 *  Persisted so a Tauri app restart doesn't re-raise banners for the
 *  same notifications the user has already seen. */
const SHOWN_KEY = 'hrms:tauriNotifShownIds';

/** Cap on the persisted set — a busy tenant can rack up thousands of
 *  events, and there's no point keeping IDs older than the server's
 *  recent-list window. */
const MAX_KEPT = 200;

function readShown(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function writeShown(ids: Set<string>): void {
  try {
    const arr = Array.from(ids).slice(-MAX_KEPT);
    localStorage.setItem(SHOWN_KEY, JSON.stringify(arr));
  } catch { /* private mode — nothing to persist */ }
}

/**
 * Mounted from Layout for every authenticated user. In non-Tauri
 * hosts this hook does exactly nothing — the browser path already
 * handles OS toasts via Firebase's SW.
 */
export function useTauriNotificationPoller(userId: string | undefined | null,
                                            notificationsEnabled: boolean | undefined): void {
  useEffect(() => {
    if (!isTauriHost()) return;
    if (!userId) return;
    if (notificationsEnabled === false) return;

    let cancelled = false;
    const shown = readShown();

    // Prime the "shown" set on first mount so we don't fire a Tauri
    // toast for every notification already in the recent-list — the
    // user has seen those in prior sessions. Only ITEMS APPEARING
    // AFTER the first poll are treated as new.
    let primed = false;

    const tick = async () => {
      try {
        const list = await api.list();
        if (cancelled) return;
        if (!primed) {
          list.forEach(n => shown.add(n.id));
          writeShown(shown);
          primed = true;
          return;
        }
        const fresh = list.filter(n => !shown.has(n.id) && !n.read);
        if (fresh.length === 0) return;
        for (const n of fresh) {
          shown.add(n.id);
          const title = n.title ?? 'Notification';
          const body  = n.body  ?? '';
          void showTauriNotification(title, body);
        }
        writeShown(shown);
      } catch { /* silent — retry on next tick */ }
    };

    void tick();
    // 20s cadence — feels near-instant for HRMS events (payment
    // recorded, leave submitted, POS order) without hammering the
    // API. The bell's own 60s count poll is unaffected.
    const id = window.setInterval(() => { void tick(); }, 20_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [userId, notificationsEnabled]);
}
