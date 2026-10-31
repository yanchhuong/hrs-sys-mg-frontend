import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, ShieldAlert, Users } from 'lucide-react';
import { ClubProgramsDialog } from '../common/ClubPrograms';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Pagination } from '../common/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { DateInput } from '../common/DateInput';
import { ListEmpty, ListError } from '../common/ListStates';
import { TableBodySkeletonRows } from '../common/LoadingSkeletons';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import * as recordsApi from '../../api/employeeRecords';
import type { EmployeeRecord, RecordType } from '../../api/employeeRecords';
import {
  RecordFormDialog, RecordRowActions, RecordSourceMark, RecordStatusBadge, RecordTypeChip, type RecordEmployeeOption,
} from '../common/EmployeeRecords';
import { RECORD_GROUPS, RECORD_TYPES, STATUS_LABEL, summarize } from '../common/employeeRecordTypes';

const filterSelectCls =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

/**
 * Employees → Records: every employee's records in one list — accidents,
 * club memberships, promotions, welfare and ceremonies — filtered by
 * type, status and date. Type / status / dates go to the server;
 * search runs over the loaded rows (name, ID, details).
 */
export function EmployeeRecordsTab({ employees, onOpenEmployee }: {
  employees: RecordEmployeeOption[];
  /** Opens that employee's details drawer (on the Records tab's employee cell). */
  onOpenEmployee?: (employeeId: string) => void;
}) {
  const { canCreate, canView } = useAuth();
  const { formatDate } = useDateFormat();
  const [rows, setRows] = useState<EmployeeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<RecordType | ''>('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await recordsApi.list({ type, status, from: from || undefined, to: to || undefined, size: 200 });
      setRows(res.data);
      setTotal(res.totalElements);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [type, status, from, to]);

  const filtered = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter(r => {
      const hay = [r.employeeName, r.empNo, RECORD_TYPES[r.recordType]?.label, r.subtype,
        summarize(r.recordType, r.details), r.notes].filter(Boolean).join(' ').toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }, [rows, search]);

  const pagination = usePagination(filtered, 25);
  const hasFilters = !!(type || status || from || to || search);
  const clear = () => { setType(''); setStatus(''); setFrom(''); setTo(''); setSearch(''); };
  const statusOptions = type
    ? Array.from(new Set(type === 'accident' ? ['open', 'investigating', 'closed']
      : type === 'ceremony' || type === 'sick' ? ['recorded'] : ['pending', 'approved', 'rejected']))
    : ['pending', 'approved', 'rejected', 'open', 'investigating', 'closed', 'recorded'];

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="filter-strip">
          <div className="relative shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search employee, ID or details…" value={search}
              onChange={e => setSearch(e.target.value)} className="h-9 pl-7 w-64 text-sm" />
          </div>
          <select value={type} onChange={e => { setType(e.target.value as RecordType | ''); setStatus(''); }}
            className={filterSelectCls} aria-label="Filter by record type">
            <option value="">Type : All</option>
            {RECORD_GROUPS.map(g => (
              <optgroup key={g.key} label={g.label}>
                {g.types.map(t => <option key={t} value={t}>Type : {RECORD_TYPES[t].label}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={filterSelectCls}
            aria-label="Filter by status">
            <option value="">Status : All</option>
            {statusOptions.map(s => <option key={s} value={s}>Status : {STATUS_LABEL[s]}</option>)}
          </select>
          <Label className="text-xs text-gray-500 shrink-0">From</Label>
          <div className="shrink-0"><DateInput value={from || null} onChange={v => setFrom(v ?? '')} max={to || undefined} /></div>
          <Label className="text-xs text-gray-500 shrink-0">To</Label>
          <div className="shrink-0"><DateInput value={to || null} onChange={v => setTo(v ?? '')} min={from || undefined} /></div>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={clear}>Clear</Button>
          )}
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canView('employee_records') && (
            <Button variant="outline" size="sm" className="h-9 shrink-0 ml-auto" onClick={() => setProgramsOpen(true)}
              title="Clubs / programs employees can apply to join">
              <Users className="h-4 w-4 mr-1.5" /> Programs
            </Button>
          )}
          {canCreate('employee_records') && (
            <Button size="sm" className="h-9 shrink-0" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add record
            </Button>
          )}
        </div>

        <ListTable>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableBodySkeletonRows rows={5} columns={7} />
            ) : error && rows.length === 0 ? (
              <ListError colSpan={7} message={error} onRetry={() => void load()} />
            ) : pagination.paginatedItems.length === 0 ? (
              <ListEmpty colSpan={7} noun="records" filtered={hasFilters} />
            ) : pagination.paginatedItems.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{formatDate(r.recordDate)}</TableCell>
                <TableCell>
                  <button type="button" className="text-left min-w-0 hover:underline disabled:no-underline"
                    disabled={!onOpenEmployee} onClick={() => onOpenEmployee?.(r.employeeId)}>
                    <p className="text-sm font-medium truncate">{r.employeeName ?? '(deleted)'}</p>
                    {r.empNo && <p className="text-xs text-gray-400">{r.empNo}</p>}
                  </button>
                </TableCell>
                <TableCell><RecordTypeChip type={r.recordType} subtype={r.subtype} /></TableCell>
                <TableCell className="text-sm text-gray-700 whitespace-normal min-w-[200px]">
                  <span className="inline-flex items-center gap-1.5">
                    <RecordSourceMark source={r.source} />
                    {summarize(r.recordType, r.details) || <span className="text-gray-400">—</span>}
                  </span>
                  {r.restricted && <ShieldAlert className="inline h-3.5 w-3.5 ml-1 text-gray-400" aria-label="Medical details hidden" />}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.amount != null ? formatMoney(r.amount) : '—'}</TableCell>
                <TableCell>
                  <RecordStatusBadge status={r.status} />
                  {r.decidedByName && (r.status === 'approved' || r.status === 'rejected') && (
                    <p className="text-[11px] text-gray-500 mt-0.5">by {r.decidedByName}</p>
                  )}
                </TableCell>
                <TableCell>
                  <RecordRowActions rec={r} onChanged={() => void load()}
                    onEdit={rec => { setEditing(rec); setFormOpen(true); }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ListTable>
        {total > rows.length && (
          <p className="text-xs text-gray-500">Showing the latest {rows.length} of {total} — narrow by type or date to see older ones.</p>
        )}
      </CardContent>
      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPageChange={pagination.goToPage}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        totalItems={pagination.totalItems}
      />

      <RecordFormDialog open={formOpen} onOpenChange={setFormOpen} record={editing}
        employees={employees} defaultType={type || undefined} onSaved={() => void load()} />
      <ClubProgramsDialog open={programsOpen} onOpenChange={o => { setProgramsOpen(o); if (!o) void load(); }}
        employees={employees} />
    </Card>
  );
}
