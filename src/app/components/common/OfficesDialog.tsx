import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Offices } from '../views/Offices';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Modal wrapper around the standalone {@link Offices} CRUD view. Used
 * by the Attendance page's gear-icon → "Manage Offices" entry so the
 * admin can edit geofences without leaving the daily attendance
 * worksurface.
 *
 * <p>The wrapped component runs in {@code embedded} mode, which hides
 * its page-level h1 (this dialog header carries the title instead).
 * The Add/Edit inner modal that Offices owns stays as a stacked
 * Dialog on top of this one — Radix supports the nesting natively
 * and the inner modal still takes focus correctly.</p>
 */
export function OfficesDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Offices</DialogTitle>
          <DialogDescription>
            Set each office's location + geofence radius. The QR scan only
            succeeds within these bounds.
          </DialogDescription>
        </DialogHeader>
        <Offices embedded />
      </DialogContent>
    </Dialog>
  );
}
