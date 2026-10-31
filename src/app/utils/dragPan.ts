/**
 * Hold-and-drag horizontal pan for a scroll box — the table header's
 * drag (v-table-header-drag-pan), shared so a toolbar strip scrolls the
 * same way. Call it from a mousedown handler once the caller has decided
 * the press should pan (it skipped controls and the box overflows).
 * Touch keeps the browser's native swipe; this is for the mouse.
 *
 * The box's `scrollLeft` is driven directly, so the pan works with any
 * browser's scroll behaviour.
 */
export function startDragPan(e: { clientX: number; preventDefault(): void }, box: HTMLElement) {
  const startX = e.clientX;
  const startScroll = box.scrollLeft;
  let moved = false;
  const move = (ev: MouseEvent) => {
    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) < 3) return; // drag threshold
    moved = true;
    box.scrollLeft = startScroll - dx;
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  e.preventDefault();
}
