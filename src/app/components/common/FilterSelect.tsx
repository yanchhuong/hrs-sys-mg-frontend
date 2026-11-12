/**
 * FilterSelect — options-array flavour of DropdownSelect for filter
 * strips (v-filter-select-popover). Same rounded grey popover list; the
 * trigger keeps the strip's h-9 auto-width look and never shrinks.
 */
import { DropdownSelect } from './DropdownSelect';
import { cn } from '../ui/utils';

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  'aria-label': string;
  className?: string;
}

export function FilterSelect({ value, onChange, options, className, ...rest }: Props) {
  return (
    <DropdownSelect
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={rest['aria-label']}
      className={cn('h-9 shrink-0 shadow-xs', className)}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </DropdownSelect>
  );
}
