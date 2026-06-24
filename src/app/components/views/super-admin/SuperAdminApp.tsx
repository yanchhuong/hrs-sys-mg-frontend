import { useState } from 'react';
import { SuperAdminLayout, SuperAdminView } from './SuperAdminLayout';
import { PlatformDashboard } from './PlatformDashboard';
import { Companies } from './Companies';
import { Plans } from './Plans';
import { CrossTenantUsers } from './CrossTenantUsers';
import { SyncMonitor } from './SyncMonitor';
import { ActivityLog } from './ActivityLog';
import { Backups } from './Backups';
import { PlatformPolicy } from './PlatformPolicy';
import { PlatformPayrollCategories } from './PlatformPayrollCategories';
import { PlatformHolidays } from './PlatformHolidays';
import { SystemHolidays } from './SystemHolidays';
import { TenantModules } from './TenantModules';
import { ModuleCategories } from './ModuleCategories';
import { PlatformTelegram } from './PlatformTelegram';

export function SuperAdminApp() {
  const [view, setView] = useState<SuperAdminView>('dashboard');

  const render = () => {
    switch (view) {
      case 'dashboard':          return <PlatformDashboard />;
      case 'companies':          return <Companies />;
      case 'plans':              return <Plans />;
      case 'users':              return <CrossTenantUsers />;
      case 'sync':               return <SyncMonitor />;
      case 'tenant_modules':     return <TenantModules />;
      case 'module_categories':  return <ModuleCategories />;
      case 'activity':           return <ActivityLog />;
      case 'backups':            return <Backups />;
      case 'policy':             return <PlatformPolicy />;
      case 'payroll_categories': return <PlatformPayrollCategories />;
      case 'holidays':           return <PlatformHolidays />;
      case 'system_holidays':    return <SystemHolidays />;
      case 'platform_telegram':  return <PlatformTelegram />;
    }
  };

  return (
    <SuperAdminLayout currentView={view} onViewChange={setView}>
      {render()}
    </SuperAdminLayout>
  );
}
