/**
 * Number fields select their whole value on focus, app-wide, so a price
 * or a quantity is typed over rather than added to ("470" then "5" gives
 * "5", not "4705").
 *
 * One document listener covers every number field, whether it is the
 * shared <Input> or a plain <input>: type="number", or inputmode
 * "decimal" / "numeric". A field opts out with data-keep-caret on itself
 * or an ancestor; the one-time-code input (data-input-otp) is left alone.
 */
const NUMBER_FIELD = 'input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]';
const OPT_OUT = '[data-keep-caret], [data-input-otp]';

let installed = false;
let pointerAt = 0;

function selectAll(el: HTMLInputElement) {
  // setSelectionRange is what iOS Safari honours; type="number" refuses
  // it, and select() covers that one.
  try { el.setSelectionRange(0, el.value.length); } catch { el.select(); }
}

export function installSelectNumberOnFocus(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', () => { pointerAt = Date.now(); }, true);
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.matches(NUMBER_FIELD)) return;
    if (el.readOnly || el.disabled || el.closest(OPT_OUT)) return;
    // A click puts its caret down after the focus; select once it has,
    // and stop the mouseup that ends the click from collapsing it again.
    if (Date.now() - pointerAt < 500) {
      const keep = (ev: Event) => ev.preventDefault();
      el.addEventListener('mouseup', keep, { once: true });
      setTimeout(() => el.removeEventListener('mouseup', keep), 1000);
    }
    setTimeout(() => { if (document.activeElement === el) selectAll(el); }, 0);
  }, true);
}
