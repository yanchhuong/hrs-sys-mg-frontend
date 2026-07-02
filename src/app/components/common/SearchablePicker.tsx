import { useState, ReactNode } from 'react';
import { Button } from '../ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';

export interface PickerOption {
  /** Stable identifier — what gets emitted via onChange. */
  value: string;
  /** Primary display label. */
  label: string;
  /** Optional secondary label rendered after the primary, in muted color. */
  secondary?: string;
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
  className?: string;
}

/**
 * Reusable single-select searchable picker. Visual style matches the
 * Manager / Lead picker in DepsGroup — Popover trigger with cmdk fuzzy-search
 * inside. Use for fields like Position, Department, Reports To.
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
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  // Track the CommandInput's text so we can offer "Create '{query}'"
  // when onCreate is provided. cmdk doesn't expose its internal query
  // state, so we mirror it here via onValueChange.
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const selected = options.find(o => o.value === value);
  const triggerLabel = selected
    ? (selected.secondary ? `${selected.label} (${selected.secondary})` : selected.label)
    : (allowClear ? emptyLabel : placeholder);
  // Show the create row only when:
  //  - onCreate is wired
  //  - the user has typed something
  //  - no existing option has the exact label (case-insensitive)
  // so we don't tempt the user to dupe a vendor that's already there.
  const trimmed = query.trim();
  const exactExists = !!trimmed && options.some(
    o => o.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = !!onCreate && trimmed.length > 0 && !exactExists;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
              {/* Inline-create row — appears at the top of the list
                  when onCreate is wired and the typed query has no
                  exact match among existing options. */}
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
                      // Surface the error via toast at the caller —
                      // we just keep the popover open so the user
                      // can retry without retyping.
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
                return (
                  <CommandItem
                    key={o.value}
                    value={haystack}
                    onSelect={() => { onChange(o.value); setOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === o.value ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="flex-1 truncate">
                      {o.label}
                      {o.secondary ? <span className="text-gray-400"> · {o.secondary}</span> : null}
                    </span>
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
