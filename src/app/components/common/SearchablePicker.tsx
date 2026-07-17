import { useState, ReactNode } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import { ChevronsUpDown, Check, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';

export interface PickerOption {
  /** Stable identifier — what gets emitted via onChange. */
  value: string;
  /** Primary display label. */
  label: string;
  /** Optional secondary label rendered after the primary, in muted color. */
  secondary?: string;
  /** Optional right-aligned trailing content rendered at the end of
   *  the row (e.g. a badge / chip). Free-form ReactNode so callers
   *  can compose coloured pills without the picker needing to know
   *  their shape. Not part of the search haystack — put searchable
   *  keywords in {@link searchKey}. */
  trailing?: ReactNode;
  /** Used as the cmdk fuzzy-search haystack (defaults to label + secondary). */
  searchKey?: string;
}

interface Props {
  options: PickerOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  emptyResultsLabel?: string;
  disabled?: boolean;
  /** Optional empty-state below the search box. Shown when there are zero options. */
  emptyOptionsHint?: ReactNode;
  /**
   * If true, value of "" renders the "None" item which clears the selection.
   * Defaults to true. Set to false for required fields.
   */
  allowClear?: boolean;
  /**
   * Inline-create callback. When provided, a "+ Create '{query}'"
   * item appears at the top of the dropdown whenever the search
   * query is non-empty and doesn't exactly match any option's label
   * (case-insensitive). The callback receives the typed text and is
   * expected to return the newly-created option — the picker then
   * selects it. Throw to signal failure; the picker stays open.
   */
  onCreate?: (label: string) => Promise<PickerOption>;
  /** Override the label on the create item — defaults to {@code Create "{query}"}. */
  createLabel?: (query: string) => string;
  /**
   * Inline-edit callback. When provided, each option row shows a
   * pencil icon that swaps the label for an inline text input +
   * cancel / save buttons. The callback receives the option's value
   * + new label and is expected to return the updated PickerOption —
   * the picker refreshes the local view via {@link onChange} being
   * re-invoked with the same value (so the parent's option list is
   * expected to be updated by the caller separately, typically inside
   * this callback). Throw to signal failure.
   */
  onEdit?: (value: string, newLabel: string) => Promise<PickerOption>;
  /**
   * Inline-delete callback. When provided, each option row shows a
   * trash icon. Confirmation is caller-owned (the callback fires
   * only after the user clicks the icon, so wrap with confirm() /
   * AlertDialog on the caller side if you want a guard).
   */
  onDelete?: (value: string) => Promise<void>;
  className?: string;
}

/**
 * Reusable single-select searchable picker. Visual style matches the
 * Manager / Lead picker in DepsGroup — Popover trigger with cmdk fuzzy-search
 * inside. Use for fields like Position, Department, Reports To.
 *
 * <p>Optional {@link onCreate} / {@link onEdit} / {@link onDelete}
 * hooks turn it into a full "manage in place" picker — the user can
 * add, rename, or remove options without leaving the form. Matches
 * the UX pattern the school vertical needs on Course + Classroom
 * pickers (v-course-schedule-model).</p>
 *
 * Empty value = unset. Pass {@link allowClear}=false to require a selection.
 */
export function SearchablePicker({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyLabel = 'None',
  searchPlaceholder = 'Search…',
  emptyResultsLabel = 'No matches',
  disabled = false,
  emptyOptionsHint,
  allowClear = true,
  onCreate,
  createLabel,
  onEdit,
  onDelete,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  // Inline-edit state — at most one row can be in edit mode at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busyOp, setBusyOp] = useState(false);

  const selected = options.find(o => o.value === value);
  const triggerLabel = selected
    ? (selected.secondary ? `${selected.label} (${selected.secondary})` : selected.label)
    : (allowClear ? emptyLabel : placeholder);
  const trimmed = query.trim();
  const exactExists = !!trimmed && options.some(
    o => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = !!onCreate && trimmed.length > 0 && !exactExists;

  const startEdit = (o: PickerOption) => { setEditingId(o.value); setEditLabel(o.label); };
  const cancelEdit = () => { setEditingId(null); setEditLabel(''); };
  const saveEdit = async () => {
    if (!editingId || !onEdit) return;
    const next = editLabel.trim();
    if (!next) return;
    setBusyOp(true);
    try {
      await onEdit(editingId, next);
      cancelEdit();
    } catch {
      // Caller surfaces the toast; keep edit mode open so the user
      // can retry without retyping.
    } finally {
      setBusyOp(false);
    }
  };
  const doDelete = async (v: string) => {
    if (!onDelete) return;
    setBusyOp(true);
    try {
      await onDelete(v);
      // If we deleted the selected row, clear the selection so the
      // trigger label doesn't dangle.
      if (value === v) onChange('');
    } catch {
      // Caller-side toast handles the error surface.
    } finally {
      setBusyOp(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={o => {
      setOpen(o);
      if (!o) cancelEdit();
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`h-9 w-full justify-between font-normal ${className ?? ''}`}
        >
          <span className={selected ? 'truncate' : 'text-gray-400 truncate'}>{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Explicit var() + min-width — popover.tsx primitive carries a
          default w-72 that outranks the Tailwind arbitrary-CSS-var
          shorthand `w-[--…]` on some builds, so the dropdown was
          rendering narrower than the trigger. Using both `w-[var(…)]`
          and a matching min-w hardens against that. */}
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyResultsLabel}</CommandEmpty>
            {options.length === 0 && emptyOptionsHint && (
              <div className="px-3 py-4 text-xs text-gray-500">{emptyOptionsHint}</div>
            )}
            <CommandGroup>
              {showCreate && onCreate && (
                <CommandItem
                  value={`__create__${trimmed}`}
                  disabled={creating}
                  onSelect={async () => {
                    setCreating(true);
                    try {
                      const created = await onCreate(trimmed);
                      onChange(created.value);
                      setQuery('');
                      setOpen(false);
                    } catch {
                      // toast on caller side
                    } finally {
                      setCreating(false);
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 text-blue-600" />
                  <span className="text-blue-700">
                    {(createLabel ?? ((q: string) => `Create "${q}"`))(trimmed)}
                  </span>
                </CommandItem>
              )}
              {allowClear && (
                <CommandItem
                  value="__none__"
                  onSelect={() => { onChange(''); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${!value ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-gray-500 italic">{emptyLabel}</span>
                </CommandItem>
              )}
              {options.map(o => {
                const haystack = o.searchKey ?? `${o.label} ${o.secondary ?? ''}`;
                const inEdit = editingId === o.value;
                if (inEdit) {
                  // Inline-edit row — replace the CommandItem with a
                  // plain div so keyboard nav skips it and the input
                  // owns the caret. Save + cancel buttons stop event
                  // propagation to keep cmdk from re-triggering select.
                  return (
                    <div key={o.value} className="flex items-center gap-1 px-2 py-1.5">
                      <Input
                        autoFocus
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); void saveEdit(); }
                          if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                        }}
                        className="h-7 text-sm"
                        disabled={busyOp}
                      />
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={ev => { ev.preventDefault(); ev.stopPropagation(); cancelEdit(); }}
                        disabled={busyOp}
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button" size="icon" className="h-7 w-7"
                        onClick={ev => { ev.preventDefault(); ev.stopPropagation(); void saveEdit(); }}
                        disabled={busyOp || !editLabel.trim() || editLabel.trim() === o.label}
                        title="Save"
                      >
                        {busyOp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  );
                }
                return (
                  <CommandItem
                    key={o.value}
                    value={haystack}
                    onSelect={() => { onChange(o.value); setOpen(false); }}
                    className="group"
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === o.value ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 truncate">
                      {o.label}
                      {o.secondary ? <span className="text-gray-400"> · {o.secondary}</span> : null}
                    </span>
                    {o.trailing != null && (
                      <span className="ml-2 shrink-0 text-right text-[10px]">
                        {o.trailing}
                      </span>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        onMouseDown={ev => ev.preventDefault()}
                        onClick={ev => { ev.preventDefault(); ev.stopPropagation(); startEdit(o); }}
                        className="ml-1 p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-700 hover:bg-gray-100 focus:opacity-100"
                        title="Rename"
                        aria-label={`Rename ${o.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onMouseDown={ev => ev.preventDefault()}
                        onClick={ev => {
                          ev.preventDefault(); ev.stopPropagation();
                          if (confirm(`Delete "${o.label}"?`)) void doDelete(o.value);
                        }}
                        className="ml-0.5 p-1 rounded text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-700 hover:bg-red-50 focus:opacity-100"
                        title="Delete"
                        aria-label={`Delete ${o.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
