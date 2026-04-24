import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USE_MOCKS } from '../api/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { UserRole } from '../types/hrms';
import { Building2, Shield, Users, User, Loader2 } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, switchRole } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email, password);
      if (!res.success) setError(res.error ?? 'Invalid credentials');
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
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-600 rounded-full">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">HRMS Portal</CardTitle>
          <CardDescription>Human Resource Management System</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@company.com"
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

          <div className="text-xs text-gray-500 space-y-2">
            <p className="text-center">
              {USE_MOCKS ? 'Or auto-fill credentials:' : 'Seeded demo credentials:'}
            </p>
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
        </CardContent>
      </Card>
    </div>
  );
}