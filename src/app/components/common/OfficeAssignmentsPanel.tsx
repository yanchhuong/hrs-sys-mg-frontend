import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Info, Search, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as officesApi from '../../api/offices';
import * as employeesApi from '../../api/employees';
import * as assignmentsApi from '../../api/officeAssignments';

interface Props {
  /** Loads the snapshot when the parent section becomes visible. */
  open: boolean;
}

/** Sentinel used in the per-row + filter dropdowns to represent
 *  "no office pinned" (flexible). Using a non-UUID literal keeps it
 *  distinguishable from any real office id. */
const FLEXIBLE = '__flexible__';

/**
 * Manage Office → Assignments (V152). Single-table view — one row
 * per active employee with a per-row dropdown that pins them to one
 * office (or sets them flexible). Auto-saves on change so the
 * operator doesn't hunt for a Save button.
 *
 * <p><strong>Rule:</strong> employees with a pinned office can only
 * check in at that office. Employees set to <em>Flexible</em> stay
 * unrestricted — any geofence-valid office works. The list is
 * filterable by office so the operator can audit "who's pinned to
 * Phnom Penh branch" in one glance.</p>
 */
export function OfficeAssignmentsPanel({ open }: Props) {
  const [offices, setOffices] = useState<officesApi.Office[]>([]);
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [snapshot, setSnapshot] = useState<assignmentsApi.AssignmentSnapshot>({});
  const [loading, setLoading] = useState(false);
  /** Row currently saving — disables the dropdown + shows a spinner. */
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  /** Filter by office: '' = All, FLEXIBLE = unassigned, else officeId. */
  const [officeFilter, setOfficeFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const [ofRes, emRes, snapRes] = await Promise.all([
        officesApi.list(),
        employeesApi.list({ size: 500 }),
        assignmentsApi.snapshot(),
      ]);
      setOffices(ofRes);
      setEmployees(emRes.content ?? []);
      setSnapshot(snapRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** employeeId → primary office id (or null = flexible). The single-
   *  select model maps cleanly to the underlying many-to-many table;
   *  if a row carries multiple legacy assignments the first one wins
   *  on display and any save replaces the whole set. */
  const primaryOfficeByEmp = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const [officeId, assignees] of Object.entries(snapshot)) {
      for (const a of assignees) {
        // Don't overwrite an existing pick — first-seen wins. The
        // entries() order is insertion order from the BE, which is
        // stable, so the displayed value is deterministic.
        if (!m.has(a.employeeId)) m.set(a.employeeId, officeId);
      }
    }
    return m;
  }, [snapshot]);

  /** Active employees, filtered by the search box AND by the office
   *  filter (when set). */
  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees
      .filter(e => e.status === 'active')
      .filter(e => !term
        || e.name?.toLowerCase().includes(term)
        || e.empNo?.toLowerCase().includes(term))
      .filter(e => {
        if (!officeFilter) return true;
        const assigned = primaryOfficeByEmp.get(e.id) ?? null;
        if (officeFilter === FLEXIBLE) return assigned == null;
        return assigned === officeFilter;
      });
  }, [employees, search, officeFilter, primaryOfficeByEmp]);

  const handleChange = async (employeeId: string, value: string) => {
    setSavingEmpId(employeeId);
    try {
      // FLEXIBLE → empty allow-list (unpins the employee). Any real
      // office id → single-office allow-list (replaces whatever was
      // there). Backend diff handles add/delete in one transaction.
      const officeIds = value === FLEXIBLE ? [] : [value];
      const updated = await assignmentsApi.setOfficesForEmployee(employeeId, officeIds);
      setSnapshot(updated);
      toast.success(value === FLEXIBLE ? 'Set to flexible' : 'Office assigned');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingEmpId(null);
    }
  };

  if (loading && offices.length === 0 && employees.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…
      </div>
    );
  }

  if (offices.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400 border rounded-md">
        No offices yet. Add one on the <strong>Offices</strong> tab first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: title + (i) tooltip + refresh */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          Office Assignments
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={-1} className="text-gray-400 hover:text-gray-600 cursor-help">
                  <Info className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Pin each employee to one office. Pinned employees can only scan
                check-in / check-out at that office. Employees set to{' '}
                <strong>Flexible</strong> can scan at any office. Empty assignment
                means the office is unrestricted — anyone within the geofence can
                scan in.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filter bar: office filter + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-gray-500" />
          <Label className="text-xs text-gray-600 sr-only">Filter by office</Label>
          <select
            value={officeFilter}
            onChange={e => setOfficeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by office"
          >
            <option value="">All offices</option>
            <option value={FLEXIBLE}>— Flexible (unassigned)</option>
            {offices.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or employee no…"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Single table — Employees with per-row Assign dropdown */}
      <div className="border rounded-md">
        {visibleEmployees.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8">
            {search || officeFilter ? 'No employees match the current filters.' : 'No active employees yet.'}
          </div>
        ) : (
          <div className="max-h-[20rem] overflow-y-auto">
            <Table>
              {/* Caps visible rows at ~5 with internal scroll. Sticky
                  header keeps column labels in view while scrolling. */}
              <TableHeader className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgb(0_0_0_/_0.05)]">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="w-[110px]">Employee No</TableHead>
                  <TableHead className="w-[280px]">Assign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEmployees.map(e => {
                  const assigned = primaryOfficeByEmp.get(e.id) ?? null;
                  const isSaving = savingEmpId === e.id;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="py-1.5">
                        <div className="text-sm font-medium">{e.name}</div>
                        {e.position && (
                          <div className="text-[11px] text-gray-500 truncate">{e.position}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-gray-600 tabular-nums">
                        {e.empNo || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={assigned ?? FLEXIBLE}
                            onChange={ev => handleChange(e.id, ev.target.value)}
                            disabled={isSaving}
                            className="h-8 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                            aria-label={`Assign office for ${e.name}`}
                          >
                            <option value={FLEXIBLE}>— Flexible (any office)</option>
                            {offices.map(o => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />
                          ) : assigned == null ? (
                            <Badge variant="outline" className="text-gray-500 shrink-0">
                              Flexible
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200 shrink-0">
                              Pinned
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Changes save automatically.
      </p>
    </div>
  );
}
