import { useEffect, useState } from 'react';
// Side-effect import — monkey-patches sonner's toast.error to swallow
// module-disabled messages so a tenant with an uninstalled module sees
// the page render empty instead of a red toast on every fetch.
import './utils/moduleDisabledToastFilter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DateFormatProvider } from './context/DateFormatContext';
import { I18nProvider } from './i18n/I18nContext';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { SuperAdminApp } from './components/views/super-admin/SuperAdminApp';
import { Toaster } from './components/ui/sonner';
import { Card, CardContent } from './components/ui/card';
import { ShieldOff } from 'lucide-react';
import { NAV_BY_ID } from './config/nav';
import { QrScanPage } from './components/views/QrScanPage';
import { PosCustomerDisplay } from './components/views/PosCustomerDisplay';
import { POS_DISPLAY_PATH } from './utils/posCustomerDisplay';
import { PublicShopPage } from './components/views/PublicShopPage';

/** True when the URL path is the public QR-scan landing. Read once
 *  at App mount — this page is meant to be a one-shot landing, so we
 *  don't reactively listen for History changes. */
const isPublicScanPath = (): boolean =>
  typeof window !== 'undefined'
  && (window.location.pathname === '/scan'
      || window.location.pathname.startsWith('/scan/'));

/** True when the URL path is the POS customer-display window. Like
 *  /scan above, this is a one-shot landing meant to be opened in its
 *  own pop-out window from the POS page — no auth, no sidebar, just
 *  the mirror screen. Read once at mount; the customer never
 *  navigates from here. */
const isPosDisplayPath = (): boolean =>
  typeof window !== 'undefined'
  && window.location.pathname === POS_DISPLAY_PATH;

/** True when the URL is the anonymous /shop/{code} public-menu page.
 *  Bypasses auth + layout so a customer can scan a QR and land on the
 *  menu instantly without any HRMS chrome. */
const isPublicShopPath = (): boolean =>
  typeof window !== 'undefined'
  && window.location.pathname.startsWith('/shop/');

function NotAuthorizedView() {
  // Pull the active role from AuthContext so we can name it on the
  // empty-state. Without this, the admin who's tuning permissions has
  // to guess which row of the matrix needs the missing checkbox.
  const { currentUser } = useAuth();
  return (
    <Card className="max-w-md mx-auto mt-12">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <ShieldOff className="h-10 w-10 text-gray-400" />
        <p className="font-medium">Access denied</p>
        <p className="text-sm text-gray-500">
          Your role does not grant access to this module. Pick another menu item, or
          ask an administrator to update the Permissions matrix.
        </p>
        {currentUser?.role && (
          <p className="text-xs text-gray-400">
            Active role: <span className="font-mono">{currentUser.role}</span>
          </p>
        )}
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
  /** Optional credentials to pre-fill on the login form — non-null when
   *  the visitor clicked the landing-page "Try Demo" button. Cleared on
   *  Back so a normal Sign In click doesn't carry the demo values over. */
  const [loginPrefill, setLoginPrefill] = useState<{ email: string; password: string } | null>(null);

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
      ? <LoginPage
          onBack={() => { setShowLogin(false); setLoginPrefill(null); }}
          prefill={loginPrefill}
        />
      : <LandingPage
          onSignInClick={() => { setLoginPrefill(null); setShowLogin(true); }}
          onDemoClick={() => {
            setLoginPrefill({ email: 'admin@demo.com', password: 'admin123' });
            setShowLogin(true);
          }}
        />;
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
  // Mirror Layout's isLeafVisible AND-semantics — a leaf with
  // requireAlso must clear every additional module too. Without this,
  // a user whose sidebar correctly hides Attendance Settings could
  // still land on it via a stale currentView from a previous session.
  const allowed = entry
    ? canView(entry.module)
      && (entry.requireAlso ?? []).every(m => canView(m))
    : false;
  const ViewComponent = allowed ? entry!.component : NotAuthorizedView;

  // Some leaves back the same component with different initial state
  // (e.g. the Reports sub-menu leaves all render Reports but pass an
  // initialView so the page jumps straight to one section). NavLeaf.
  // initialView is the props-shaped contract — Reports reads it, other
  // components ignore the unknown key.
  //
  // onNavigate is the cross-page nav escape hatch. Pages that link to
  // sub-pages (e.g. Attendance's gear-icon menu opens Offices / QR
  // Display, both `hideFromSidebar`) call it to switch views without
  // duplicating the setCurrentView wiring. Components that don't
  // navigate cross-page just ignore the prop.
  const viewProps: Record<string, unknown> = { onNavigate: setCurrentView };
  if (entry?.initialView) viewProps.initialView = entry.initialView;

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      <ViewComponent {...viewProps} />
    </Layout>
  );
}

export default function App() {
  // Public /scan path — bypass the Auth + i18n + DateFormat providers
  // entirely. The scan page is meant to be opened on an employee's
  // phone (no HRMS login expected). Rendering before AuthProvider's
  // boot fetch keeps the UX instant: no loading flash, no surprise
  // redirect to /login if cached token expired.
  if (isPublicScanPath()) {
    return (
      <>
        <QrScanPage />
        <Toaster />
      </>
    );
  }
  // POS customer display — second-window mirror screen. Bypass
  // Auth + i18n + DateFormat so the popped window paints instantly
  // (no /me round-trip, no layout chrome). State arrives via
  // BroadcastChannel from the cart side.
  if (isPosDisplayPath()) {
    return (
      <>
        <PosCustomerDisplay />
        <Toaster />
      </>
    );
  }
  // Public-shop menu landing — same opt-out as /scan: anonymous, no
  // sidebar, no /me. The 5-char code in the URL IS the only auth.
  if (isPublicShopPath()) {
    return (
      <>
        <PublicShopPage />
        <Toaster />
      </>
    );
  }
  return (
    <I18nProvider>
      <AuthProvider>
        <DateFormatProvider>
          <AppContent />
          <Toaster />
        </DateFormatProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
