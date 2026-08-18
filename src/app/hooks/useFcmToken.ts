/**
 * V-fcm-2b — after the user signs in, request Web-Push permission,
 * fetch the browser's FCM token, and register it with the backend so
 * FcmService can address this device.
 *
 * <p>Every failure path is silent: FCM is a nice-to-have, and every
 * launch-blocking scenario (no permission, unsupported browser, no
 * VAPID key configured, backend 404) should degrade gracefully to
 * "no push notifications" without a toast the user has to dismiss.</p>
 *
 * <p><b>User opt-out.</b> The "Enable push notifications" toggle in
 * Settings writes {@code localStorage['hrms:fcmOptOut'] = '1'}; when
 * that's set, this hook is a no-op. Turning it back on triggers a
 * re-register on the next mount (or on the same tab via
 * {@code refreshFcmToken()}).</p>
 */

import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { FCM_VAPID_PUBLIC_KEY, getFcmMessaging } from '../config/firebase';
import { registerFcmToken } from '../api/fcm';
// V-fcm-3-tauri — Windows desktop shell needs the Tauri plugin to
// raise a real Action-Center toast; WebView2's Web-Push path may
// silently drop the notification.
import { isTauriHost, showTauriNotification } from '../utils/tauriNotifier';

const OPT_OUT_KEY = 'hrms:fcmOptOut';
const LAST_TOKEN_KEY = 'hrms:fcmLastRegisteredToken';

export function isFcmOptedOut(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(OPT_OUT_KEY) === '1'; }
  catch { return false; }
}

export function setFcmOptedOut(v: boolean): void {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch { /* private mode — nothing to persist */ }
}

/** Detect the shipped Capacitor Android build so we don't try to
 *  register a Web-Push VAPID token there (Capacitor uses the native
 *  FCM plugin — a separate Stage 3B when we ship the APK push path). */
function isCapacitorAndroid(): boolean {
  return typeof (window as any).Capacitor?.getPlatform === 'function'
    && (window as any).Capacitor.getPlatform() === 'android';
}

/** Ask the browser for Notification permission ONCE — after a user
 *  gesture (mount is fine on a page you got to by clicking Sign In).
 *  Returns 'granted' | 'denied' | 'default'. */
async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

/**
 * Actual work — extracted so refreshFcmToken() can call it manually
 * from the "Enable push notifications" toggle without waiting for the
 * next user-id change to re-trigger the effect.
 */
async function registerCurrentDevice(): Promise<void> {
  if (isFcmOptedOut()) return;
  if (isCapacitorAndroid()) return;
  if (!FCM_VAPID_PUBLIC_KEY) {
    console.info('V-fcm-2b: VITE_FCM_VAPID_KEY missing — push registration skipped.');
    return;
  }

  const permission = await ensureNotificationPermission();
  if (permission !== 'granted') return;

  const messaging = await getFcmMessaging();
  if (!messaging) return;

  let swReg: ServiceWorkerRegistration | undefined;
  try {
    swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  } catch (err) {
    console.warn('V-fcm-2b: SW registration failed', err);
    return;
  }

  let token: string;
  try {
    token = await getToken(messaging, {
      vapidKey: FCM_VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: swReg,
    });
  } catch (err) {
    console.warn('V-fcm-2b: getToken failed', err);
    return;
  }
  if (!token) return;

  // Skip the round-trip if we already registered this exact token
  // during a previous mount — Firebase reuses the same token across
  // reloads as long as the browser installation stays the same.
  const last = (() => { try { return localStorage.getItem(LAST_TOKEN_KEY); } catch { return null; } })();
  if (last === token) return;

  try {
    await registerFcmToken({
      token,
      platform: 'web',
      deviceLabel: buildDeviceLabel(),
      userAgent: navigator.userAgent,
    });
    try { localStorage.setItem(LAST_TOKEN_KEY, token); } catch { /* ignore */ }
  } catch (err) {
    console.warn('V-fcm-2b: backend registration failed', err);
  }

  // Foreground message handler — Firebase suppresses the OS banner
  // when the tab is active, so we surface a lightweight toast so the
  // operator sees the notification without leaving the page.
  onMessage(messaging, (payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'Notification';
    const body  = payload?.notification?.body  || payload?.data?.body  || '';
    toast(title, { description: body });
    // V-fcm-3-tauri — also raise a native Windows toast so the
    // desktop-app operator sees the notification even when the app
    // window isn't focused. No-op in browsers.
    if (isTauriHost()) void showTauriNotification(title, body);
  });
}

/** Build a friendly device label from the User-Agent, capped at 60
 *  chars so it fits the varchar(255) backend column with room to
 *  spare and doesn't spam the "Signed-in devices" settings list. */
function buildDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  const os =
    /Windows NT/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Web';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  return `${browser} on ${os}`.slice(0, 60);
}

/** Manually re-trigger registration — used by the Settings toggle
 *  when the user flips push notifications back on within the same
 *  session. Returns a promise so the caller can spin a Save button. */
export async function refreshFcmToken(): Promise<void> {
  await registerCurrentDevice();
}

/**
 * Mounted from the authenticated app shell (Layout). Fires whenever
 * the logged-in user id changes so:
 *   - a fresh login on this browser registers the current token,
 *   - a logout → re-login as a DIFFERENT user re-registers so the
 *     token migrates to the new user's row (backend upserts by token).
 *
 * V-fcm-3-user-pref — also respects the server-side per-user toggle
 * on {@code currentUser.notificationsEnabled}. Undefined = ON (pre-
 * V325 tenant / stale cached user). False = skip registration on this
 * mount; toggling back on inside Profile calls {@link refreshFcmToken}
 * explicitly so we don't need to re-run the hook.
 */
export function useFcmToken(userId: string | undefined | null,
                            notificationsEnabled: boolean | undefined = undefined): void {
  useEffect(() => {
    if (!userId) return;
    if (notificationsEnabled === false) return;
    let cancelled = false;
    (async () => {
      try { if (!cancelled) await registerCurrentDevice(); }
      catch (err) { console.warn('V-fcm-2b: useFcmToken failed', err); }
    })();
    return () => { cancelled = true; };
  }, [userId, notificationsEnabled]);
}
