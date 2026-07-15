import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { DateInput } from './DateInput';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { CalendarRange, ChevronDown } from 'lucide-react';

interface DateRangeFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
  /** v-date-range-filter-presets — when true, prepend a "Quick
   *  range" dropdown with the standard finance-workflow presets
   *  (today, this week, month, quarter, year, previous variants).
   *  Off by default so existing filter strips stay verbatim per
   *  [[feedback-filter-strip-consistency]]. */
  enablePresets?: boolean;
}

/**
 * Inline From / To date pair. Emits on every change (no Apply button) —
 * the caller receives `null` for empty bounds. A small Clear button is shown
 * when at least one side is filled.
 *
 * <p>Internals switched from native {@code <input type="date">} to the
 * app-owned {@link DateInput} so the visible text follows the tenant's
 * Date format setting instead of the browser/OS locale. ISO
 * {@code YYYY-MM-DD} still speaks over the wire.</p>
 */
export function DateRangeFilter({
  onFilterChange,
  defaultStartDate = '',
  defaultEndDate = '',
  enablePresets = false,
}: DateRangeFilterProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const emit = (from: string, to: string) =>
    onFilterChange(from || null, to || null);

  const handleFromChange = (v: string | null) => {
    const next = v ?? '';
    setStartDate(next);
    emit(next, endDate);
  };

  const handleToChange = (v: string | null) => {
    const next = v ?? '';
    setEndDate(next);
    emit(startDate, next);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    emit('', '');
  };

  const applyPreset = (from: string, to: string) => {
    setStartDate(from);
    setEndDate(to);
    emit(from, to);
  };

  const hasFilter = !!(startDate || endDate);
  const presets = useMemo(() => buildPresets(), []);
  const activeLabel = enablePresets
    ? matchPresetLabel(presets, startDate, endDate)
    : null;

  // v-filter-strip-consistency — matches Transactions verbatim:
  // xs gray labels (no colon), w-36 date buttons, no-wrap row,
  // ghost Clear button. Prevents the "From: on line 1, To: on
  // line 2" stacking when the header has a co-tenant like Add.
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {enablePresets && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-normal gap-1.5"
              title="Quick date ranges"
            >
              <CalendarRange className="h-3.5 w-3.5 text-gray-500" />
              <span>{activeLabel ?? 'Quick range'}</span>
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-500">
              Quick ranges
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {presets.map(p => (
              <DropdownMenuItem
                key={p.key}
                onClick={() => {
                  const r = p.range();
                  applyPreset(r.from, r.to);
                }}
                className="text-xs"
              >
                {p.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleClear}
              className="text-xs text-gray-600"
            >
              Clear (all time)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Label className="text-xs text-gray-500">From</Label>
      <DateInput
        value={startDate || null}
        onChange={handleFromChange}
        max={endDate || undefined}
      />
      <Label className="text-xs text-gray-500">To</Label>
      <DateInput
        value={endDate || null}
        onChange={handleToChange}
        min={startDate || undefined}
      />
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={handleClear}
          title="Clear date range"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

/* -------------------- preset helpers -------------------- */

interface Preset {
  key: string;
  label: string;
  range: () => { from: string; to: string };
}

/** Serialise a local Date to ISO YYYY-MM-DD without TZ shift —
 *  mirrors DateInput's toIsoLocal so we stay symmetric. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Start-of-week aligned to Monday (ISO week). Cambodia + most
 *  accounting workflows read weeks Monday-first. */
function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();      // 0=Sun, 1=Mon, …
  const diff = (day === 0 ? -6 : 1 - day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function buildPresets(): Preset[] {
  return [
    {
      key: 'today',
      label: 'Today',
      range: () => {
        const t = new Date();
        return { from: iso(t), to: iso(t) };
      },
    },
    {
      key: 'yesterday',
      label: 'Yesterday',
      range: () => {
        const y = addDays(new Date(), -1);
        return { from: iso(y), to: iso(y) };
      },
    },
    {
      key: 'this-week',
      label: 'This week',
      range: () => {
        const s = startOfWeekMonday(new Date());
        return { from: iso(s), to: iso(new Date()) };
      },
    },
    {
      key: 'last-week',
      label: 'Last week',
      range: () => {
        const thisWeekStart = startOfWeekMonday(new Date());
        const lastStart = addDays(thisWeekStart, -7);
        const lastEnd = addDays(thisWeekStart, -1);
        return { from: iso(lastStart), to: iso(lastEnd) };
      },
    },
    {
      key: 'this-month',
      label: 'This month',
      range: () => {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: iso(first), to: iso(now) };
      },
    },
    {
      key: 'last-month',
      label: 'Last month',
      range: () => {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last  = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: iso(first), to: iso(last) };
      },
    },
    {
      key: 'last-30',
      label: 'Last 30 days',
      range: () => ({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) }),
    },
    {
      key: 'this-quarter',
      label: 'This quarter',
      range: () => {
        const now = new Date();
        const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
        const first = new Date(now.getFullYear(), qStartMonth, 1);
        return { from: iso(first), to: iso(now) };
      },
    },
    {
      key: 'this-year',
      label: 'This year',
      range: () => {
        const now = new Date();
        const first = new Date(now.getFullYear(), 0, 1);
        return { from: iso(first), to: iso(now) };
      },
    },
    {
      key: 'last-year',
      label: 'Last year',
      range: () => {
        const now = new Date();
        const first = new Date(now.getFullYear() - 1, 0, 1);
        const last  = new Date(now.getFullYear() - 1, 11, 31);
        return { from: iso(first), to: iso(last) };
      },
    },
  ];
}

function matchPresetLabel(presets: Preset[], from: string, to: string): string | null {
  if (!from && !to) return null;
  for (const p of presets) {
    const r = p.range();
    if (r.from === from && r.to === to) return p.label;
  }
  return 'Custom';
}

/** Inclusive check — the row's date sits within the range. Nulls
 *  on either end are treated as open-ended. Both sides accept ISO
 *  {@code YYYY-MM-DD} strings; timestamps longer than 10 chars
 *  are truncated to the date part first. */
export function inRange(rowDate: string | null | undefined, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!rowDate) return false;
  const d = rowDate.length >= 10 ? rowDate.substring(0, 10) : rowDate;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}
