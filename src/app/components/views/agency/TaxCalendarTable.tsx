import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { CheckCircle2, Clock, AlertTriangle, CircleDot, PencilLine } from 'lucide-react';
import type { CalendarEntry, CalendarStatus } from '../../../api/agencyTax';

interface Props {
  entries: CalendarEntry[];
  onMarkFiled: (entry: CalendarEntry) => void;
  /** When false, hides the "Mark filed" button — used for read-only
   *  tenant-employee views (v2). */
  canEdit?: boolean;
}

const STATUS_META: Record<CalendarStatus, { cls: string; label: string; icon: JSX.Element }> = {
  not_due:  { cls: 'bg-slate-100 text-slate-700 border-slate-200',   label: 'Not due',  icon: <CircleDot className="h-3 w-3" /> },
  due:      { cls: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Due soon', icon: <Clock className="h-3 w-3" /> },
  overdue:  { cls: 'bg-rose-100 text-rose-700 border-rose-200',      label: 'Overdue',  icon: <AlertTriangle className="h-3 w-3" /> },
  filed:    { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Filed',  icon: <CheckCircle2 className="h-3 w-3" /> },
};

/**
 * v-agency-fe-3 — flat tax-calendar table. One row per
 * (obligation, period) with derived status + inline actions.
 * Used by both the agency and tenant tax-calendar pages so the
 * two sides look identical.
 */
export function TaxCalendarTable({ entries, onMarkFiled, canEdit = true }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        No obligations in this window.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Obligation</TableHead>
          <TableHead className="w-[100px]">Period</TableHead>
          <TableHead className="w-[120px]">Due date</TableHead>
          <TableHead className="w-[110px]">Status</TableHead>
          <TableHead className="w-[110px] text-right">Days</TableHead>
          <TableHead>Reference / notes</TableHead>
          {canEdit && <TableHead className="w-[110px] text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(e => {
          const meta = STATUS_META[e.status];
          const days = e.daysUntilDue;
          const dayLabel = e.status === 'filed'
            ? '—'
            : days == null
              ? '—'
              : days === 0
                ? 'today'
                : days < 0
                  ? `${-days}d late`
                  : `${days}d`;
          return (
            <TableRow key={`${e.obligationCode}|${e.period}`}>
              <TableCell>
                <div className="font-medium text-sm">{e.obligationName}</div>
                {e.statuteRef && (
                  <div className="text-[10px] text-gray-500">{e.statuteRef}</div>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">{e.period}</TableCell>
              <TableCell className="text-sm">{e.dueDate}</TableCell>
              <TableCell>
                <Badge className={`inline-flex items-center gap-1 border ${meta.cls} text-[10px] px-1.5 py-0`}>
                  {meta.icon}
                  {meta.label}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-gray-600">
                {dayLabel}
              </TableCell>
              <TableCell className="text-xs text-gray-600">
                {e.status === 'filed' ? (
                  <>
                    <div>{e.referenceNo ?? <span className="text-gray-400 italic">no ref</span>}</div>
                    {e.filedAt && (
                      <div className="text-[10px] text-gray-500">
                        {new Date(e.filedAt).toLocaleString()}
                        {e.filedBySide && ` · by ${e.filedBySide}`}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 italic">not filed yet</span>
                )}
              </TableCell>
              {canEdit && (
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onMarkFiled(e)}>
                    <PencilLine className="h-3.5 w-3.5 mr-1" />
                    {e.status === 'filed' ? 'Edit' : 'Mark filed'}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
