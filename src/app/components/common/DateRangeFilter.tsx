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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm whitespace-nowrap">From:</Label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => handleFromChange(e.target.value)}
          max={endDate || undefined}
          className="w-40 h-9"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Label className="text-sm whitespace-nowrap">To:</Label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => handleToChange(e.target.value)}
          min={startDate || undefined}
          className="w-40 h-9"
        />
      </div>
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-xs text-gray-500"
          onClick={handleClear}
          title="Clear date range"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
