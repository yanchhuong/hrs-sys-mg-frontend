/**
 * V-landing-reveal — thin IntersectionObserver wrapper.
 *
 * <p>Wrap a landing section with {@code <Reveal>} and the child mounts
 * hidden + slightly shifted, then transitions to its resting state the
 * first time it scrolls into view. Single-fire: scrolling past and
 * back does NOT re-hide + re-animate (that reads as a flicker).</p>
 *
 * <p>All visual work lives in <code>src/styles/index.css</code>:
 * this component just toggles the <code>data-revealed</code>
 * attribute the CSS selector reads. Falls back gracefully when the
 * IntersectionObserver API isn't available.</p>
 *
 * <p>Variants:</p>
 * <ul>
 *   <li><code>up</code>   — slide up + fade (default)</li>
 *   <li><code>fade</code> — pure opacity, no translate</li>
 *   <li><code>left</code> — slide from the left</li>
 *   <li><code>right</code>— slide from the right</li>
 *   <li><code>scale</code>— zoom-in from 0.96</li>
 * </ul>
 */

import React, { useEffect, useRef, useState } from 'react';

export type RevealVariant = 'up' | 'fade' | 'left' | 'right' | 'scale';

interface RevealProps {
  children: React.ReactNode;
  /** Motion variant. Default 'up'. */
  variant?: RevealVariant;
  /** Delay before animating, in ms — stagger children in a row. */
  delay?: number;
  /** Extra classes applied to the wrapping div. */
  className?: string;
  /** Root margin passed to the observer — negative values fire slightly
   *  BEFORE the element is fully in view so the reveal feels attached
   *  to the scroll instead of catching up to it. */
  rootMargin?: string;
  /** How much of the element must be visible to fire. 0-1. */
  threshold?: number;
}

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up:    '',
  fade:  'reveal-fade',
  left:  'reveal-left',
  right: 'reveal-right',
  scale: 'reveal-scale',
};

export function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
  // V-landing-reveal-eager — earlier defaults (rootMargin '-10%' +
  // threshold 0.15) meant a section had to be almost half-visible
  // before it revealed, so a fast-scrolling visitor briefly saw
  // blank canvas mid-page. Now we fire the moment any pixel enters
  // the viewport ('rootMargin: 0px', 'threshold: 0'). The IN-mount
  // fallback further catches sections that were already ABOVE the
  // fold on page load (e.g. after a scroll-restore refresh) — the
  // observer alone would only see them if they intersect once, but
  // the getBoundingClientRect check flags them synchronously.
  rootMargin = '0px',
  threshold = 0,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Graceful degrade: browsers without IntersectionObserver just show
    // the resting state immediately.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    // Belt-and-suspenders: if the element is ALREADY on screen when
    // Reveal mounts (page-load, HMR remount, scroll-restore), reveal
    // it synchronously. The observer still fires below for anything
    // still off-screen.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh && rect.bottom > 0) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          // Optional per-child stagger; the setTimeout lets a Reveal
          // with delay=120 fire visibly after its neighbour with delay=0.
          if (delay > 0) {
            const id = window.setTimeout(() => setVisible(true), delay);
            io.unobserve(el);
            return () => window.clearTimeout(id);
          }
          setVisible(true);
          io.unobserve(el);
          return;
        }
      }
    }, { rootMargin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [delay, rootMargin, threshold]);

  return (
    <div
      ref={ref}
      className={`reveal ${VARIANT_CLASS[variant]} ${className}`.trim()}
      data-revealed={visible ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
