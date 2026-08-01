import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/input';

/**
 * A search input that pops a suggestion list under itself as the
 * operator types. Each row shows the matched substring in bold so
 * the eye lands on why this candidate came back.
 *
 * <p>The parent hands the full unfiltered source (typically the
 * loaded item / row list mapped to {@link Suggestion} shape); this
 * component owns the substring match, dedup, ranking, and truncation.
 * Keeps the component reusable across POS + Items without coupling
 * either page to a shared model type.</p>
 *
 * <p>Click a suggestion → the input value is set to that label AND
 * {@code onPick} fires so the parent can also drive a "commit"
 * behaviour (add to cart on POS, open detail on Items, etc). Clicking
 * outside or pressing Escape closes the dropdown.</p>
 */

export interface Suggestion {
  label: string;
  /** Optional secondary line (SKU, price, sub-category — whatever
   *  helps the operator recognise the row at a glance). */
  secondary?: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** Full unfiltered source. The component filters case-insensitively
   *  by substring match on {@link Suggestion.label} + {@link secondary}. */
  suggestions: Suggestion[];
  /** Optional "commit" callback fired when a suggestion is clicked.
   *  Called AFTER onChange has already fired with the picked label. */
  onPick?: (picked: Suggestion) => void;
  /** Cap on how many rows to render. Defaults to 8. */
  maxItems?: number;
  /** ARIA label for the input. */
  ariaLabel?: string;
  /** Wrapper class — apply width / min-width here so both the input
   *  and the dropdown match. */
  wrapperClassName?: string;
  /** V302 — fires when the user presses Enter with a non-empty value
   *  AND no suggestion is currently highlighted. POS + doc forms
   *  use this to trigger a barcode / SKU lookup so a physical
   *  scanner (which types the code + a newline) adds the item
   *  straight into the cart without a mouse click. */
  onEnter?: (value: string) => void;
  /** Auto-focus the input on mount. Used by the responsive
   *  collapse-to-icon flow on the POS: tapping the icon mounts the
   *  input with autoFocus so the on-screen keyboard opens instantly. */
  autoFocus?: boolean;
  /** Callback fired on blur. Not passed the event because the only
   *  consumer (POS collapse) doesn't need it. */
  onBlur?: () => void;
  /** Callback fired when Escape is pressed. Lets the parent collapse
   *  the input on the mobile icon-toggle flow. Escape still closes
   *  the suggestion dropdown internally as well. */
  onEscape?: () => void;
}

/** Render a label with the matching substring in bold. Case-insensitive
 *  match; keeps the original case in the visible output. */
function HighlightedLabel({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-blue-700 bg-blue-50 rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

export function SearchWithSuggestions({
  value,
  onChange,
  placeholder,
  className,
  suggestions,
  onPick,
  maxItems = 8,
  ariaLabel,
  wrapperClassName,
  onEnter,
  autoFocus,
  onBlur,
  onEscape,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // v-search-suggestions-float — the dropdown was clipped by parent
  // overflow / stacking contexts (filter strips, card headers with
  // overflow-x-auto). Portal it to <body> with fixed positioning so
  // it floats above every neighbouring surface. We track the input's
  // viewport rect and re-measure on scroll / resize.
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) { setRect(null); return; }
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Substring match on either label or secondary. Rank exact-prefix
  // matches ahead of interior matches so "Cap" surfaces "Cappuccino"
  // above "Caramel Macchiato Cap Set".
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [] as Array<Suggestion & { _rank: number }>;
    const out: Array<Suggestion & { _rank: number }> = [];
    for (const s of suggestions) {
      const lab = (s.label ?? '').toLowerCase();
      const sec = (s.secondary ?? '').toLowerCase();
      const inLabel = lab.includes(q);
      const inSecondary = sec.includes(q);
      if (!inLabel && !inSecondary) continue;
      // 0 = prefix match on label (best), 1 = interior label,
      // 2 = secondary match only.
      const rank = lab.startsWith(q) ? 0 : inLabel ? 1 : 2;
      out.push({ ...s, _rank: rank });
    }
    out.sort((a, b) => a._rank - b._rank || a.label.localeCompare(b.label));
    // Dedupe on the label so a POS with 20 identical-name lines
    // doesn't drown the operator in one option.
    const seen = new Set<string>();
    const deduped: typeof out = [];
    for (const s of out) {
      const key = s.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
      if (deduped.length >= maxItems) break;
    }
    return deduped;
  }, [suggestions, value, maxItems]);

  // Close on outside click. Not using Popover because Popover pulls
  // focus and would break the "still typing in the same input" flow.
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const insideInput = wrapperRef.current?.contains(t);
      const insideDropdown = dropdownRef.current?.contains(t);
      if (!insideInput && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (s: Suggestion) => {
    onChange(s.label);
    onPick?.(s);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter with a live value and no highlighted suggestion falls
    // through to onEnter — that's the "physical scanner just typed a
    // full barcode + newline" path. Handled before the `if (!open)`
    // guard so it also fires when the dropdown never opened (fast
    // scanners can outrun the setOpen render).
    if (e.key === 'Enter' && value.trim() && (activeIndex < 0 || !filtered[activeIndex]) && onEnter) {
      e.preventDefault();
      onEnter(value.trim());
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      pick(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      onEscape?.();
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName ?? ''}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => value && setOpen(true)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={`pl-8 pr-8 ${className ?? ''}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && filtered.length > 0 && rect && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] rounded-md border border-gray-200 bg-white shadow-lg max-h-[60vh] overflow-y-auto hover-scroll-y"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {filtered.map((s, i) => (
            <button
              key={s.label}
              type="button"
              // Keep the input focused (onMouseDown fires before blur)
              // so the operator can keep typing without a click stealing
              // focus. preventDefault stops the input from blurring.
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 ${
                i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="truncate">
                <HighlightedLabel text={s.label} query={value} />
              </span>
              {s.secondary && (
                <span className="text-[10px] text-gray-500 shrink-0">
                  <HighlightedLabel text={s.secondary} query={value} />
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
