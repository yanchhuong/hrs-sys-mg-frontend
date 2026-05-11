import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { SuperAdminApp } from './components/views/super-admin/SuperAdminApp';
import { Toaster } from './components/ui/sonner';
import { Card, CardContent } from './components/ui/card';
import { ShieldOff } from 'lucide-react';
import { NAV_BY_ID } from './config/nav';

function NotAuthorizedView() {
  return (
    <Card className="max-w-md mx-auto mt-12">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <ShieldOff className="h-10 w-10 text-gray-400" />
        <p className="font-medium">Access denied</p>
        <p className="text-sm text-gray-500">
          Your role does not grant access to this module. Pick another menu item, or
          ask an administrator to update the Permissions matrix.
        </p>
      </CardContent>
    </Card>
  );
}

function AppContent() {
  const { currentUser, canView, loading } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  // Unauthenticated UX: marketing landing first, login surfaces when the
  // user clicks Sign In / Get Started. Reset to landing on every logout so
  // the next visitor doesn't drop straight into the login form.
  const [showLogin, setShowLogin] = useState(false);

  // Reset the view whenever the logged-in user changes (logout → login as a
  // different role). Without this, currentView is sticky and a freshly-
  // logged-in approver may briefly land on the previous admin's last page.
  useEffect(() => {
    setCurrentView('dashboard');
    if (currentUser) setShowLogin(false);
  }, [currentUser?.id]);

  // Don't flash protected UI before we know whether the cached token is still
  // valid — AuthProvider calls /auth/me on boot to verify.
  if (loading) return null;

  if (!currentUser) {
    return showLogin
      ? <LoginPage onBack={() => setShowLogin(false)} />
      : <LandingPage onSignInClick={() => setShowLogin(true)} />;
  }

  // Super Admin operates the platform, not tenant data — give them a separate shell.
  if (currentUser.role === 'super_admin') {
    return <SuperAdminApp />;
  }

  // The view registry in `config/nav.ts` is the single source of truth: it
  // binds id → permission module → component, and is also what the Layout
  // sidebar is built from. Anything outside the registry, OR anything whose
  // module isn't permitted for the current role, falls through to the
  // friendly "Not Authorized" card instead of attempting an API call that
  // would 403.
  const entry = NAV_BY_ID[currentView];
  const allowed = entry ? canView(entry.module) : false;
  const ViewComponent = allowed ? entry!.component : NotAuthorizedView;

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      <ViewComponent />
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
