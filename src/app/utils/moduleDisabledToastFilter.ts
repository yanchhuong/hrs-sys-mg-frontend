/**
 * Global filter that silently absorbs the module-disabled toast.
 *
 * <p>When the tenant has a module turned off (Super Admin's Tenant
 * Modules toggle, or the Admin's own +/− tile in the Apps launcher),
 * the backend returns {@code 403 { code: 'ModuleDisabled' }} on any
 * call to that module's endpoints. {@link import('../api/client').apiJson}
 * converts that into a thrown {@link import('../api/client').ModuleDisabledError}
 * so the loader's existing try/catch absorbs it. But the default
 * catch pattern is {@code toast.error(err.message)} — which would
 * flash a red "module not installed" toast every time a not-installed
 * page loads.</p>
 *
 * <p>Side-effect import only: monkey-patches sonner's {@code toast.error}
 * once at startup. The toast object is a singleton across all
 * imports, so replacing its {@code error} method here affects every
 * caller without touching the ~30 catch handlers across views.</p>
 */
import { toast } from 'sonner';

// Marker substring rendered into ModuleDisabledError.message. Keep in
// sync with src/app/api/client.ts. Picked a phrase distinctive enough
// that no other backend error would accidentally collide.
const MODULE_DISABLED_MARKER = 'This module is not installed for your company';

const originalError = toast.error.bind(toast);

(toast as { error: typeof toast.error }).error = ((message: unknown, opts?: unknown) => {
  // `includes` (not `startsWith`) because many catch handlers prefix
  // the original error message — e.g.
  // {@code toast.error(`Failed to load X: ${err.message}`)} — so the
  // marker lands somewhere in the middle of the final string. Anywhere
  // in the message is sufficient evidence this is a module-disabled
  // toast we want to swallow.
  if (typeof message === 'string' && message.includes(MODULE_DISABLED_MARKER)) {
    // Silent — module-disabled is a routine result of the install/uninstall
    // toggle, not an error the operator needs to see. The affected page
    // renders its empty state without further intervention.
    return '' as ReturnType<typeof toast.error>;
  }
  return originalError(message as Parameters<typeof originalError>[0], opts as Parameters<typeof originalError>[1]);
}) as typeof toast.error;
