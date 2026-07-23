import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCKS } from '../api/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { UserRole } from '../types/hrms';
import { Shield, Users, User, Loader2, ArrowLeft } from 'lucide-react';
import { forgotPassword } from '../api/auth';
import { toast } from 'sonner';
// Wordmark shown at the top of the sign-in card. Matches the landing
// nav; the CardTitle text below carries the tagline.
import imgBrandLogo from '../../imports/smrt-web-logo.png';
import { isTauri, getDesktopApiMode } from '../utils/runtime';

/** localStorage keys for the "Remember me" pre-fill. Password is
 *  intentionally obfuscated (base64) rather than encrypted — anyone
 *  with DevTools access to this origin can still recover it, so users
 *  who tick the checkbox are trusting their local machine. This
 *  matches the user-requested behaviour where the shipped Windows
 *  shell auto-fills BOTH fields (there's no system password manager
 *  in the Tauri WebView the way Chrome offers one). */
const REMEMBERED_EMAIL_KEY = 'hrms:rememberedEmail';
const REMEMBERED_PASSWORD_KEY = 'hrms:rememberedPasswordB64';

function readRememberedEmail(): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(REMEMBERED_EMAIL_KEY)
      : null;
  } catch { return null; }
}

function readRememberedPassword(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const b64 = localStorage.getItem(REMEMBERED_PASSWORD_KEY);
    if (!b64) return null;
    // atob throws on non-base64 input — treat that as no stored value.
    return atob(b64);
  } catch { return null; }
}

interface LoginPageProps {
  /** Optional — when provided, renders a "Back to home" link above the card. */
  onBack?: () => void;
  /** Optional — pre-fill the email/password inputs on mount. Used by the
   *  landing-page Demo button so visitors land on the form with the
   *  demo credentials already typed. */
  prefill?: { email: string; password: string } | null;
}

/** Signatures of the "server unreachable" family across the browsers
 *  Chromium's WebView ships. Used to distinguish a network failure
 *  ("can't reach the host at all") from a login-side failure
 *  ("wrong password"). */
const NETWORK_ERROR_MARKERS = [
  'failed to fetch',      // Chromium / Edge / Tauri WebView2
  'network error',        // some Fetch polyfills
  'networkerror',         // Firefox
  'load failed',          // Safari
  'err_connection',       // Chromium detailed variants
  'empty or malformed',   // our own guard when the shell resolves to a non-JSON same-origin page
];

function isNetworkError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return NETWORK_ERROR_MARKERS.some(marker => m.includes(marker));
}

/** Desktop-only error copy. Web keeps the raw message so devs / QA
 *  still see the underlying detail. In the shipped Windows app we
 *  swap network failures for mode-specific guidance:
 *   - Online + no internet  → "Please check your Internet..."
 *   - Offline + no local API → "Offline is not available now! Contact Admin."
 */
function reshapeLoginError(raw: string | undefined): string {
  const fallback = raw ?? 'Invalid credentials';
  if (!isTauri() || !isNetworkError(raw)) return fallback;
  return getDesktopApiMode() === 'online'
    ? 'Please check your Internet — make sure it is working!'
    : 'Offline is not available now! Contact Admin.';
}

export function LoginPage({ onBack, prefill }: LoginPageProps = {}) {
  // If we've stashed credentials from a previous "Remember me" tick,
  // seed the form with them. A parent-supplied prefill (from clicking
  // Demo) still wins — explicit user intent beats persistence.
  const rememberedEmail = readRememberedEmail();
  const rememberedPassword = readRememberedPassword();
  const [email, setEmail] = useState(prefill?.email ?? rememberedEmail ?? '');
  const [password, setPassword] = useState(prefill?.password ?? rememberedPassword ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState<boolean>(!!rememberedEmail);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { login, switchRole } = useAuth();

  // Reflect prefill updates from the parent — covers the case where the
  // user clicks "Demo" after the LoginPage has already mounted (e.g.
  // typed something, hit Back, clicked Demo).
  useEffect(() => {
    if (prefill) {
      setEmail(prefill.email);
      setPassword(prefill.password);
      setError('');
    }
  }, [prefill]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email, password);
      if (!res.success) {
        setError(reshapeLoginError(res.error));
        return;
      }
      // Only persist credentials on a successful sign-in — an invalid
      // attempt shouldn't imprint the typo. Password is base64-encoded
      // (see the key comment); it's obfuscation, not encryption.
      try {
        if (remember) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
          localStorage.setItem(REMEMBERED_PASSWORD_KEY, btoa(password));
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
        }
      } catch { /* private mode / storage disabled — non-fatal */ }
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = (role: UserRole) => {
    switchRole(role);
  };

  const autoFill = (email: string, password: string) => {
    setEmail(email);
    setPassword(password);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </button>
        )}
      <Card className="w-full">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <img
              src={imgBrandLogo}
              alt="SMRT HRSM 360°"
              className="h-14 w-auto object-contain"
              draggable={false}
            />
          </div>
          <CardDescription>Human Resource Management System</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email or username</Label>
              <Input
                id="email"
                // V146 — accept username too. Drop type="email" so the
                // browser doesn't reject a username with its built-in
                // email-format validator; the server routes on '@'.
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="admin@company.com  or  username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer select-none">
                  Remember me
                </Label>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email && email.includes('@') ? email : '');
                  setForgotSent(false);
                  setForgotOpen(true);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          {USE_MOCKS && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Demo Quick Login</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" size="sm" onClick={() => quickLogin('super_admin')}
                  className="flex flex-col h-auto py-3 gap-1 border-amber-300 bg-amber-50/40 hover:bg-amber-50">
                  <Shield className="h-4 w-4 text-amber-700" />
                  <span className="text-[10px] text-amber-900">Super</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => quickLogin('admin')}
                  className="flex flex-col h-auto py-3 gap-1">
                  <Shield className="h-4 w-4" />
                  <span className="text-[10px]">Admin</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => quickLogin('manager')}
                  className="flex flex-col h-auto py-3 gap-1">
                  <Users className="h-4 w-4" />
                  <span className="text-[10px]">Manager</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => quickLogin('employee')}
                  className="flex flex-col h-auto py-3 gap-1">
                  <User className="h-4 w-4" />
                  <span className="text-[10px]">Employee</span>
                </Button>
              </div>
            </>
          )}

          {/* Quick-fill credentials block — only shown in mock mode for
              local dev convenience. Live builds never surface the seeded
              demo accounts so production login pages can't be used to
              casually click into someone else's tenant. */}
          {USE_MOCKS && (
            <div className="text-xs text-gray-500 space-y-2">
              <p className="text-center">Or auto-fill credentials:</p>
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => autoFill('admin@example.com', 'admin123')}
                  className="w-full justify-start text-xs h-7 px-2"
                >
                  Admin: admin@example.com / admin123
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => autoFill('jane@example.com', 'password123')}
                  className="w-full justify-start text-xs h-7 px-2"
                >
                  Employee: jane@example.com / password123
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Forgot-password dialog. Server always returns 204 so we can't
          leak account existence — the FE just shows the "check your
          inbox" copy on every non-error path. */}
      <Dialog open={forgotOpen} onOpenChange={(o) => { setForgotOpen(o); if (!o) setForgotSent(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              {forgotSent
                ? 'If an account exists for that email, a reset link has been sent. Check your inbox — the link expires in 30 minutes.'
                : 'Enter your account email. We\'ll send you a link to set a new password.'}
            </DialogDescription>
          </DialogHeader>
          {!forgotSent && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!forgotEmail.trim()) return;
                setForgotBusy(true);
                try {
                  await forgotPassword(forgotEmail.trim());
                  setForgotSent(true);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Could not send reset email');
                } finally {
                  setForgotBusy(false);
                }
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotBusy || !forgotEmail.trim()}>
                  {forgotBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </DialogFooter>
            </form>
          )}
          {forgotSent && (
            <DialogFooter>
              <Button onClick={() => setForgotOpen(false)}>Close</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}