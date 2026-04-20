import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

interface DateRangeFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

export function DateRangeFilter({ onFilterChange, defaultStartDate, defaultEndDate }: DateRangeFilterProps) {
  const [startDate, setStartDate] = useState(defaultStartDate || '');
  const [endDate, setEndDate] = useState(defaultEndDate || '');
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFilterChange(startDate || null, endDate || null);
    setIsOpen(false);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    onFilterChange(null, null);
  };

  const hasFilter = startDate || endDate;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-auto">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {hasFilter
            ? `${startDate ? format(new Date(startDate), 'MMM dd, yyyy') : 'Start'} - ${
                endDate ? format(new Date(endDate), 'MMM dd, yyyy') : 'End'
              }`
            : 'Filter by date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleApply} className="flex-1">
              Apply
            </Button>
            {hasFilter && (
              <Button variant="outline" size="icon" onClick={handleClear}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
