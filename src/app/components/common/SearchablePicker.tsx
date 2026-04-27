import { useState, ReactNode } from 'react';
import { Button } from '../ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';

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
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const triggerLabel = selected
    ? (selected.secondary ? `${selected.label} (${selected.secondary})` : selected.label)
    : (allowClear ? emptyLabel : placeholder);

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
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyResultsLabel}</CommandEmpty>
            {options.length === 0 && emptyOptionsHint && (
              <div className="px-3 py-4 text-xs text-gray-500">{emptyOptionsHint}</div>
            )}
            <CommandGroup>
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
