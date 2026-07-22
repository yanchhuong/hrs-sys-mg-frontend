import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { MapPin, Fingerprint, UserCog } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Offices } from '../views/Offices';
import { DevicesCard } from './DevicesCard';
import { OfficeAssignmentsPanel } from './OfficeAssignmentsPanel';

type Section = 'offices' | 'devices' | 'assignments';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Office + on-prem device admin + per-employee office assignment,
 * behind one popup. Offices and Devices touch the on-site attendance
 * hardware path (geofence + terminal config); Assignments (V152)
 * decides who can scan where — they belong in the same gear surface
 * so the admin doesn't bounce around.
 *
 * <p>Layout mirrors {@link AccountingSettingsDialog}: a 200px aside
 * with section buttons + a scrollable right pane. No global Save —
 * the wrapped components own their own per-row save dialogs.</p>
 */
export function OfficesDialog({ open, onOpenChange }: Props) {
  const [section, setSection] = useState<Section>('offices');

  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'offices',     label: 'Branches/Offices', hint: 'Locations + QR geofence', icon: <MapPin className="h-4 w-4" /> },
    { key: 'devices',     label: 'Devices',     hint: 'Fingerprint / face terminals', icon: <Fingerprint className="h-4 w-4" /> },
    { key: 'assignments', label: 'Assignments', hint: 'Pin employees to offices',     icon: <UserCog className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Manage Office</DialogTitle>
          <DialogDescription className="sr-only">
            Locations, geofences, on-prem attendance terminals, and per-employee
            office assignments.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
          <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
            {/* v-settings-menu-tooltip — hint on hover, labels stay single-line. */}
            <TooltipProvider delayDuration={200}>
              {menu.map(m => {
                const active = section === m.key;
                return (
                  <Tooltip key={m.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSection(m.key)}
                        className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 transition-colors flex items-center gap-2 ${
                          active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-700 hover:bg-white'
                        }`}
                      >
                        <span className={active ? 'text-blue-600' : 'text-gray-500'}>{m.icon}</span>
                        <span className="flex-1 min-w-0 text-sm font-medium truncate">{m.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      {m.hint}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </aside>

          <div className="overflow-y-auto p-6">
            {section === 'offices'     && <Offices embedded />}
            {section === 'devices'     && <DevicesCard />}
            {section === 'assignments' && <OfficeAssignmentsPanel open={open && section === 'assignments'} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
