import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Loader2, Smartphone } from 'lucide-react';

/**
 * Tablet-optimized sign-in screen for the {@code /mobile} shell.
 * Larger inputs, a single centered card, softer palette — same auth
 * endpoint as the desktop {@code LoginPage}, so a successful sign-in
 * hydrates the shared {@link AuthContext} and the shell mounts on the
 * next render without a redirect.
 */
export function MobileLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const res = await login(email, password);
      if (!res.success) {
        toast.error(res.error ?? 'Sign in failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-8 pb-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
              <Smartphone className="h-7 w-7 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold">Sign In</h1>
            <p className="text-sm text-gray-500">
              Sign in to your account to access the mobile workspace.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                className="h-12 text-base"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 text-base"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-base"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in…
                </>
              ) : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
