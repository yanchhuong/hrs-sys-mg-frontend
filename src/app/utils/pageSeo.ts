/**
 * Page-level search-engine tags for the single-page app (v-ai-visibility).
 *
 * index.html is one static file served for every path, so it carries the
 * homepage's tags everywhere. Once the bundle knows the path, these put
 * the right ones in place:
 *   - private links (invoices, invitations, password reset, in-store
 *     screens) → noindex, nofollow: they are meant for one person or one
 *     device, never for search results;
 *   - content pages (/cambodia) → their own title, description and
 *     canonical, instead of pointing at the homepage.
 *
 * Done in the page, not with vercel.json headers, because the owner keeps
 * config files out of commits. Google reads tags set by JavaScript when it
 * renders the page. This only hides pages from search; it protects
 * nothing — the API still decides who can read what.
 */

const SITE = 'https://www.hr-share.com';

/** Public pages that must never show up in search. Same list as the
 *  public routes in App.tsx, minus the ones meant to be found
 *  (/cambodia, /shop/:code, /requirement-survey). */
const PRIVATE_LINK = /^\/(scan|pos\/display|reset-password|auth\/telegram)(\/|$)|^\/(kitchen|booking|invoice\/view|rsvp|invite)\//;

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Run once at startup, before the first render. */
export function applyPathRobots(pathname: string = window.location.pathname): void {
  if (!PRIVATE_LINK.test(pathname)) return;
  setMeta('name', 'robots', 'noindex, nofollow');
  setMeta('name', 'googlebot', 'noindex, nofollow');
}

/** A content page's own title, description and canonical URL. */
export function setPageSeo(p: { title: string; description: string; path: string }): void {
  const url = SITE + p.path;
  document.title = p.title;
  setMeta('name', 'description', p.description);
  setCanonical(url);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:title', p.title);
  setMeta('property', 'og:description', p.description);
  setMeta('name', 'twitter:title', p.title);
  setMeta('name', 'twitter:description', p.description);
}
