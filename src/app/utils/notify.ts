import { toast } from 'sonner';

/**
 * Common toast helper. Use these instead of importing `toast` directly so
 * the semantic colour scheme stays consistent across screens:
 *
 *   • `notify.success` — green   (confirmations, "Saved", "Created")
 *   • `notify.error`   — red     (server failures, network errors, exceptions)
 *   • `notify.validate`— orange  (client-side form validation feedback)
 *   • `notify.info`    — blue    (neutral status messages)
 *
 * Backed by Sonner's rich-color mode (see `components/ui/sonner.tsx`).
 *
 * Migration note: existing `toast.success` / `toast.error` calls already pick
 * up the new colour scheme — no rewrite needed. Use `notify.validate` for
 * **new** validation toasts so future readers can tell at a glance that the
 * yellow toast was a deliberate choice.
 */

type ToastOpts = Parameters<typeof toast.success>[1];

export const notify = {
  success(message: string, opts?: ToastOpts) {
    return toast.success(message, opts);
  },

  error(message: string, opts?: ToastOpts) {
    return toast.error(message, opts);
  },

  /**
   * Field validation / soft warning. Sonner renders this orange via
   * `richColors`. Use for "Please fill the required field", "Pick a date
   * first", etc. — anything the user can fix by tweaking the form.
   */
  validate(message: string, opts?: ToastOpts) {
    return toast.warning(message, opts);
  },

  info(message: string, opts?: ToastOpts) {
    return toast.info(message, opts);
  },

  /** Pass-through for promise-based toasts (loading → success/error). */
  promise: toast.promise,
};
