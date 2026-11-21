import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { TOKEN_KEY, USE_MOCKS } from '../api/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { UserRole } from '../types/hrms';
import { Shield, Users, User, Loader2, ArrowLeft } from 'lucide-react';
import { forgotPassword } from '../api/auth';
import { toast } from 'sonner';
// Wordmark shown at the top of the sign-in card. Matches the landing
// nav; the CardTitle text below carries the tagline.
import imgBrandLogo from '../../imports/smrt-web-logo1.png';
import { isTauri, getDesktopApiMode } from '../utils/runtime';
import {
  markPasswordSignIn, onBackForward, takeTelegramNote, telegramErrorMessage, telegramLoginUrl, telegramOptions,
  claimHandoff, clearHandoff, followTelegramFragment, handoffSupported, newHandoff, HANDOFF_TTL_MS,
  type TelegramOptions,
} from '../api/telegramAuth';
import { TelegramIcon, TELEGRAM_BLUE } from './auth/TelegramIcon';

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
  // v-telegram-login — offered only when this server has it set up.
  const [telegram, setTelegram] = useState<TelegramOptions>({ enabled: false, layout: 'A' });
  const [telegramBusy, setTelegramBusy] = useState(false);
  useEffect(() => {
    // A Telegram round trip that ended here says why (spec §10).
    const note = takeTelegramNote('login_error');
    if (note) setError(telegramErrorMessage(note.code));
    let live = true;
    void telegramOptions().then(o => { if (live) setTelegram(o); });
    const off = onBackForward(() => setTelegramBusy(false));
    return () => { live = false; off(); };
  }, []);
  // v-telegram-handoff — Telegram's page runs in a pop-up; this card waits
  // and finishes the sign-in, so approving in Telegram is the last step.
  const [waiting, setWaiting] = useState(false);
  const popup = useRef<Window | null>(null);
  const attempt = useRef<{ secret: string; hash: string } | null>(null);
  const openTelegramWindow = (url: string) => {
    const w = 480, h = 720;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const target = popup.current && !popup.current.closed ? popup.current
      : window.open('', 'hrms-telegram', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    if (target) { target.location.href = url; target.focus(); }
    return target;
  };
  const continueWithTelegram = async () => {
    setError('');
    if (!handoffSupported()) {
      setTelegramBusy(true);
      window.location.assign(telegramLoginUrl());
      return;
    }
    // Opened now, inside the click, so no pop-up blocker stops it; the
    // address follows once the attempt's secret is made.
    popup.current = window.open('', 'hrms-telegram', 'popup=yes,width=480,height=720');
    attempt.current = await newHandoff();
    const url = telegramLoginUrl(undefined, attempt.current.hash);
    if (!popup.current) {
      // Pop-ups blocked: go there; the sign-in finishes in this tab.
      setTelegramBusy(true);
      window.location.assign(url);
      return;
    }
    openTelegramWindow(url);
    setWaiting(true);
  };
  const openTelegramAgain = () => {
    if (attempt.current) openTelegramWindow(telegramLoginUrl(undefined, attempt.current.hash));
  };
  const cancelWaiting = () => {
    setWaiting(false);
    clearHandoff();
    attempt.current = null;
    try { popup.current?.close(); } catch { /* already gone */ }
    popup.current = null;
  };
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      if (!live || running) return;
      running = true;
      try {
        // Finished in a tab of this browser that signed itself in.
        if (localStorage.getItem(TOKEN_KEY)) { window.location.replace('/'); return; }
        const secret = attempt.current?.secret;
        const fragment = secret ? await claimHandoff(secret).catch(() => null) : null;
        if (!live) return;
        if (fragment) {
          clearHandoff();
          try { popup.current?.close(); } catch { /* already gone */ }
          followTelegramFragment(fragment);
          return;
        }
        if (Date.now() - started > HANDOFF_TTL_MS) {
          cancelWaiting();
          setError(telegramErrorMessage('selection_expired'));
          return;
        }
      } finally {
        running = false;
      }
      timer = setTimeout(() => void tick(), 2000);
    };
    timer = setTimeout(() => void tick(), 1500);
    // Back from Telegram: check at once.
    const now = () => { clearTimeout(timer); void tick(); };
    window.addEventListener('focus', now);
    return () => { live = false; clearTimeout(timer); window.removeEventListener('focus', now); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  const telegramFirst = telegram.enabled && telegram.layout === 'B';
  const telegramButton = (filled: boolean) => waiting ? (
    <div className="rounded-md border p-3 space-y-2" style={{ borderColor: TELEGRAM_BLUE }} role="status">
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: TELEGRAM_BLUE }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Waiting for Telegram…
      </div>
      <p className="text-xs text-gray-500">Approve in the Telegram window. You'll be signed in here.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={openTelegramAgain}
          style={{ borderColor: TELEGRAM_BLUE, color: TELEGRAM_BLUE }}>
          Open Telegram again
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancelWaiting}>Cancel</Button>
      </div>
    </div>
  ) : (
    <Button
      type="button"
      variant={filled ? 'default' : 'outline'}
      onClick={continueWithTelegram}
      disabled={busy || telegramBusy}
      className={`w-full ${filled ? 'text-white hover:opacity-90' : 'hover:bg-sky-50'}`}
      style={filled ? { background: TELEGRAM_BLUE } : { borderColor: TELEGRAM_BLUE, color: TELEGRAM_BLUE }}
    >
      {telegramBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TelegramIcon className="mr-2 h-4 w-4" />}
      {telegramBusy ? 'Opening Telegram…' : 'Continue with Telegram'}
    </Button>
  );
  const divider = (label: string) => (
    <div className="relative">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
      <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-500">{label}</span></div>
    </div>
  );

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
      // Spec §12.3 — "Sign in faster next time" may follow a password sign-in.
      markPasswordSignIn();
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
          {/* Layout B (after adoption): Telegram first. */}
          {telegramFirst && (
            <>
              {/* Spec §12.2 — the reason sits above the buttons. */}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {telegramButton(true)}
              <p className="-mt-2 text-center text-xs text-gray-500">Fastest way if your Telegram is connected</p>
              {divider('or use your password')}
            </>
          )}
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
                autoComplete="current-password"
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
            {error && !telegramFirst && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={busy || telegramBusy}
              variant={telegramFirst ? 'outline' : 'default'}
              className={`w-full ${telegramFirst ? 'border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700' : ''}`}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          {/* Layout A (rollout): password first, Telegram below. */}
          {telegram.enabled && !telegramFirst && (
            <>
              {divider('or')}
              {telegramButton(false)}
            </>
          )}

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
                  toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
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
          {/* v-dialog-close-consistency — the "check your inbox" state has
              nothing left to submit, so its footer held a single Close that
              only duplicated DialogContent's top-right X. Footer dropped
              whole (an empty DialogFooter still eats the grid's gap-4). The
              !forgotSent branch above keeps its Cancel: there it sits beside
              a submit and is the low-risk way out of a half-typed form. */}
        </DialogContent>
      </Dialog>
    </div>
  );
}