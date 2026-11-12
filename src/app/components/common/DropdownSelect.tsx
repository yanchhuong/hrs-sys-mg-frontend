/**
 * DropdownSelect — drop-in replacement for a native <select>
 * (v-dropdown-select-everywhere).
 *
 * A native <select> opens the browser's own option list: square, blue
 * highlight, OS font. That clashed with the rounded grey popovers used
 * everywhere else (e.g. the Items "+ Price" range). This renders the
 * shared Radix Select instead, so every list opens in the same frame:
 * rounded corners, grey border, white card, soft shadow, grey hover row
 * and a check on the picked option.
 *
 * It is deliberately a DROP-IN: same props, same <option>/<optgroup>
 * children, and onChange still receives something with
 * `e.target.value`, so converting a page is just renaming the tag:
 *
 *   <select value={x} onChange={e => setX(e.target.value)} className="…">
 *     <option value="">All</option> …
 *   </select>
 *   →
 *   <DropdownSelect value={x} onChange={e => setX(e.target.value)} className="…">
 *     <option value="">All</option> …
 *   </DropdownSelect>
 *
 * The <option> elements are only read for their value/label/disabled —
 * they are never rendered as DOM options.
 *
 * Native behaviour it mirrors:
 *  - value '' is a normal option ("All"). Radix reserves the empty
 *    string for "nothing selected", so '' is mapped to a sentinel.
 *  - a value that matches no option shows the first option's label
 *    (greyed), as a native select would show its first entry.
 *  - an <option hidden> is a placeholder: shown in the trigger when it
 *    is the current value, never listed.
 *  - name/required keep working inside a <form> (Radix renders a hidden
 *    native select for submission).
 */
import { Children, Fragment, isValidElement, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDownIcon } from 'lucide-react';
import { SelectContent, SelectGroup, SelectItem, SelectLabel } from '../ui/select';
import { cn } from '../ui/utils';

const EMPTY = '__empty__';
const enc = (v: string) => (v === '' ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? '' : v);

interface Opt { value: string; label: ReactNode; disabled?: boolean; hidden?: boolean }
type Entry = { kind: 'opt'; opt: Opt } | { kind: 'group'; label: ReactNode; opts: Opt[] };

/** Plain text of an option's children — the native fallback when an
 *  <option> has no value attribute. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function collect(children: ReactNode): Entry[] {
  const out: Entry[] = [];
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    const p = child.props as {
      children?: ReactNode; value?: string | number | readonly string[];
      disabled?: boolean; hidden?: boolean; label?: ReactNode;
    };
    if (child.type === Fragment) {
      out.push(...collect(p.children));
    } else if (child.type === 'option') {
      out.push({
        kind: 'opt',
        opt: {
          value: p.value != null ? String(p.value) : textOf(p.children),
          label: p.children,
          disabled: p.disabled,
          hidden: p.hidden,
        },
      });
    } else if (child.type === 'optgroup') {
      const opts = collect(p.children).flatMap(e => (e.kind === 'opt' ? [e.opt] : e.opts));
      out.push({ kind: 'group', label: p.label, opts });
    }
  });
  return out;
}

export type DropdownSelectProps =
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'defaultValue' | 'multiple' | 'size' | 'dir'> & {
    value?: string | number | null;
    onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
    /** Extra classes for the floating list. */
    contentClassName?: string;
  };

export function DropdownSelect({
  value, onChange, children, className, contentClassName,
  disabled, name, required, id, style, title, onBlur, onFocus, onClick,
  ...rest
}: DropdownSelectProps) {
  const entries = collect(children);
  const flat = entries.flatMap(e => (e.kind === 'opt' ? [e.opt] : e.opts));
  const current = value == null ? '' : String(value);
  const match = flat.find(o => o.value === current);
  const first = flat.find(o => !o.hidden) ?? flat[0];

  // A hidden placeholder or an unmatched value is shown as greyed
  // placeholder text instead of a selected item.
  const showPlaceholder = !match || match.hidden;
  const placeholder = match?.hidden ? match.label : first?.label;

  const emit = (v: string) => {
    const target = { value: dec(v), name: name ?? '' };
    onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  // Native selects size to their padding when they set no height; keep
  // a 36px default only for those that set neither height nor padding.
  const sized = /(^|\s)(h-|py-|p-)/.test(className ?? '');

  const item = (o: Opt) => (
    <SelectItem
      key={o.value || EMPTY}
      value={enc(o.value)}
      disabled={o.disabled}
      className="rounded-md text-sm focus:bg-gray-100 focus:text-gray-900"
    >
      {o.label}
    </SelectItem>
  );

  return (
    <SelectPrimitive.Root
      value={showPlaceholder ? '' : enc(current)}
      onValueChange={emit}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        style={style}
        title={title}
        onBlur={onBlur as never}
        onFocus={onFocus as never}
        onClick={onClick as never}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
        aria-invalid={rest['aria-invalid']}
        data-slot="dropdown-select"
        className={cn(
          'inline-flex min-w-0 items-center justify-between gap-1.5 whitespace-nowrap text-left',
          // No border COLOUR here: theme.css gives every element the grey
          // border-border, which is what a native select with `border`
          // drew. (border-input is transparent in this theme — using it
          // made dialog selects lose their outline.) Call sites that set
          // a colour, e.g. the filter strip's border-input, still win.
          'rounded-md border bg-transparent px-2.5 text-sm outline-none',
          'focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          'data-[placeholder]:text-muted-foreground',
          !sized && 'h-9',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      {/* Frame = SelectContent = the same tokens as PopoverContent
          (bg-popover, rounded-md, border, shadow-md). z-[200] keeps it
          above the app's own z-[60..100] sheets and draggable dialogs. */}
      <SelectContent align="start" className={cn('z-[200] max-h-80', contentClassName)}>
        {entries.map((e, i) =>
          e.kind === 'opt'
            ? (e.opt.hidden ? null : item(e.opt))
            : (
              <SelectGroup key={`g${i}`}>
                <SelectLabel>{e.label}</SelectLabel>
                {e.opts.filter(o => !o.hidden).map(item)}
              </SelectGroup>
            ),
        )}
      </SelectContent>
    </SelectPrimitive.Root>
  );
}
