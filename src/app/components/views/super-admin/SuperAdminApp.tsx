import { useState } from 'react';
import { SuperAdminLayout, SuperAdminView } from './SuperAdminLayout';
import { PlatformDashboard } from './PlatformDashboard';
import { Companies } from './Companies';
import { CrossTenantUsers } from './CrossTenantUsers';
import { SyncMonitor } from './SyncMonitor';
import { ActivityLog } from './ActivityLog';
import { Backups } from './Backups';
import { PlatformPolicy } from './PlatformPolicy';

export function SuperAdminApp() {
  const [view, setView] = useState<SuperAdminView>('dashboard');

  const render = () => {
    switch (view) {
      case 'dashboard': return <PlatformDashboard />;
      case 'companies': return <Companies />;
      case 'users':     return <CrossTenantUsers />;
      case 'sync':      return <SyncMonitor />;
      case 'activity':  return <ActivityLog />;
      case 'backups':   return <Backups />;
      case 'policy':    return <PlatformPolicy />;
    }
  };

  return (
    <SuperAdminLayout currentView={view} onViewChange={setView}>
      {render()}
    </SuperAdminLayout>
  );
}
