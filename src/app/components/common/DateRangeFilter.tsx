import { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { DateInput } from './DateInput';

interface DateRangeFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
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

  const hasFilter = !!(startDate || endDate);

  // v-filter-strip-consistency — matches Transactions verbatim:
  // xs gray labels (no colon), w-36 date buttons, no-wrap row,
  // ghost Clear button. Prevents the "From: on line 1, To: on
  // line 2" stacking when the header has a co-tenant like Add.
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
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
