import { useCallback, useEffect, useRef, useState } from 'react';
import { StatCard } from '../common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Briefcase, FolderTree, DollarSign, Users, Receipt,
} from 'lucide-react';
import { Positions } from './Positions';
import { DepsGroup } from './DepsGroup';
import { SalaryRules } from './SalaryRules';
import { TaxBrackets } from './TaxBrackets';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../context/AuthContext';
import * as positionsApi from '../../api/positions';
import * as departmentsApi from '../../api/departments';
import * as salaryRulesApi from '../../api/salaryRules';
import * as employeesApi from '../../api/employees';
import * as unmatchedApi from '../../api/unmatchedDeviceUsers';
import { USE_MOCKS } from '../../api/client';
import { mockEmployees, mockDepartments } from '../../data/mockData';

interface SettingsKpis {
  totalPositions: number;
  positionsAssigned: number;
  totalDepartments: number;
  totalSalaryRules: number;
  unmatchedDeviceUsers: number;
}

const EMPTY_KPIS: SettingsKpis = {
  totalPositions: 0,
  positionsAssigned: 0,
  totalDepartments: 0,
  totalSalaryRules: 0,
  unmatchedDeviceUsers: 0,
};

export function EmployeeSettings() {
  const { t } = useI18n();
  const { isModuleAvailable } = useAuth();
  const [kpis, setKpis] = useState<SettingsKpis>(EMPTY_KPIS);
  const [tab, setTab] = useState('positions');

  // KPIs used to be fetched once on mount, so they went stale as soon as
  // a position / department / rule was added or removed in a tab below.
  // loadKpis now re-runs on tab switch, on window focus, and whenever an
  // embedded tab reports a change (DepsGroup's onChanged).
  const reqSeq = useRef(0);
  const loadKpis = useCallback(async () => {
    const seq = ++reqSeq.current;
    if (USE_MOCKS) {
      // In mock mode the underlying lists aren't fetched — derive what
      // we can from the seed arrays so the cards aren't all zero.
      setKpis({
        totalPositions: new Set(mockEmployees.map(e => e.position).filter(Boolean)).size,
        positionsAssigned: new Set(mockEmployees.map(e => e.position).filter(Boolean)).size,
        totalDepartments: mockDepartments.length,
        totalSalaryRules: 0,
        unmatchedDeviceUsers: 0,
      });
      return;
    }
    try {
      // v-employee-settings-module-preflight — the unmatched-device
      // list is gated by the `attendance` module. Tenants without it
      // (e.g. School System) would 403; preflight so the network tab
      // stays clean.
      const unmatchedCall = isModuleAvailable('attendance')
        ? unmatchedApi.list().catch(() => [])
        : Promise.resolve([]);
      const [positions, departments, salaryRules, employeesPage, unmatched] = await Promise.all([
        positionsApi.list().catch(() => []),
        departmentsApi.list().catch(() => []),
        salaryRulesApi.list().catch(() => []),
        // Rows are read only to count the distinct assigned positions.
        employeesApi.list({ size: 500 }).catch(() => ({ content: [] as employeesApi.Employee[] } as never)),
        unmatchedCall,
      ]);
      // A newer refresh (or unmount) superseded this one.
      if (seq !== reqSeq.current) return;
      const assigned = new Set(
        ((employeesPage as { content: employeesApi.Employee[] }).content ?? [])
          .map(e => e.position)
          .filter((p): p is string => !!p && p.length > 0),
      ).size;
      setKpis({
        totalPositions: positions.length,
        positionsAssigned: assigned,
        totalDepartments: departments.length,
        totalSalaryRules: salaryRules.length,
        unmatchedDeviceUsers: unmatched.length,
      });
    } catch {
      // Per-call .catch already swallowed individual failures; this catch
      // is a belt-and-braces against an unexpected rejection.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadKpis(); }, [loadKpis, tab]);
  useEffect(() => {
    const onFocus = () => { void loadKpis(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      reqSeq.current++; // drop any in-flight result after unmount
    };
  }, [loadKpis]);

  return (
    <div className="space-y-6">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold">{t('page.employeeSettings.title')}</h1>
      </div>

      {/* Global KPI cards — mirror the User Management page layout: cards
          first, tab filter below. Each card is a tenant-wide summary of
          the entity managed in the matching tab. */}
      <div className="stat-strip stat-cols-4">
        <StatCard
          label="Total Positions" value={kpis.totalPositions}
          hint={`${kpis.positionsAssigned} assigned`} icon={Briefcase} tone="blue"
        />
        <StatCard
          label="Departments / Groups" value={kpis.totalDepartments}
          hint="All units" icon={FolderTree} tone="green"
        />
        <StatCard
          label="Salary Rules" value={kpis.totalSalaryRules}
          hint="Tenure brackets" icon={DollarSign} tone="amber"
        />
        <StatCard
          label="Device Users" value={kpis.unmatchedDeviceUsers}
          hint="Unmatched / pending" icon={Users} tone="red"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="positions">
            <Briefcase className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.positions')}
          </TabsTrigger>
          <TabsTrigger value="departments">
            <FolderTree className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.departments')}
          </TabsTrigger>
          <TabsTrigger value="salary-rules">
            <DollarSign className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.salaryRules')}
          </TabsTrigger>
          <TabsTrigger value="tax-brackets">
            <Receipt className="mr-2 h-4 w-4" />
            Tax Brackets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-4">
          <Positions embedded />
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <DepsGroup embedded onChanged={() => { void loadKpis(); }} />
        </TabsContent>

        <TabsContent value="salary-rules" className="space-y-4">
          <SalaryRules embedded />
        </TabsContent>

        <TabsContent value="tax-brackets" className="space-y-4">
          <TaxBrackets embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
