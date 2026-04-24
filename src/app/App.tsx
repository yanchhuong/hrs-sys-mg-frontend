import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { Dashboard } from './components/views/Dashboard';
import { Employees } from './components/views/Employees';
import { Attendance } from './components/views/Attendance';
import { Overtime } from './components/views/Overtime';
import { Payroll } from './components/views/Payroll';
import { Contracts } from './components/views/Contracts';
import { UserManagement } from './components/views/UserManagement';
import { Settings } from './components/views/Settings';
import { Exception } from './components/views/Exception';
import { Deduction } from './components/views/Deduction';
import { Increase } from './components/views/Increase';
import { AttendanceSettings } from './components/views/AttendanceSettings';
import { PayrollCategorySettings } from './components/views/PayrollCategorySettings';
import { Reports } from './components/views/Reports';
import { SuperAdminApp } from './components/views/super-admin/SuperAdminApp';
import { Toaster } from './components/ui/sonner';

function AppContent() {
  const { currentUser } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');

  if (!currentUser) {
    return <LoginPage />;
  }

  // Super Admin operates the platform, not tenant data — give them a separate shell.
  if (currentUser.role === 'super_admin') {
    return <SuperAdminApp />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'employees':
        return <Employees />;
      case 'attendance':
        return <Attendance />;
      case 'exception':
        return <Exception />;
      case 'overtime':
        return <Overtime />;
      case 'deduction':
        return <Deduction />;
      case 'increase':
        return <Increase />;
      case 'payroll':
        return <Payroll />;
      case 'reports':
        return <Reports />;
      case 'contracts':
        return <Contracts />;
      case 'user-management':
        return <UserManagement />;
      case 'settings':
        return <Settings />;
      case 'attendance-settings':
        return <AttendanceSettings />;
      case 'payroll-categories':
        return <PayrollCategorySettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {renderView()}
    </Layout>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppContent />
        <Toaster />
      </AuthProvider>
    </I18nProvider>
  );
}