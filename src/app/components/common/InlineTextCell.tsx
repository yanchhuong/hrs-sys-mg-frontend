import { useEffect, useRef, useState } from 'react';

/**
 * Inline-editable text cell for list-page rows.
 *
 * <p>Renders a transparent input styled as plain text at rest so the
 * cell reads like a normal read-only value. Hovering reveals a subtle
 * gray outline; clicking / focusing swaps to a blue outline + white
 * background. Blur commits when the trimmed value differs from what
 * was last saved; Enter commits directly (then blurs), Escape reverts
 * to the last saved value.</p>
 *
 * <p>Empty save clears the field on the server (the caller decides
 * what "clear" means for their column). Reads the parent's optimistic
 * / reconciled `value` prop back into the buffer only when the input
 * is NOT focused — mid-typing never gets clobbered by a background
 * PUT reconcile.</p>
 *
 * <p>Save is driven by a single `commit()` helper called from BOTH
 * Enter (before .blur()) and blur. Reading the buffer from a ref
 * instead of the closure `text` sidesteps stale-closure races when
 * React re-renders between keystroke and blur — the original blur-
 * only handler occasionally missed the save on fast Enter.</p>
 *
 * <p>Used by the Items row Unit column and the Customers row Phone /
 * TIN / Representative / Site columns. Same visual affordance across
 * both pages so operators build one muscle memory for "click a cell
 * to edit."</p>
 */

interface Props {
  value: string;
  disabled: boolean;
  /** Fires when the trimmed value differs from `value` — on Enter,
   *  or on blur. Enter also blurs. Called with the trimmed new value. */
  onSave: (next: string) => void;
  /** Horizontal alignment. Defaults to left. */
  align?: 'left' | 'center' | 'right';
  /** Placeholder shown when both the value and the buffer are empty. */
  placeholder?: string;
  /** Optional input type override. Default 'text'; use 'tel' for
   *  phone columns, 'url' for site columns — the browser tweaks the
   *  keyboard layout on mobile without changing storage semantics. */
  inputType?: 'text' | 'tel' | 'url' | 'email';
  /** aria-label — recommended when the visible column header alone
   *  isn't enough context (e.g. one-line cells without a paired label). */
  ariaLabel?: string;
}

export function InlineTextCell({
  value,
  disabled,
  onSave,
  align = 'left',
  placeholder,
  inputType = 'text',
  ariaLabel,
}: Props) {
  const [text, setText] = useState<string>(value);
  const [focused, setFocused] = useState<boolean>(false);
  // Ref mirror of the live buffer so commit() reads the latest value
  // even after a re-render between the last keystroke and blur.
  const textRef = useRef<string>(value);
  // Snapshot of the last-saved value the parent has confirmed. Used
  // by commit() so a rapid Enter → blur pair only fires onSave once
  // (blur's commit sees the just-committed value and no-ops).
  const savedRef = useRef<string>(value ?? '');
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { savedRef.current = value ?? ''; }, [value]);
  // Keep the local buffer in sync when the parent's optimistic /
  // reconciled swap lands a fresh value while we're NOT editing.
  // Skipping the sync during focus preserves in-progress typing.
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const commit = () => {
    const trimmed = textRef.current.trim();
    if (trimmed !== savedRef.current) {
      savedRef.current = trimmed;
      onSave(trimmed);
    }
  };

  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <input
      type={inputType}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          // Commit BEFORE blur so a parent <form> capturing Enter for
          // submit can't race the save. stopPropagation keeps Enter
          // from bubbling to any parent Enter-handler.
          e.preventDefault();
          e.stopPropagation();
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setText(value);
          e.currentTarget.blur();
        }
      }}
      disabled={disabled}
      // Always show the "—" placeholder on empty values, even when the
      // input is disabled — read-only cells (e.g. individual customer
      // TIN / Rep / Site) still need the visual dash so the row's baseline
      // matches sibling editable rows. Callers can override with `placeholder`.
      placeholder={placeholder ?? '—'}
      aria-label={ariaLabel}
      className={`w-full ${alignCls} text-xs bg-transparent px-1.5 py-1 rounded border transition ${
        focused
          ? 'border-blue-400 bg-white outline-none'
          : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
      } disabled:opacity-60 disabled:cursor-not-allowed`}
    />
  );
}
