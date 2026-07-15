import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import {
  Building2, FileText, Receipt, Wallet, Users2, FileSpreadsheet,
  Loader2, Save, ShieldOff,
} from 'lucide-react';
import {
  tenantAgencyPermissions,
  type AgencyPermissionRow, type DataType,
} from '../../api/tenantAgencyPermissions';

/* ================================================================
 * v-tenant-agency-data-access — modal variant of the Agency access
 * config. Mounted from the Tax Declarations page's settings gear.
 *
 * Toggles per active engagement:
 *   • Invoice / Bill / Expense / Payroll on/off (data-type gate)
 *   • Optional per-type status allow-list (empty = all statuses)
 * ================================================================ */

const DATA_TYPE_META: Array<{
  key: DataType; label: string; hint: string; icon: React.ReactNode;
}> = [
  { key: 'invoice', label: 'Invoices', hint: 'Sales invoices your Company issues.',  icon: <FileText className="h-4 w-4 text-blue-600" /> },
  { key: 'bill',    label: 'Bills',    hint: 'Purchase bills from your vendors.',    icon: <Receipt className="h-4 w-4 text-orange-600" /> },
  { key: 'expense', label: 'Expenses', hint: 'Cash / bank expenses & receipts.',    icon: <Wallet className="h-4 w-4 text-emerald-600" /> },
  { key: 'payroll', label: 'Payroll',  hint: 'Payroll batches, TOS + NSSF filings.', icon: <Users2 className="h-4 w-4 text-violet-600" /> },
];

export function AgencyAccessDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<AgencyPermissionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await tenantAgencyPermissions.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Tax Declarations — Agency access
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto -mx-6 px-6">
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-sm text-gray-500 inline-flex items-start gap-3">
              <ShieldOff className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                No active agency engagement yet. Once an agency is
                accepted, come back here to control what they can see.
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {rows.map(r => (
                <AgencyAccessCard
                  key={r.assignmentId}
                  row={r}
                  onSaved={() => void load()}
                />
              ))}
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}

function AgencyAccessCard({
  row, onSaved,
}: {
  row: AgencyPermissionRow;
  onSaved: () => void;
}) {
  const [allowed, setAllowed] = useState<Set<DataType>>(new Set(row.allowedDataTypes));
  const [statuses, setStatuses] = useState<Record<DataType, string[]>>({
    invoice: row.allowedInvoiceStatuses,
    bill:    row.allowedBillStatuses,
    expense: row.allowedExpenseStatuses,
    payroll: row.allowedPayrollStatuses,
  });
  const [saving, setSaving] = useState(false);

  const knownByType: Record<DataType, string[]> = {
    invoice: row.knownInvoiceStatuses,
    bill:    row.knownBillStatuses,
    expense: row.knownExpenseStatuses,
    payroll: row.knownPayrollStatuses,
  };

  const toggleType = (t: DataType, on: boolean) => {
    setAllowed(prev => {
      const next = new Set(prev);
      if (on) next.add(t); else next.delete(t);
      return next;
    });
  };
  const toggleStatus = (t: DataType, s: string) => {
    setStatuses(prev => {
      const cur = prev[t] ?? [];
      const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
      return { ...prev, [t]: next };
    });
  };
  const clearStatuses = (t: DataType) => {
    setStatuses(prev => ({ ...prev, [t]: [] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await tenantAgencyPermissions.update(row.assignmentId, {
        allowedDataTypes: Array.from(allowed),
        allowedInvoiceStatuses: statuses.invoice,
        allowedBillStatuses:    statuses.bill,
        allowedExpenseStatuses: statuses.expense,
        allowedPayrollStatuses: statuses.payroll,
      });
      toast.success('Access permissions saved.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Building2 className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">
              {row.agencyName ?? row.agencySlug ?? row.agencyId}
            </CardTitle>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Engagement: {row.status === 'active' ? 'Active' : 'Disconnect pending'}
            </div>
          </div>
          <Button size="sm" onClick={save} disabled={saving} className="shrink-0">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DATA_TYPE_META.map(dt => {
            const on = allowed.has(dt.key);
            const known = knownByType[dt.key];
            const picked = statuses[dt.key] ?? [];
            return (
              <div
                key={dt.key}
                className={`border rounded-md p-3 ${on ? 'bg-white' : 'bg-gray-50 opacity-90'}`}
              >
                <div className="flex items-start gap-3">
                  {dt.icon}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{dt.label}</div>
                    <div className="text-[11px] text-gray-500">{dt.hint}</div>
                  </div>
                  <Switch
                    checked={on}
                    onCheckedChange={v => toggleType(dt.key, v)}
                    aria-label={`Allow agency to see ${dt.label}`}
                  />
                </div>

                {on && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] font-medium text-gray-700">
                        Status allow-list
                      </div>
                      {picked.length > 0 ? (
                        <button
                          type="button" onClick={() => clearStatuses(dt.key)}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          Clear (allow all)
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-700">All statuses</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {known.map(s => {
                        const ticked = picked.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleStatus(dt.key, s)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border capitalize transition ${
                              ticked
                                ? 'bg-blue-50 border-blue-200 text-blue-800'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      Leave every chip un-ticked to expose all statuses.
                      Ticking one or more restricts the agency to just those.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
