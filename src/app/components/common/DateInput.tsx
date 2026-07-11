import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { useDateFormat } from '../../context/DateFormatContext';
import { CalendarIcon, X } from 'lucide-react';

interface Props {
  /** ISO YYYY-MM-DD (or empty/null for "no date"). Kept as a string to
   *  match the shape every existing filter caller uses — the API and
   *  URL query params both speak ISO already. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Override the empty-state placeholder. When omitted, the trigger
   *  shows a lowercase skeleton of the tenant date pattern (e.g.
   *  "dd-mm-yyyy" / "mmm dd, yyyy") — mirrors the native
   *  {@code <input type="date">} convention so operators know the
   *  expected shape at a glance. */
  placeholder?: string;
  /** ISO min / max bounds. When set, the Calendar disables out-of-range
   *  days and the pair rejects them silently. */
  min?: string | null;
  max?: string | null;
  className?: string;
  disabled?: boolean;
  /** Show the clear (×) button when a value is set. Off by default so
   *  a required date input can hide it. */
  clearable?: boolean;
}

/** Turn a date-fns pattern into a placeholder skeleton by lowercasing
 *  every token letter. `MM` → `mm`, `MMM` → `mmm`, `yyyy` stays, and
 *  the separators (dashes, slashes, spaces, commas) pass through. */
function patternToPlaceholder(pattern: string): string {
  return pattern.toLowerCase();
}

/** Parse an ISO YYYY-MM-DD as LOCAL midnight so the Calendar doesn't
 *  shift the value by one day on the west side of UTC. `new Date(iso)`
 *  would parse a date-only string as UTC midnight and render as the
 *  previous day in negative-offset timezones. */
function parseIsoLocal(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Serialise a JS Date to ISO YYYY-MM-DD in the local zone (no time,
 *  no TZ shift). react-day-picker hands the calendar's picked date as
 *  a local-zone Date; we reverse the format inside the same zone. */
function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * App-owned date input — reads the tenant format from
 * {@link useDateFormat} so the visible text matches the setting on
 * every OS/browser (native {@code <input type="date">} always renders
 * in the browser locale, which is why we replace it here for filter
 * strips + settings-sensitive pickers).
 *
 * <p>Emits ISO YYYY-MM-DD strings so existing callers keep working
 * without shape churn. The internal Calendar comes from
 * {@code react-day-picker} via the shadcn Calendar primitive.</p>
 */
export function DateInput({
  value, onChange, placeholder,
  min, max, className, disabled, clearable = true,
}: Props) {
  const { formatDate, pattern } = useDateFormat();
  const [open, setOpen] = useState(false);
  // Default empty-state hint = lowercase tenant pattern so operators
  // read the expected shape without needing a separate label. Callers
  // can still override via the `placeholder` prop when a specific
  // string ("From", "Start", …) reads better in context.
  const effectivePlaceholder = placeholder ?? patternToPlaceholder(pattern);

  const selected = parseIsoLocal(value);
  const fromBound = parseIsoLocal(min);
  const toBound = parseIsoLocal(max);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={`h-9 w-36 justify-between font-normal text-sm ${!value ? 'text-gray-400' : ''} ${className ?? ''}`}
        >
          <span className="tabular-nums truncate">
            {value ? formatDate(value) : effectivePlaceholder}
          </span>
          {clearable && value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              className="ml-2 text-gray-400 hover:text-gray-600"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <CalendarIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? toIsoLocal(d) : null);
            setOpen(false);
          }}
          disabled={
            fromBound || toBound
              ? (day: Date) =>
                  (fromBound ? day < fromBound : false)
                  || (toBound ? day > toBound : false)
              : undefined
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
