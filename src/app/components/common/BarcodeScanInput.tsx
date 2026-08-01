import { useEffect, useRef, useState } from 'react';
import { ScanBarcode, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../ui/input';
import * as itemsApi from '../../api/items';

/**
 * Small keyboard-scanner input for the POS + Invoice / Bill / Voucher /
 * Quotation + Stock In / Adjustment forms (V302 phase 2).
 *
 * Physical USB / Bluetooth barcode scanners act like fast keyboards
 * that tail their input with a newline. So this component is just a
 * text input that:
 *
 *   1. Debounces the value briefly (250 ms) so a rapid scanner
 *      keystroke stream lands as a single lookup, not one per digit.
 *   2. On Enter, or once the debounce settles with a non-empty value,
 *      calls {@link itemsApi.getByBarcode} and fires
 *      {@link Props.onScan} with the matched item.
 *   3. Clears the input + refocuses so the next scan flows straight
 *      in — a cashier at POS never has to click the field again.
 *
 * Callers control what happens with the matched item — add to cart,
 * append a line, etc.
 */
interface Props {
  /** Called with the matched item. */
  onScan: (item: itemsApi.Item) => void;
  /** Optional placeholder — defaults to a generic hint. */
  placeholder?: string;
  /** Optional CSS class merged onto the Input. */
  className?: string;
  /** When true, auto-focus on mount so a barcode scanner can fire
   *  immediately without a click. */
  autoFocus?: boolean;
  /** Disable the input (e.g. while the parent is saving). */
  disabled?: boolean;
}

export function BarcodeScanInput({
  onScan,
  placeholder = 'Scan barcode…',
  className,
  autoFocus,
  disabled,
}: Props): JSX.Element {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const doLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const item = await itemsApi.getByBarcode(trimmed);
      onScan(item);
      setValue('');
      // Return focus so the scanner can fire the next scan straight
      // in — critical for a cashier ringing up a queue of items.
      inputRef.current?.focus();
    } catch {
      toast.error(`No item matches barcode "${trimmed}"`);
    } finally {
      setBusy(false);
    }
  };

  // Debounce: scanner keystrokes land in a burst, so wait 250 ms of
  // idle before firing the lookup. A human typist would rarely
  // finish that fast, so they'd normally press Enter first anyway.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = window.setTimeout(() => {
      void doLookup(value);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full">
      <ScanBarcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            void doLookup(value);
          }
        }}
        placeholder={placeholder}
        disabled={disabled || busy}
        autoFocus={autoFocus}
        className={`pl-8 pr-8 tabular-nums ${className ?? ''}`}
      />
      {busy && (
        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin pointer-events-none" />
      )}
    </div>
  );
}
