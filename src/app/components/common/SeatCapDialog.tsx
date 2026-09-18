import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { AlertOctagon } from 'lucide-react';

interface Props {
  open: boolean;
  /** Human-readable reason from the API (e.g. "Employee seat cap reached
   *  for the 'starter' plan (50 / 50)…"). Rendered verbatim above the
   *  contact-admin guidance. */
  message: string | null;
  onClose: () => void;
}

/**
 * v-employee-seat-cap — shown when EmployeeService rejects a create()
 * with HTTP 402 because the tenant is at its plan's max_employees.
 * Nested inside the parent Dialog so it renders on top; closing it
 * dismisses only the popup, leaving the Add form open for the user
 * to review or cancel.
 *
 * v-dialog-close-x-only — no footer Close button. DialogContent already
 * renders the top-right X, so a lone Close duplicated it; dismissal is
 * X / Esc / overlay click, identical to every other dialog in the app.
 */
export function SeatCapDialog({ open, message, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertOctagon className="h-5 w-5" />
            Employee plan cap reached
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm text-gray-700 leading-relaxed">
            {message ?? 'Your plan\'s employee seat limit has been reached.'}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 leading-snug">
          Please contact your platform administrator to upgrade the plan.
          Once your seat count is raised, adding new employees will work
          again immediately.
        </div>
      </DialogContent>
    </Dialog>
  );
}
