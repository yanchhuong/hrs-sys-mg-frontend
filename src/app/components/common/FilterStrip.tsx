import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type MouseEvent } from 'react';
import { cn } from '../ui/utils';
import { startDragPan } from '../../utils/dragPan';

/**
 * One-line toolbar that scrolls sideways instead of wrapping — the same
 * idea as a wide table's header. Swipe on touch, two-finger swipe /
 * shift-wheel on a trackpad, or hold and drag an empty spot (a gap, a
 * label, an icon) with the mouse. Controls inside keep their own clicks.
 *
 * Builds on the `.filter-strip` class (single row, `touch-action: pan-x`
 * so iPad swipes move it, slim scrollbar on hover). Adds the cue the
 * plain class lacked: the edge fades while there is more to see in that
 * direction (`data-fade-left` / `data-fade-right`, see styles/index.css).
 *
 * Put `ml-auto` on the last child to keep it right-aligned when there
 * is room; once the row overflows the margin collapses and it scrolls.
 */
export function FilterStrip({ className, children, onMouseDown, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < max - 1;
    setEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  // Children change width as data loads (filters appear once rows do),
  // so re-measure after every render, not only on resize.
  useLayoutEffect(measure);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, []);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e);
    if (e.defaultPrevented || e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label, [role="button"], [role="combobox"]')) return;
    startDragPan(e, el);
  };

  return (
    <div
      ref={ref}
      className={cn('filter-strip py-1', className)}
      data-fade-left={edges.left || undefined}
      data-fade-right={edges.right || undefined}
      onMouseDown={handleMouseDown}
      {...props}
    >
      {children}
    </div>
  );
}
