import { format, parseISO } from 'date-fns';

interface Props {
  /** Display name of the actor — already resolved server-side via user→employee. */
  name?: string | null;
  /** ISO timestamp of the action. */
  at?: string | null;
}

/**
 * Compact two-line cell for an audit trail entry — the actor's display
 * name on top, the action's timestamp underneath in muted text. Used in
 * the "Author" / "Modifier" columns shared across Payroll / Increase /
 * Deduction / Leave / Employee tables.
 *
 * Renders an em-dash when both fields are missing (legacy rows that
 * predate the audit columns or rows that haven't been modified since
 * insert).
 */
export function AuditCell({ name, at }: Props) {
  if (!name && !at) return <span className="text-gray-300">—</span>;
  return (
    <div className="leading-tight">
      <p className="text-sm">{name || <span className="text-gray-400">—</span>}</p>
      {at && (
        <p className="text-[11px] text-gray-500">
          {(() => {
            try {
              return format(parseISO(at), 'MMM dd, HH:mm');
            } catch {
              return at;
            }
          })()}
        </p>
      )}
    </div>
  );
}
