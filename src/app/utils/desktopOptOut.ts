/**
 * "Use the desktop site" opt-out, the half that has to run in the browser.
 *
 * Phones hitting hr-share.com are bounced to m.hr-share.com by a redirect
 * rule in vercel.json. That rule is skipped for a request carrying
 * `?desktop=1` or a `prefer_desktop` cookie.
 *
 * The cookie has to be written HERE because Vercel's redirect layer can
 * only read request conditions — it cannot set a response cookie. Without
 * this module `?desktop=1` would work for exactly one request: the link
 * would open the desktop app, and the next hard refresh (or any shared
 * link without the parameter) would bounce the visitor straight back to
 * the mobile site. Writing the cookie once makes the choice stick.
 *
 * Client-side navigation never re-triggers the redirect — it only applies
 * to document requests — so this runs once at boot and is then irrelevant
 * until the next full page load, which is precisely when it matters.
 */

const COOKIE = 'prefer_desktop';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remember a `?desktop=1` visit so later page loads are not redirected. */
export function rememberDesktopPreference(): void {
  // SSR/test guard — this module is imported from the entry point.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    const desktop = params.get('desktop');

    if (desktop === '1') {
      // No `domain=` on purpose: the cookie is scoped to the host that set
      // it. m.hr-share.com must never see it, or the mobile site would
      // start reading a preference that is only about the desktop one.
      document.cookie =
        `${COOKIE}=1; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
      return;
    }

    // `?desktop=0` is the way back to the mobile site: clear the cookie so
    // the redirect resumes on the next load. Without an off switch a
    // visitor who once tapped "desktop site" could never undo it.
    if (desktop === '0') {
      document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    // Cookies disabled, or an opaque origin. The opt-out simply does not
    // persist; nothing else in the app depends on it, so there is no
    // reason to let this break boot.
  }
}
