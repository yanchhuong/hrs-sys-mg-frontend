import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';

/**
 * Drag-to-reorder for a vertical list, with a grip handle per row.
 *
 * Pointer events (not HTML5 drag-and-drop), so it works the same with a
 * mouse, a finger on a tablet, or a pen. The dragged row follows the
 * pointer; when ITS middle passes a neighbour's middle the two swap, so
 * it doesn't matter where on the row you grabbed it. The handle also
 * takes ArrowUp / ArrowDown, so the order can be changed from the
 * keyboard.
 *
 *   const drag = useDragReorder(setItems);
 *   <div ref={drag.rowRef(i)} style={drag.rowStyle(i)} …>
 *     <button {...drag.handleProps(i, label)}><GripVertical/></button>
 *   drag.dragIndex === i → style the row being dragged
 */
export function useDragReorder<T>(setItems: Dispatch<SetStateAction<T[]>>) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  /** index being dragged, where the pointer grabbed it (from the row's
   *  top), and the row's natural (untransformed) top at the last move. */
  const st = useRef<{ index: number; grab: number; shift: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [shift, setShift] = useState(0);

  const move = (from: number, to: number) => {
    setItems(list => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  /** A row's top without the drag transform. */
  const naturalTop = (i: number) => {
    const el = rows.current[i];
    if (!el) return 0;
    const t = el.getBoundingClientRect().top;
    return st.current && st.current.index === i ? t - st.current.shift : t;
  };

  const onMove = (clientY: number) => {
    const s = st.current;
    if (!s) return;
    const self = rows.current[s.index];
    if (!self) return;
    const h = self.getBoundingClientRect().height;
    const centre = clientY - s.grab + h / 2;
    let to = s.index;
    rows.current.forEach((el, i) => {
      if (!el || i === s.index) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (i < s.index && centre < mid) to = Math.min(to, i);
      if (i > s.index && centre > mid) to = Math.max(to, i);
    });
    if (to !== s.index) {
      move(s.index, to);
      s.index = to;
      setDragIndex(to);
    }
    // Follow the pointer: offset from where the row naturally sits now.
    // (After a swap the DOM moves on the next render; re-measure then.)
    requestAnimationFrame(() => {
      const cur = st.current;
      if (!cur) return;
      const el = rows.current[cur.index];
      if (!el) return;
      const top = el.getBoundingClientRect().top - cur.shift;
      cur.shift = clientY - cur.grab - top;
      setShift(cur.shift);
    });
  };

  // Listen on the window for the whole drag. Pointer capture on the handle
  // isn't enough: when the row passes a neighbour React moves its element
  // in the DOM, and moving an element drops its pointer capture.
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);
  const end = () => {
    if (listeners.current) {
      window.removeEventListener('pointermove', listeners.current.move);
      window.removeEventListener('pointerup', listeners.current.up);
      window.removeEventListener('pointercancel', listeners.current.up);
      listeners.current = null;
    }
    st.current = null; setDragIndex(null); setShift(0);
  };
  // Closed mid-drag (e.g. the dialog went away): drop the window listeners.
  useEffect(() => () => {
    if (!listeners.current) return;
    window.removeEventListener('pointermove', listeners.current.move);
    window.removeEventListener('pointerup', listeners.current.up);
    window.removeEventListener('pointercancel', listeners.current.up);
  }, []);

  return {
    dragIndex,
    rowRef: (i: number) => (el: HTMLElement | null) => { rows.current[i] = el; },
    /** Lifts the dragged row and makes it follow the pointer. */
    rowStyle: (i: number): CSSProperties | undefined =>
      dragIndex === i ? { transform: `translateY(${shift}px)`, position: 'relative', zIndex: 10 } : undefined,
    handleProps: (i: number, label: string) => ({
      type: 'button' as const,
      'aria-label': `Drag to reorder ${label}`,
      title: 'Drag to reorder (or use ↑ ↓)',
      style: { touchAction: 'none' as const, cursor: dragIndex === i ? 'grabbing' : 'grab' },
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        e.preventDefault();
        end();
        st.current = { index: i, grab: e.clientY - naturalTop(i), shift: 0 };
        setShift(0);
        setDragIndex(i);
        const move = (ev: PointerEvent) => { if (st.current) { ev.preventDefault(); onMove(ev.clientY); } };
        const up = () => end();
        listeners.current = { move, up };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
        move(i, to);
        // Keep focus on the handle as it moves with its row.
        requestAnimationFrame(() => (rows.current[Math.max(0, to)]?.querySelector('[aria-label^="Drag to reorder"]') as HTMLElement | null)?.focus());
      },
    }),
  };
}
