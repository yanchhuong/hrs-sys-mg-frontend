import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '../../api/client';
import {
  acceptInviteWithPassword, previewInvite, startInviteTelegram, type InvitePreview,
} from '../../api/invites';
import { leaveOpenLogin, onBackForward, telegramErrorMessage, telegramOptions } from '../../api/telegramAuth';
import { TelegramIcon, TELEGRAM_BLUE } from './TelegramIcon';

/** /invite/<token> — the token is the last path segment. */
export function inviteTokenFromPath(): string | null {
  const m = /^\/invite\/([A-Za-z0-9_-]{20,200})\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

/** Spec §12.4 — phones open invites in the mobile app. */
function sendPhonesToMobile(token: string): boolean {
  const host = window.location.hostname;
  const ours = host === 'www.hr-share.com' || host === 'hr-share.com';
  if (!ours || !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return false;
  window.location.replace(`https://m.hr-share.com/invite/${token}`);
  return true;
}

const codeOf = (e: unknown): string =>
  e instanceof ApiError && e.status === 404 && /^[a-z_]+$/.test(e.message) ? e.message : '';

/**
 * v-user-invites — the invite landing (spec §12.4, the "Invite page"
 * mockup): who is invited where, then Continue with Telegram or set a
 * password. A used / expired / revoked link says so, with Sign in.
 */
export function InvitePage() {
  const token = inviteTokenFromPath();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(token ? null : 'invite_invalid');
  const [telegramOn, setTelegramOn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'telegram' | 'password' | null>(null);

  useEffect(() => {
    if (!token || sendPhonesToMobile(token)) return;
    let live = true;
    void (async () => {
      const [p, o] = await Promise.allSettled([previewInvite(token), telegramOptions()]);
      if (!live) return;
      if (p.status === 'fulfilled') setPreview(p.value);
      else setProblem(codeOf(p.reason) || 'invite_invalid');
      const on = o.status === 'fulfilled' && o.value.enabled;
      setTelegramOn(on);
      if (!on) setShowPassword(true);
    })();
    const off = onBackForward(() => setBusy(null));
    return () => { live = false; off(); };
  }, [token]);

  const goSignIn = () => { leaveOpenLogin(); window.location.replace('/'); };

  const withTelegram = async () => {
    if (!token) return;
    setError('');
    setBusy('telegram');
    try {
      await startInviteTelegram(token, 'web');
    } catch (e) {
      setBusy(null);
      const code = codeOf(e);
      if (code) setProblem(code);
      else setError(e instanceof Error && e.message ? e.message : telegramErrorMessage('telegram_error'));
    }
  };

  const withPassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!token) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setError('');
    setBusy('password');
    try {
      await acceptInviteWithPassword(token, password);
      window.location.replace('/');
    } catch (e) {
      setBusy(null);
      const code = codeOf(e);
      if (code) setProblem(code);
      else setError(e instanceof Error && e.message ? e.message : 'Could not set your password. Try again.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center text-white mb-6">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-white flex items-center justify-center text-blue-600 text-2xl font-bold">H</div>
          <h1 className="text-2xl font-bold">{problem ? 'Smart HRMS' : "You're invited"}</h1>
          {preview && !problem && (
            <p className="mt-1 text-sm text-white/85">Join <b>{preview.companyName}</b> on Smart HRMS</p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xl space-y-4">
          {problem ? (
            <>
              <p className="text-sm text-gray-700 text-center">{telegramErrorMessage(problem)}</p>
              <button type="button" onClick={goSignIn}
                className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700">
                Sign in
              </button>
            </>
          ) : !preview ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening your invite…
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="font-semibold text-gray-900">{preview.fullName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {[preview.roleName, preview.invitedByName ? `invited by ${preview.invitedByName}` : null]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {telegramOn && (
                <button type="button" onClick={() => void withTelegram()} disabled={busy !== null}
                  className="w-full h-11 rounded-xl text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-70"
                  style={{ background: TELEGRAM_BLUE }}>
                  {busy === 'telegram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TelegramIcon className="h-4 w-4" />}
                  {busy === 'telegram' ? 'Opening Telegram…' : 'Continue with Telegram'}
                </button>
              )}

              {telegramOn && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
                </div>
              )}

              {!showPassword ? (
                <button type="button" onClick={() => setShowPassword(true)} disabled={busy !== null}
                  className="w-full h-11 rounded-xl border border-blue-600 text-blue-600 font-semibold hover:bg-blue-50">
                  Set a password instead
                </button>
              ) : (
                <form onSubmit={withPassword} className="space-y-3">
                  <input type="email" autoComplete="username" value={preview.email ?? ''} readOnly hidden />
                  <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)"
                    value={password} onChange={e => setPassword(e.target.value)} autoFocus={telegramOn}
                    className="w-full h-11 rounded-xl bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="password" autoComplete="new-password" placeholder="Confirm password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="w-full h-11 rounded-xl bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="submit" disabled={busy !== null}
                    className={`w-full h-11 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-70 ${
                      telegramOn ? 'border border-blue-600 text-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {busy === 'password' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Set password and sign in
                  </button>
                </form>
              )}

              <p className="text-center text-xs text-gray-400">Not you? Ignore this link.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
