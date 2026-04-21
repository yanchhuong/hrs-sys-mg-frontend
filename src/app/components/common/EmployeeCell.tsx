import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Employee } from '../../types/hrms';

interface EmployeeCellProps {
  employee: Pick<Employee, 'id' | 'name' | 'department' | 'profileImage'> | undefined | null;
  /** optional subtitle override; defaults to employee.department */
  subtitle?: string | null;
  size?: 'sm' | 'md';
  /** when true, hide subtitle line entirely */
  nameOnly?: boolean;
}

/**
 * Compact "face" cell used inside tables: square-with-radius avatar plus
 * name and optional subtitle (default: department). Falls back to a blank
 * placeholder when employee is missing.
 */
export function EmployeeCell({ employee, subtitle, size = 'sm', nameOnly }: EmployeeCellProps) {
  if (!employee) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const sub = subtitle === undefined ? employee.department : subtitle;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className={`${dim} rounded-md border border-gray-200 shrink-0`}>
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
