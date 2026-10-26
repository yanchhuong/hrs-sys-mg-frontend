/**
 * How an employee is paid: Bank transfer or Cash.
 *
 * Both options stay on screen in every state, including read-only.
 * The detail dialog used to collapse to a single badge once you left
 * edit mode, which showed what was chosen but not that there was a
 * choice — someone reading a record could not tell Cash was
 * available without pressing Edit to find out.
 *
 * Read-only is the default: pass `onChange` to make it editable.
 * That way a caller cannot accidentally render a live control on a
 * screen that has no way to save it.
 *
 * The same markup was copy-pasted in the Add dialog and the detail
 * dialog, so a change to one silently left the other behind. One
 * component now, as with the table shell.
 */
import { CreditCard, Banknote } from 'lucide-react';

export type PaymentMethod = 'transfer' | 'cash';

/** Transfer is the default for a record that has never said. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'transfer';

const OPTIONS: { value: PaymentMethod; label: string; Icon: typeof CreditCard }[] = [
  { value: 'transfer', label: 'Bank transfer', Icon: CreditCard },
  { value: 'cash', label: 'Cash', Icon: Banknote },
];

interface PaymentMethodToggleProps {
  value: PaymentMethod | null | undefined;
  /** Omit for a read-only control. */
  onChange?: (value: PaymentMethod) => void;
  /** Editable, but not right now — e.g. while a save is in flight. */
  disabled?: boolean;
}

export function PaymentMethodToggle({ value, onChange, disabled }: PaymentMethodToggleProps) {
  const selected = value ?? DEFAULT_PAYMENT_METHOD;
  const readOnly = !onChange || disabled;

  return (
    <div
      className="inline-flex rounded-md border p-0.5 bg-gray-50"
      role="radiogroup"
      aria-label="Payment method"
      aria-readonly={readOnly || undefined}
    >
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const on = selected === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            // Read-only keeps the unselected option visible but out of
            // the tab order — it is there to show the choice exists,
            // not to be reached and pressed to no effect.
            disabled={readOnly}
            tabIndex={readOnly && !on ? -1 : undefined}
            onClick={onChange ? () => onChange(v) : undefined}
            className={[
              'inline-flex items-center gap-1.5 px-3 h-8 rounded text-sm transition-colors',
              on
                ? 'bg-white shadow-sm text-blue-700 font-medium'
                : readOnly
                  ? 'text-gray-400'
                  : 'text-gray-600 hover:text-gray-900',
              readOnly ? 'cursor-default' : '',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** The line under the control. Cash needs no account; transfer sends
 *  the reader to the beneficiary card below. */
export function paymentMethodHint(value: PaymentMethod | null | undefined): string | null {
  return (value ?? DEFAULT_PAYMENT_METHOD) === 'cash'
    ? 'Salary is paid in cash — no bank account needed.'
    : null;
}
