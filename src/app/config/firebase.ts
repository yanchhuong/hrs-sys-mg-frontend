/**
 * V-fcm-2b — the FE-side Firebase Web SDK config for smrt-hrms.
 *
 * Every value here is a *public* client identifier: the Firebase Web SDK
 * ships these to the browser as part of any Web-Push registration, and
 * Google's own docs classify them as safe to commit. What actually
 * protects the project is:
 *   1. the Google Cloud "Browser API key" HTTP-referrer restriction on
 *      the apiKey below (locks it to *.vercel.app + smrt-hrms.firebaseapp.com),
 *   2. Firestore / Realtime Database security rules,
 *   3. the Admin SDK on the backend using a rotated service-account key
 *      that NEVER ships to the browser (see FcmConfig on the API side).
 *
 * The VAPID public key is separately obtained from Firebase Console →
 * Project Settings → Cloud Messaging → Web Push certificates and pasted
 * here — again, public by design (it's the "identity" half of the Web
 * Push keypair; the private half stays in Firebase).
 */

// Type-only: these are erased at build, so naming them here costs
// nothing at runtime. The SDK itself is loaded on demand below.
import type { FirebaseApp } from 'firebase/app';
import type { Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey:            'AIzaSyBqXgGrA2YYK1HDURhXywwZKtdYLqYCoTM',
  authDomain:        'smrt-hrms.firebaseapp.com',
  projectId:         'smrt-hrms',
  storageBucket:     'smrt-hrms.firebasestorage.app',
  messagingSenderId: '77995734399',
  appId:             '1:77995734399:web:36a9854c3aa5fd3df1964a',
  measurementId:     'G-GY0RPNC2ZS',
} as const;

/** The Web-Push VAPID public key from Firebase Console → Project
 *  Settings → Cloud Messaging → Web Push certificates. Paste yours in
 *  when you generate one; without it, getToken() returns null and the
 *  browser never registers with Firebase. */
export const FCM_VAPID_PUBLIC_KEY =
  (import.meta as { env?: { VITE_FCM_VAPID_KEY?: string } }).env?.VITE_FCM_VAPID_KEY
  ?? '';

/** Idempotent Firebase app bootstrap. Safe to call from every hook
 *  invocation — subsequent calls return the already-initialised app.
 *
 *  The SDK is imported dynamically. Layout mounts the FCM hook on
 *  every authenticated page, and a static import put the whole
 *  Firebase bundle in the entry chunk — downloaded by everyone,
 *  including people sitting on the login page, to support a feature
 *  that only runs once notification permission has been granted. */
export async function ensureFirebaseApp(): Promise<FirebaseApp> {
  const { getApps, getApp, initializeApp } = await import('firebase/app');
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/** Resolve a Messaging instance IF the current browser supports Web
 *  Push. Returns null on unsupported environments (older Safari on
 *  iOS < 16.4, in-app WebViews, private-mode browsers with SW disabled)
 *  so callers can silently skip registration rather than crash. */
export async function getFcmMessaging(): Promise<Messaging | null> {
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    return getMessaging(await ensureFirebaseApp());
  } catch {
    return null;
  }
}
