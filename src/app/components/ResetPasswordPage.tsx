import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { resetPassword } from '../api/auth';
import imgBrandLogo from '../../imports/smrt-web-logo1.png';

/** V271 — /reset-password?token=... — the destination of the emailed
 *  reset link. Standalone page: rendered by App.tsx before any auth
 *  provider so an unauthenticated user can complete the flow.
 *
 *  Router: path-driven (matches the existing /scan, /shop patterns).
 *  On success we redirect to '/' so the user lands on the login card. */
export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setBusy(false);
    }
  };

  const tokenMissing = !token;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <img src={imgBrandLogo} alt="SMRT HRSM" className="h-14 w-auto object-contain" draggable={false} />
            </div>
            <CardTitle className="text-xl">Choose a new password</CardTitle>
            <CardDescription>
              {tokenMissing
                ? 'This reset link is missing its token.'
                : done
                  ? 'Your password has been reset.'
                  : 'Enter a new password for your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenMissing && (
              <p className="text-sm text-red-600">
                Please open the link from your email — the URL should end in <code>?token=…</code>.
              </p>
            )}
            {!tokenMissing && !done && (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reset password
                </Button>
              </form>
            )}
            {done && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm">Password updated. You can sign in now.</span>
                </div>
                <Button className="w-full" onClick={() => { window.location.href = '/'; }}>
                  Go to sign in
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
