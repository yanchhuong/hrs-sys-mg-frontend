import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface DateRangeFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

/**
 * Inline From / To date pair. Emits on every change (no Apply button) —
 * the caller receives `null` for empty bounds. A small Clear button is shown
 * when at least one side is filled.
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

  const handleFromChange = (v: string) => {
    setStartDate(v);
    emit(v, endDate);
  };

  const handleToChange = (v: string) => {
    setEndDate(v);
    emit(startDate, v);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    emit('', '');
  };

  const hasFilter = !!(startDate || endDate);

  // v-filter-strip-consistency — matches Transactions verbatim:
  // xs gray labels (no colon), w-36 date inputs, no-wrap row,
  // ghost Clear button. Prevents the "From: on line 1, To: on
  // line 2" stacking when the header has a co-tenant like Add.
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Label className="text-xs text-gray-500">From</Label>
      <Input
        type="date"
        value={startDate}
        onChange={(e) => handleFromChange(e.target.value)}
        max={endDate || undefined}
        className="h-9 w-36 text-sm"
      />
      <Label className="text-xs text-gray-500">To</Label>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => handleToChange(e.target.value)}
        min={startDate || undefined}
        className="h-9 w-36 text-sm"
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
