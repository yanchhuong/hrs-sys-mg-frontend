import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Employee } from '../../types/hrms';

interface EmployeeCellProps {
  employee: Pick<Employee, 'id' | 'name' | 'department' | 'profileImage'> | undefined | null;
  /** optional subtitle override; defaults to employee.id (empNo / 4-digit code) */
  subtitle?: string | null;
  size?: 'sm' | 'md';
  /** when true, hide subtitle line entirely */
  nameOnly?: boolean;
  /** V168 — when true, the avatar shows a green ring + a "Payable"
   *  tooltip on hover. Reflects that the employee has an active
   *  PayWay beneficiary registration, so payroll can disburse to
   *  them directly. */
  payable?: boolean;
}

/**
 * Compact "face" cell used inside tables: square-with-radius avatar plus
 * name and optional subtitle.
 *
 * Default subtitle is {@code employee.id} (the human-readable empNo, e.g.
 * "1003"). Earlier versions defaulted to {@code employee.department}, but
 * in live mode that field carries the department UUID — which leaked into
 * Increase / Deduction / Contracts / Overtime tables as raw 36-char UUIDs.
 * Falls back to a blank placeholder when employee is missing.
 */
export function EmployeeCell({ employee, subtitle, size = 'sm', nameOnly, payable }: EmployeeCellProps) {
  if (!employee) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const sub = subtitle === undefined ? employee.id : subtitle;
  // Green ring when the employee is payroll-payable via PayWay.
  // Uses ring-2 + ring-offset so the green sits crisp on the
  // surrounding row background; falls back to the original grey
  // hairline border on non-payable rows.
  const frame = payable
    ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-white border-0'
    : 'border border-gray-200';
  return (
    <div className="flex items-center gap-2.5">
      <Avatar
        className={`${dim} rounded-md ${frame} shrink-0`}
        title={payable ? 'Payable — PayWay beneficiary is active' : undefined}
      >
        <AvatarImage src={employee.profileImage} className="rounded-md object-cover" />
        <AvatarFallback className="rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
          {(employee.name || '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{employee.name}</p>
        {!nameOnly && sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}
