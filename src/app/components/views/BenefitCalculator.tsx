import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Scale, Receipt, ShieldCheck, CalendarDays, ArrowRight } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useI18n } from '../../i18n/I18nContext';
import { mockEmployees } from '../../data/mockData';
import { USE_MOCKS } from '../../api/client';
import { Employee } from '../../types/hrms';
import * as employeesApi from '../../api/employees';
import * as contractsApi from '../../api/contracts';
import * as settingsApi from '../../api/settings';

import { SeniorityIndemnityDialog } from './SeniorityIndemnityDialog';
import { FdcSeveranceDialog } from './FdcSeveranceDialog';
import { TaxCalculatorDialog } from './TaxCalculatorDialog';
import { NssfCalculatorDialog } from './NssfCalculatorDialog';
import { AlRemainDialog } from './AlRemainDialog';

/** Adapter mirrors the one in Payroll.tsx — the calculator dialogs
 *  expect the front-end Employee shape, not the raw API row. */
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.empNo,
    apiId: e.id,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
    managerId: e.managerId ?? undefined,
    profileImage: e.profileImage ?? undefined,
    gender: (e.gender === 'male' || e.gender === 'female') ? e.gender : undefined,
    maritalStatus: (e.maritalStatus as Employee['maritalStatus']) ?? undefined,
    numberOfChildren: e.numberOfChildren ?? 0,
    dateOfBirth: e.dateOfBirth ?? undefined,
    placeOfBirth: e.placeOfBirth ?? undefined,
    currentAddress: e.currentAddress ?? undefined,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
    resignDate: e.resignDate ?? undefined,
    attendanceYn: e.attendanceYn ?? true,
    decouple: e.decouple ?? false,
    claimSpouse: e.claimSpouse ?? false,
    positionAllowance: e.positionAllowance ?? 0,
    evaluationAllowance: e.evaluationAllowance ?? 0,
  };
}

/**
 * Benefit Calculator landing page — the three "Compute X" dialogs that
 * used to live in the Payroll page's header chrome now have a dedicated
 * sub-menu so the Payroll list stays clean. Each card opens the same
 * dialog as before and routes its generated batch through the standard
 * approval flow.
 */
export function BenefitCalculator() {
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [taxSettings, setTaxSettings] = useState<settingsApi.PayrollTaxSettings | null>(null);
  /** API employee ids that have an *active FDC contract*. Drives the
   *  picker in the 5% Severance dialog — Cambodian Labour Law restricts
   *  that line to FDC employees only. */
  const [fdcEmployeeIds, setFdcEmployeeIds] = useState<Set<string>>(new Set());

  const [seniorityOpen, setSeniorityOpen] = useState(false);
  const [fdcOpen, setFdcOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [nssfOpen, setNssfOpen] = useState(false);
  const [alRemainOpen, setAlRemainOpen] = useState(false);

  /** Pulls everything the three dialogs need so we don't surprise HR
   *  with a half-loaded TaxCalculator (which depends on khrPerUsd +
   *  brackets being present). Failures degrade to defaults inside each
   *  dialog rather than blocking the page. */
  const loadEmployees = async () => {
    if (USE_MOCKS) return;
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  /** Pull every active contract once and keep just the employee ids whose
   *  active contract is FDC. The 5% Severance dialog filters its picker
   *  through this set so HR can't accidentally pay a UDC employee on the
   *  FDC channel. Failures are logged-only — the dialog falls back to
   *  showing zero candidates rather than the entire employee list. */
  const loadFdcEmployees = async () => {
    if (USE_MOCKS) return;
    try {
      const res = await contractsApi.list({ status: 'active', size: 1000 });
      const ids = new Set<string>();
      for (const c of res.data) {
        if (c.contractType?.toLowerCase() === 'fdc' && c.employeeId) ids.add(c.employeeId);
      }
      setFdcEmployeeIds(ids);
    } catch (err) {
      console.warn('BenefitCalculator: could not load contracts for FDC filter', err);
    }
  };

  useEffect(() => {
    void loadEmployees();
    void loadFdcEmployees();
    if (USE_MOCKS) {
      // Mirror the NBC defaults so the TaxCalculator preview still works.
      setTaxSettings({
        khrPerUsd: 4100,
        brackets: [
          { fromAmount: 0,        toAmount: 1500000,  ratePercent: 0,  excessAmount: 0,       sortOrder: 1 },
          { fromAmount: 1500001,  toAmount: 2000000,  ratePercent: 5,  excessAmount: 75000,   sortOrder: 2 },
          { fromAmount: 2000001,  toAmount: 8500000,  ratePercent: 10, excessAmount: 175000,  sortOrder: 3 },
          { fromAmount: 8500001,  toAmount: 12500000, ratePercent: 15, excessAmount: 600000,  sortOrder: 4 },
          { fromAmount: 12500001, toAmount: null,     ratePercent: 20, excessAmount: 1225000, sortOrder: 5 },
        ],
      });
      return;
    }
    (async () => {
      try {
        const s = await settingsApi.getPayrollTaxSettings();
        setTaxSettings(s);
      } catch (err) {
        console.warn('BenefitCalculator: could not load tax settings — using NBC defaults', err);
      }
    })();
  }, []);

  const cards: Array<{
    id: 'seniority' | 'fdc' | 'tax' | 'nssf' | 'al_remain';
    title: string;
    description: string;
    /** What side of the payslip this calculator produces — drives the
     *  small badge in the card header so HR can see at a glance whether
     *  a card adds money to the payslip or takes it off. Matches the
     *  {@code kind} column on payroll_categories. */
    kind: 'earning' | 'deduction';
    tone: 'emerald' | 'amber' | 'blue' | 'rose' | 'indigo';
    icon: typeof Scale;
    cite: string;
    onClick: () => void;
  }> = [
    {
      id: 'seniority',
      title: 'Seniority',
      description:
        'UDC-only · 7.5 days × daily wage, paid twice a year (June + December) per the 2018 Prakas. Pick a semester window and the calculator pulls every eligible UDC employee.',
      kind: 'earning',
      tone: 'emerald',
      icon: Scale,
      cite: 'Cambodian Labour Law · 2018 Prakas on Seniority Indemnity',
      onClick: () => setSeniorityOpen(true),
    },
    {
      id: 'al_remain',
      title: 'AL Remain',
      description:
        'Unused-annual-leave payout. Pick a month window; each employee’s annual allocation is pro-rated by months_in_window ÷ 12, minus approved usage, then multiplied by daily wage. Lists only employees with an active AL allocation.',
      kind: 'earning',
      tone: 'indigo',
      icon: CalendarDays,
      cite: 'Cambodian Labour Law · unused annual-leave payout',
      onClick: () => setAlRemainOpen(true),
    },
    {
      id: 'fdc',
      title: '5% Severance',
      description:
        'FDC-only · 5% × total wages owed on the natural expiry of a Fixed Duration Contract. Pick a window of expiries; the calculator sums monthly_gross_earnings.totalEarnings across each contract\'s active months and excludes misconduct terminations.',
      kind: 'earning',
      tone: 'amber',
      icon: Scale,
      cite: 'Cambodian Labour Law · FDC expiry severance',
      onClick: () => setFdcOpen(true),
    },
    {
      id: 'tax',
      title: 'Tax on Salary (TOS)',
      description:
        'Progressive monthly tax per the General Department of Taxation. Picks a month and produces a per-employee preview using the configured KHR/USD FX rate, dependent deductions, and the tax-bracket table from Settings → Tax Brackets.',
      kind: 'deduction',
      tone: 'blue',
      icon: Receipt,
      cite: 'Cambodia GDT · Progressive monthly TOS brackets',
      onClick: () => {
        // Re-fetch employees on open so changes to decouple / spouse /
        // children flow through without a manual refresh.
        void loadEmployees();
        setTaxOpen(true);
      },
    },
    {
      id: 'nssf',
      title: 'NSSF Contributions',
      description:
        'National Social Security Fund — employee 2% pension + employer 0.8% / 2.6% / 2% (occupational risk, healthcare, pension) on a 1,200,000 KHR-capped contributory wage. Generates a standalone NSSF batch routed through the standard approval flow.',
      kind: 'deduction',
      tone: 'rose',
      icon: ShieldCheck,
      cite: 'NSSF Law · 1,200,000 KHR contributory wage cap',
      onClick: () => setNssfOpen(true),
    },
  ];

  const kindBadgeStyles = {
    earning:   'bg-emerald-100 text-emerald-700 border-emerald-200',
    deduction: 'bg-rose-100 text-rose-700 border-rose-200',
  } as const;

  const toneStyles = {
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
    amber:   'border-amber-200 bg-amber-50/50 text-amber-700',
    blue:    'border-blue-200 bg-blue-50/50 text-blue-700',
    rose:    'border-rose-200 bg-rose-50/50 text-rose-700',
    indigo:  'border-indigo-200 bg-indigo-50/50 text-indigo-700',
  } as const;
  const iconStyles = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    blue:    'bg-blue-100 text-blue-700',
    rose:    'bg-rose-100 text-rose-700',
    indigo:  'bg-indigo-100 text-indigo-700',
  } as const;
  const buttonStyles = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    amber:   'bg-amber-600 hover:bg-amber-700 text-white',
    blue:    'bg-blue-600 hover:bg-blue-700 text-white',
    rose:    'bg-rose-600 hover:bg-rose-700 text-white',
    indigo:  'bg-indigo-600 hover:bg-indigo-700 text-white',
  } as const;

  void t; // useI18n is wired for future label work; keeps the hook stable.

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calculator className="h-7 w-7 text-blue-600" />
          Benefit Calculator
        </h1>
        <p className="text-gray-500 mt-1 max-w-3xl">
          One-shot calculators for benefits that don't fit the regular monthly Salary batch — pick the right window, preview the eligibility table, and generate a dedicated payroll batch routed through the standard approval flow.
        </p>
      </div>

      {/* Two-row layout — earnings on top (Seniority, AL Remain, 5% Severance),
          deductions below (TOS, NSSF). Grouped so HR can see at a glance which
          calculators add money to the payslip vs. take it off. */}
      {(['earning', 'deduction'] as const).map(kind => {
        const groupCards = cards.filter(c => c.kind === kind);
        if (groupCards.length === 0) return null;
        return (
          <div key={kind} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border ${kindBadgeStyles[kind]}`}>
                {kind === 'earning' ? 'Earnings' : 'Deductions'}
              </span>
              <span className="text-xs text-gray-500">
                {kind === 'earning'
                  ? 'Pays the employee — adds to the payslip total.'
                  : 'Withheld from the employee — taken off the payslip total.'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupCards.map(card => {
                const Icon = card.icon;
                return (
                  <Card key={card.id} className={`border ${toneStyles[card.tone]}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconStyles[card.tone]}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg">{card.title}</CardTitle>
                            <span className={`inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${kindBadgeStyles[card.kind]}`}>
                              {card.kind === 'earning' ? 'Earning' : 'Deduction'}
                            </span>
                          </div>
                          <CardDescription className="text-[11px] mt-0.5 opacity-80">{card.cite}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-gray-700 leading-relaxed">{card.description}</p>
                      <Button onClick={card.onClick} className={`w-full ${buttonStyles[card.tone]}`}>
                        Open Calculator
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Calculator dialogs — mounted here so they survive page re-render
          while open. onCreated callbacks are no-ops: the Payroll page
          already polls / refetches when HR navigates back. */}
      <SeniorityIndemnityDialog
        open={seniorityOpen}
        onOpenChange={setSeniorityOpen}
      />
      <FdcSeveranceDialog
        open={fdcOpen}
        onOpenChange={(open) => {
          setFdcOpen(open);
          if (open) {
            // Re-pull contracts on open so a contract added since the
            // page mounted (or one that just expired) shows up without
            // a hard refresh.
            void loadFdcEmployees();
          }
        }}
        fdcEmployees={employees.filter(e => {
          const eid = (e as { apiId?: string }).apiId ?? e.id;
          return fdcEmployeeIds.has(eid);
        })}
      />
      <TaxCalculatorDialog
        open={taxOpen}
        onOpenChange={(open) => {
          setTaxOpen(open);
          if (open) void loadEmployees();
        }}
        employees={employees}
        taxSettings={taxSettings}
      />
      <NssfCalculatorDialog
        open={nssfOpen}
        onOpenChange={setNssfOpen}
      />
      <AlRemainDialog
        open={alRemainOpen}
        onOpenChange={setAlRemainOpen}
      />
    </div>
  );
}
