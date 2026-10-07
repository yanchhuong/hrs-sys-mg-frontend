/**
 * "Use the desktop site" opt-out, the half that has to run in the browser.
 *
 * ── STATUS: DEVICE REDIRECT DISABLED (2026-10-07) ─────────────────────────
 * The phone → m.hr-share.com redirect is switched OFF. PC and phone
 * browsers both stay on hr-share.com; m.hr-share.com is reached only by
 * going there directly. Reasons: it exempted bots/crawlers, so scanners
 * saw a different site than phones did — the "cloaking" pattern security
 * vendors flag, and the carrier Smart's filter had already blocked
 * hr-share.com as phishing. Nothing in this file runs a redirect, so it is
 * harmless while the rule is off; it keeps working if the rule returns.
 *
 * To turn the redirect back on, add this to the top level of vercel.json
 * (JSON cannot hold comments, and Vercel rejects unknown keys, so the rule
 * lives here). Read the two traps below first.
 *
 *   "redirects": [
 *     {
 *       "source": "/(.*)",
 *       "has": [
 *         { "type": "host",   "value": "(www\\.)?hr-share\\.com" },
 *         { "type": "header", "key": "sec-fetch-dest", "value": "document" },
 *         { "type": "header", "key": "user-agent",
 *           "value": ".*([iI][pP]hone|[iI][pP]od|[aA]ndroid.*[mM]obile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile).*" }
 *       ],
 *       "missing": [
 *         { "type": "header", "key": "user-agent",
 *           "value": ".*([bB]ot|[cC]rawler|[sS]pider|[sS]lurp|facebookexternalhit|[eE]mbedly|[pP]interest|[wW]hats[aA]pp|[tT]elegram|[aA]pple[bB]ot|[lL]ighthouse|HeadlessChrome).*" },
 *         { "type": "cookie", "key": "prefer_desktop" },
 *         { "type": "query",  "key": "desktop" }
 *       ],
 *       "destination": "https://m.hr-share.com/$1",
 *       "permanent": false
 *     }
 *   ]
 *
 * If it comes back, consider dropping the bot/crawler exemption from
 * "missing" — that exemption is what made it look like cloaking.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * When enabled: phones hitting hr-share.com are bounced to m.hr-share.com
 * by the rule above. That rule is skipped for a request carrying
 * `?desktop=1` or a `prefer_desktop` cookie.
 *
 * The cookie has to be written HERE because Vercel's redirect layer can
 * only read request conditions — it cannot set a response cookie. Without
 * this module `?desktop=1` would work for exactly one request: the link
 * would open the desktop app, and the next hard refresh (or any shared
 * link without the parameter) would bounce the visitor straight back to
 * the mobile site. Writing the cookie once makes the choice stick.
 *
 * TWO TRAPS IN THE vercel.json RULE, recorded here because JSON cannot
 * carry comments and both of these took the phone site down once:
 *
 *   1. The source must be "/(.*)", NOT "/:path*". The latter looks
 *      equivalent and is not: it matches /dashboard but NOT the bare "/",
 *      so the home page alone was served the desktop build.
 *
 *   2. The rule must require `sec-fetch-dest: document`. Without it the
 *      source pattern also matches /assets/*.js and /assets/*.css, and
 *      every script and stylesheet gets redirected to m.hr-share.com
 *      where those hashed filenames do not exist. The document loads,
 *      nothing else does, and the page renders blank white.
 *
 *      Only a top-level navigation sends sec-fetch-dest: document;
 *      subresources send script/style/image/empty. A browser too old to
 *      send the header at all (iOS Safari before 16.4) is simply not
 *      redirected, which is the safe way to fail.
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
