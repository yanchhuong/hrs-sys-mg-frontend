/**
 * v-remember-current-view — survive a full page reload.
 *
 * The main app has no router: `currentView` is plain React state in
 * App.tsx, so every full document load starts again at `'dashboard'`.
 * For a tenant whose plan has no Home/Dashboard module that view is
 * not allowed, and `v-first-allowed-view-redirect` quietly bounces
 * the user to the first nav leaf they CAN see — Employee.
 *
 * That is fine on a fresh sign-in and wrong everywhere else, because
 * the app reloads itself in situations the operator never asked for:
 *
 *   • `installChunkReloadSafetyNet` reloads the tab when a lazily
 *     imported chunk 404s — which is exactly what happens to someone
 *     who had the page open across a deploy and then clicked a button
 *     backed by a code-split dialog.
 *   • Vite's dev server forces a reload the first time it discovers a
 *     dependency that only a dynamic import reaches.
 *   • The operator pressed F5.
 *
 * In all three the symptom reads as a navigation bug — "I clicked
 * Print labels on Items and it threw me onto Employee" — because the
 * reload itself is invisible. Remembering the chosen view turns that
 * into what it should have been: the page comes back.
 *
 * sessionStorage, not localStorage, and keyed by user id:
 *   • per tab, so two tabs open on different pages do not fight over
 *     one value, and a reload (same tab) still restores;
 *   • per user, so signing in as someone else on a shared machine
 *     does not drop you onto the previous account's last page;
 *   • forgotten when the tab closes, so a fresh visit starts clean.
 *
 * Restoring is never trusted on its own — App still runs the restored
 * id through the same permission check as any other view, so a page
 * the user has since lost access to falls back as it always did.
 */

const PREFIX = 'hrms:last-view:';

/** sessionStorage throws in private mode / exotic embeds. Losing the
 *  remembered view is a cosmetic regression; crashing the app over it
 *  is not, so every access is swallowed. */
function key(userId: string | number | null | undefined): string | null {
  return userId === null || userId === undefined ? null : `${PREFIX}${userId}`;
}

/** The view this user was last on in this tab, or null. */
export function readLastView(userId: string | number | null | undefined): string | null {
  const k = key(userId);
  if (!k) return null;
  try {
    const v = sessionStorage.getItem(k);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** Remember a view the user navigated to deliberately. */
export function rememberView(
  userId: string | number | null | undefined,
  view: string,
): void {
  const k = key(userId);
  if (!k || !view) return;
  try {
    sessionStorage.setItem(k, view);
  } catch {
    /* noop — see above */
  }
}
