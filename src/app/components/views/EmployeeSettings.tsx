import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Briefcase, FolderTree, DollarSign, Fingerprint, Users, Receipt,
} from 'lucide-react';
import { Positions } from './Positions';
import { DepsGroup } from './DepsGroup';
import { SalaryRules } from './SalaryRules';
import { DeviceUsers } from './DeviceUsers';
import { TaxBrackets } from './TaxBrackets';
import { useI18n } from '../../i18n/I18nContext';
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
  const [kpis, setKpis] = useState<SettingsKpis>(EMPTY_KPIS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (USE_MOCKS) {
        // In mock mode the underlying lists aren't fetched — derive what
        // we can from the seed arrays so the cards aren't all zero.
        if (!cancelled) {
          setKpis({
            totalPositions: new Set(mockEmployees.map(e => e.position).filter(Boolean)).size,
            positionsAssigned: new Set(mockEmployees.map(e => e.position).filter(Boolean)).size,
            totalDepartments: mockDepartments.length,
            totalSalaryRules: 0,
            unmatchedDeviceUsers: 0,
          });
        }
        return;
      }
      try {
        const [positions, departments, salaryRules, employeesPage, unmatched] = await Promise.all([
          positionsApi.list().catch(() => []),
          departmentsApi.list().catch(() => []),
          salaryRulesApi.list().catch(() => []),
          // Page 0 size 1 just to read totalElements for the assigned-positions
          // count fallback (we don't actually need the rows here).
          employeesApi.list({ size: 500 }).catch(() => ({ content: [] as employeesApi.Employee[] } as never)),
          unmatchedApi.list().catch(() => []),
        ]);
        if (cancelled) return;
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
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.employeeSettings.title')}</h1>
        <p className="text-gray-500">{t('page.employeeSettings.description')}</p>
      </div>

      {/* Global KPI cards — mirror the User Management page layout: cards
          first, tab filter below. Each card is a tenant-wide summary of
          the entity managed in the matching tab. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Briefcase className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">{kpis.totalPositions}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Total Positions</p>
            <p className="text-[11px] text-gray-500 truncate">{kpis.positionsAssigned} assigned</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <FolderTree className="h-5 w-5 text-emerald-600" />
              <span className="text-2xl font-bold text-emerald-600">{kpis.totalDepartments}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Departments / Groups</p>
            <p className="text-[11px] text-gray-500 truncate">All units</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-5 w-5 text-amber-600" />
              <span className="text-2xl font-bold text-amber-600">{kpis.totalSalaryRules}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Salary Rules</p>
            <p className="text-[11px] text-gray-500 truncate">Tenure brackets</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-rose-600" />
              <span className="text-2xl font-bold text-rose-600">{kpis.unmatchedDeviceUsers}</span>
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">Device Users</p>
            <p className="text-[11px] text-gray-500 truncate">Unmatched / pending</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="positions" className="space-y-6">
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
          <TabsTrigger value="device-users">
            <Fingerprint className="mr-2 h-4 w-4" />
            {t('page.employeeSettings.tab.deviceUsers')}
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
          <DepsGroup embedded />
        </TabsContent>

        <TabsContent value="salary-rules" className="space-y-4">
          <SalaryRules embedded />
        </TabsContent>

        <TabsContent value="device-users" className="space-y-4">
          <DeviceUsers embedded />
        </TabsContent>

        <TabsContent value="tax-brackets" className="space-y-4">
          <TaxBrackets embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
