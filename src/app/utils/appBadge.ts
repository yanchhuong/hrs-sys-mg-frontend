/**
 * appBadge — PWA application-badge helper (Badging API).
 *
 * The badge is a presentation layer only: the backend's unread count is
 * the source of truth and the notification bell is the primary
 * indicator. This just mirrors the count onto the installed app icon
 * where the platform supports it.
 *
 * Support is uneven — Chromium on desktop and Android installed PWAs
 * have it; iOS/iPadOS only in recent versions, and only for a Home
 * Screen install. Every call is therefore feature-detected and wrapped,
 * so an unsupported or rejecting platform can never break the app.
 */

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** True when the platform exposes the Badging API. */
export function supportsAppBadge(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

/**
 * Mirror `count` onto the app icon. 0 (or negative) clears it.
 *
 * Never throws: Safari rejects the promise when the page isn't an
 * installed PWA, and that must not surface to the caller.
 */
export async function updateAppBadge(count: number): Promise<void> {
  try {
    const nav = navigator as BadgeNavigator;
    if (!nav?.setAppBadge) return;
    if (count > 0) {
      await nav.setAppBadge(count);
    } else {
      await nav.clearAppBadge?.();
    }
  } catch {
    // Unsupported / not installed / permission denied — the bell still
    // shows the count, so there is nothing to recover from here.
  }
}

/** Clear the badge outright — call on logout and on user switch so the
 *  next person never inherits the previous user's count. */
export async function clearAppBadge(): Promise<void> {
  await updateAppBadge(0);
}
