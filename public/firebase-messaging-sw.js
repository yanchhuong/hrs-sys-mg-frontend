/*
 * V-fcm-2b — Firebase Messaging service worker.
 *
 * MUST live at /firebase-messaging-sw.js (the browser scopes it to '/'
 * and Firebase looks for this exact filename). Loaded by the Firebase
 * Web SDK the first time the app calls getToken(). Runs in a separate
 * worker context — no access to the app's bundled modules, so it pulls
 * the Firebase compat build from the CDN directly.
 *
 * Keep the config values in sync with src/app/config/firebase.ts —
 * this file has no build-time templating (it's copied verbatim from
 * /public into the dist root) so the values are duplicated by design.
 */

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyBqXgGrA2YYK1HDURhXywwZKtdYLqYCoTM',
  authDomain:        'smrt-hrms.firebaseapp.com',
  projectId:         'smrt-hrms',
  storageBucket:     'smrt-hrms.firebasestorage.app',
  messagingSenderId: '77995734399',
  appId:             '1:77995734399:web:36a9854c3aa5fd3df1964a',
});

const messaging = firebase.messaging();

/*
 * Background handler — fires when the page is CLOSED or in a
 * BACKGROUND tab. Foreground messages go straight to the app's
 * onMessage() listener registered in useFcmToken.
 *
 * Firebase auto-shows the OS banner when the payload has a
 * `notification` key, so we only step in when the payload is
 * `data`-only (used by our backend for deep-link-only pushes).
 */
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'SMRT HRMS';
  const body  = payload?.notification?.body  || payload?.data?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload?.data ?? {},
  });
});

/*
 * Click handler — deep-links into the app when the user taps the
 * banner. If the app is already open in a tab, focus it; otherwise
 * open a new window at the URL the backend included in
 * payload.data.url (or fall back to '/').
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        try {
          client.postMessage({ kind: 'fcm-notification-click', url: targetUrl });
          return client.focus();
        } catch { /* ignore focus failures — fall through to openWindow */ }
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
