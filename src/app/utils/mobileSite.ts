/**
 * The mobile web app (hrs-pro-appl) and who gets sent to it.
 *
 * v-ai-visibility — anonymous phones stay on this site's landing page
 * (so Google's phone crawler, which indexes mobile-first, reads it), and
 * the landing page's Sign in sends them to the mobile app instead of
 * the desktop login. index.html's device script keeps redirecting
 * phones that are already signed in here. Same rule for every visitor,
 * crawler or person — no bot exception.
 *
 * Keep MOBILE_SITE and the two patterns in step with the inline script
 * in index.html (it runs before this bundle loads, so it can't import).
 */
export const MOBILE_SITE = 'https://m.hr-share.com/';

const PRODUCTION_HOST = /^(www\.)?hr-share\.com$/;
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile/i;

/** A phone on the production site that hasn't chosen the desktop site
 *  (?desktop=1, remembered in the prefer_desktop cookie). Localhost,
 *  Vercel previews and the Tauri / Capacitor builds are never "phones
 *  on the production site". */
export function isPhoneOnProductionSite(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!PRODUCTION_HOST.test(window.location.hostname)) return false;
    if (/(^|;\s*)prefer_desktop=1/.test(document.cookie)) return false;
    return PHONE_UA.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}
