import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
// Side-effect import — monkey-patches sonner's toast.error to swallow
// module-disabled messages so a tenant with an uninstalled module sees
// the page render empty instead of a red toast on every fetch.
import './utils/moduleDisabledToastFilter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AgencyClientProvider } from './context/AgencyClientContext';
import { DateFormatProvider } from './context/DateFormatContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { I18nProvider } from './i18n/I18nContext';
// LandingPage + LoginPage stay eager — one of them is the first paint
// for every anonymous visitor and lazy-loading them would flash a
// Suspense fallback on landing, hurting perceived performance.
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { Toaster } from './components/ui/sonner';
import { Card, CardContent } from './components/ui/card';
import { ShieldOff } from 'lucide-react';
import { NAV_BY_ID, NAV_LEAVES } from './config/nav';
import { POS_DISPLAY_PATH } from './utils/posCustomerDisplay';
import { DesktopApiModeSwitch } from './components/DesktopApiModeSwitch';
import { isTauri } from './utils/runtime';

// v-lazy-app-shells — every logged-in surface + every anonymous
// deep-link page is lazy-loaded. Anonymous landing/login visitors
// download none of this code. Suspense boundaries below the auth
// providers gate the async render with a null fallback (matches the
// `if (loading) return null` posture the app already uses during
// AuthProvider's /me boot fetch — no visible spinner flicker).
const Layout          = lazy(() => import('./components/Layout').then(m => ({ default: m.Layout })));
const SuperAdminApp   = lazy(() => import('./components/views/super-admin/SuperAdminApp').then(m => ({ default: m.SuperAdminApp })));
const AgencyApp       = lazy(() => import('./components/views/agency/AgencyApp').then(m => ({ default: m.AgencyApp })));
const QrScanPage         = lazy(() => import('./components/views/QrScanPage').then(m => ({ default: m.QrScanPage })));
const PosCustomerDisplay = lazy(() => import('./components/views/PosCustomerDisplay').then(m => ({ default: m.PosCustomerDisplay })));
const PublicShopPage     = lazy(() => import('./components/views/PublicShopPage').then(m => ({ default: m.PublicShopPage })));
const KitchenSharePage   = lazy(() => import('./components/views/KitchenSharePage').then(m => ({ default: m.KitchenSharePage })));
const RequirementSurveyForm = lazy(() => import('./components/views/RequirementSurveyForm').then(m => ({ default: m.RequirementSurveyForm })));
const CambodiaLearnPage  = lazy(() => import('./components/CambodiaLearnPage').then(m => ({ default: m.CambodiaLearnPage })));
const ResetPasswordPage  = lazy(() => import('./components/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const PublicInvoiceView  = lazy(() => import('./components/views/PublicInvoiceView').then(m => ({ default: m.PublicInvoiceView })));

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
  && (window.location.pathname === POS_DISPLAY_PATH
      || window.location.pathname.startsWith(POS_DISPLAY_PATH + '/'));

/** True when the URL is the anonymous /shop/{code} public-menu page.
 *  Bypasses auth + layout so a customer can scan a QR and land on the
 *  menu instantly without any HRMS chrome. */
const isPublicShopPath = (): boolean =>
  typeof window !== 'undefined'
  && window.location.pathname.startsWith('/shop/');

/** V306 — anonymous kitchen KDS board reached via /kitchen/{code}.
 *  Same "no auth, no sidebar" posture as /shop, but the 8-char code
 *  grants write privilege (advance an order's fulfillmentStatus). */
const isPublicKitchenPath = (): boolean =>
  typeof window !== 'undefined'
  && window.location.pathname.startsWith('/kitchen/');

/** V170 — /requirement-survey — anonymous landing-page form. Prospects
 *  submit before any account exists, so it runs outside the auth flow. */
const isPublicSurveyPath = (): boolean =>
  typeof window !== 'undefined'
  && (window.location.pathname === '/requirement-survey'
      || window.location.pathname.startsWith('/requirement-survey/'));

/** /cambodia — standalone labour-law learning page (WorkingRule / NSSF /
 *  TOS / Seniority Indemnity / calculators). Moved off the marketing
 *  landing so the funnel stays tight; still reachable anonymously. */
const isCambodiaLearnPath = (): boolean =>
  typeof window !== 'undefined'
  && (window.location.pathname === '/cambodia'
      || window.location.pathname.startsWith('/cambodia/'));

/** V271 — /reset-password?token=... — destination of the emailed reset
 *  link. Anonymous; runs outside the auth flow because the whole point
 *  is that the user CAN'T sign in yet. */
const isResetPasswordPath = (): boolean =>
  typeof window !== 'undefined'
  && (window.location.pathname === '/reset-password'
      || window.location.pathname.startsWith('/reset-password/'));

/** V271 — /invoice/view/{id} — anonymous invoice view opened from the
 *  emailed link. Same opt-out flavour as /shop. */
const isPublicInvoicePath = (): boolean =>
  typeof window !== 'undefined'
  && window.location.pathname.startsWith('/invoice/view/');

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
            Active role: <span className="tabular-nums">{currentUser.role}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AppContent() {
  const { currentUser, canView, isModuleAvailable, hasActiveAgency, loading } = useAuth();
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
    // Reset the login-vs-landing flag on EVERY user transition (login
    // AND logout). Without the logout branch, a signed-out user stays
    // stuck on the login card instead of dropping back to the marketing
    // landing — the comment above `showLogin` already promised this;
    // the effect just wasn't clearing on the null side of the change.
    setShowLogin(false);
    setLoginPrefill(null);
  }, [currentUser?.id]);

  // ────────────────────────────────────────────────────────────────
  // v-first-allowed-view-redirect — all Rules-of-Hooks hooks must
  // fire BEFORE the early returns below (loading / no-user / super
  // admin all render short-circuits). Compute view resolution at
  // the top; the values are harmless when the user isn't logged in
  // yet (the early returns bypass their use).
  // ────────────────────────────────────────────────────────────────
  const entry = NAV_BY_ID[currentView];
  const allowed = !!entry
    && canView(entry.module)
    && isModuleAvailable(entry.module)
    && (entry.requireAlso ?? []).every(m => canView(m) && isModuleAvailable(m))
    && (entry.requireFeature !== 'has-active-agency' || hasActiveAgency());

  // Pick the first NAV_LEAVES entry the user CAN see. Registry
  // declaration order is the priority — no extra sort field.
  const firstAllowedId = useMemo(() => {
    if (allowed) return null;
    const hit = NAV_LEAVES.find(l =>
      !l.hideFromSidebar
      && canView(l.module)
      && isModuleAvailable(l.module)
      && (l.requireAlso ?? []).every(m => canView(m) && isModuleAvailable(m))
      && (l.requireFeature !== 'has-active-agency' || hasActiveAgency())
    );
    return hit?.id ?? null;
  }, [allowed, canView, isModuleAvailable, hasActiveAgency]);

  useEffect(() => {
    // Only redirect when the user is logged in — dodges a spurious
    // setCurrentView on the anonymous landing path.
    if (!currentUser) return;
    if (firstAllowedId && firstAllowedId !== currentView) {
      setCurrentView(firstAllowedId);
    }
  }, [currentUser, firstAllowedId, currentView]);

  // Don't flash protected UI before we know whether the cached token is still
  // valid — AuthProvider calls /auth/me on boot to verify.
  if (loading) return null;

  if (!currentUser) {
    // Desktop shell diverges from the web landing in two ways:
    //   1. an Online/Offline API-base toggle in the top nav
    //   2. the "Try Demo" dropdown is hidden (customers running the
    //      installed exe against their own droplet have no use for
    //      the shared demo tenants).
    const desktop = isTauri();
    return showLogin
      ? <LoginPage
          onBack={() => { setShowLogin(false); setLoginPrefill(null); }}
          prefill={loginPrefill}
        />
      : <LandingPage
          onSignInClick={() => { setLoginPrefill(null); setShowLogin(true); }}
          onDemoClick={desktop ? undefined : (email: string) => {
            // v-landing-demo-dropdown — landing now passes the picked
            // demo tenant's email (Accounting / HR / Hospital / Store);
            // password is fixed at admin123 across every seeded demo.
            setLoginPrefill({ email, password: 'admin123' });
            setShowLogin(true);
          }}
          navSlot={desktop ? <DesktopApiModeSwitch /> : undefined}
        />;
  }

  // Super Admin operates the platform, not tenant data — give them a separate shell.
  if (currentUser.role === 'super_admin') {
    return <SuperAdminApp />;
  }

  // V222 — agency users span multiple client Companies via
  // agency_company_assignments; they need their own workspace
  // shell + client picker instead of the tenant sidebar.
  if (typeof currentUser.role === 'string' && currentUser.role.startsWith('agency_')) {
    return <AgencyApp />;
  }

  // If we're mid-redirect (disallowed view + a fallback exists),
  // render nothing for one paint instead of NotAuthorizedView. The
  // effect above lands the redirect on the same tick.
  const ViewComponent = allowed
    ? entry!.component
    : firstAllowedId
      ? (() => null)
      : NotAuthorizedView;

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
        <Suspense fallback={null}><QrScanPage /></Suspense>
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
        <Suspense fallback={null}><PosCustomerDisplay /></Suspense>
        <Toaster />
      </>
    );
  }
  // Public-shop menu landing — same opt-out as /scan: anonymous, no
  // sidebar, no /me. The 5-char code in the URL IS the only auth.
  if (isPublicShopPath()) {
    return (
      <>
        <Suspense fallback={null}><PublicShopPage /></Suspense>
        <Toaster />
      </>
    );
  }
  // V306 — public kitchen KDS board. Same anonymous posture as /shop
  // but code holder gets limited write privilege (advance status).
  if (isPublicKitchenPath()) {
    return (
      <>
        <Suspense fallback={null}><KitchenSharePage /></Suspense>
        <Toaster />
      </>
    );
  }
  // Landing-page Requirement Survey form (V170). Same anonymous opt-out
  // — prospects submit before any account exists, and the page routes
  // to /requirement-survey directly from marketing.
  if (isPublicSurveyPath()) {
    return (
      <>
        <Suspense fallback={null}>
          <RequirementSurveyForm
            onBack={() => { window.location.href = '/'; }}
          />
        </Suspense>
        <Toaster />
      </>
    );
  }
  // /cambodia — standalone labour-law learning page. Same anonymous
  // opt-out flavour; reuses I18nContext for the language toggle.
  if (isCambodiaLearnPath()) {
    return (
      <I18nProvider>
        <Suspense fallback={null}><CambodiaLearnPage /></Suspense>
        <Toaster />
      </I18nProvider>
    );
  }
  // V271 — /reset-password — anonymous. No providers needed; the page
  // POSTs directly to /api/v1/auth/reset-password with the URL token.
  if (isResetPasswordPath()) {
    return (
      <>
        <Suspense fallback={null}><ResetPasswordPage /></Suspense>
        <Toaster />
      </>
    );
  }
  // V271 — /invoice/view/{id} — anonymous invoice view opened from the
  // emailed link. UUID in the URL is the whole capability; no auth.
  if (isPublicInvoicePath()) {
    return (
      <>
        <Suspense fallback={null}><PublicInvoiceView /></Suspense>
        <Toaster />
      </>
    );
  }
  return (
    <I18nProvider>
      <AuthProvider>
        <AgencyClientProvider>
          <DateFormatProvider>
            <ConfirmProvider>
              {/* Single Suspense wraps everything below the auth providers.
                  Fallback is null — matches the `if (loading) return null`
                  posture AppContent already uses while /me is verifying,
                  so no visible spinner flicker on landing or route flips. */}
              <Suspense fallback={null}>
                <AppContent />
              </Suspense>
              <Toaster />
            </ConfirmProvider>
          </DateFormatProvider>
        </AgencyClientProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
