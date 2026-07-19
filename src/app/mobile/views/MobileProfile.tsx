import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { LogOut, Mail, Building2, IdCard, ShieldCheck } from 'lucide-react';

/**
 * Profile tab — current user info + logout. Reads from the same
 * {@link AuthContext} the desktop uses, so profile edits made on the
 * web (name, avatar) propagate straight into this view without a
 * separate fetch. Logout hits the shared endpoint and drops the shell
 * back to {@link MobileLogin} on the next render.
 */
export function MobileProfile() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  return (
    <div className="p-5 space-y-6">
      <header className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-100 to-emerald-100 flex items-center justify-center text-2xl font-bold text-blue-700">
          {(currentUser.name ?? currentUser.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{currentUser.name ?? '—'}</h1>
          <p className="text-sm text-gray-500 truncate">{currentUser.email ?? ''}</p>
        </div>
      </header>

      <section className="rounded-lg border bg-white divide-y">
        <Row icon={IdCard}       label="Employee ID" value={currentUser.employeeId ?? '—'} />
        <Row icon={ShieldCheck}  label="Role"        value={currentUser.role ?? '—'} />
        <Row icon={Mail}         label="Email"       value={currentUser.email ?? '—'} />
        <Row icon={Building2}    label="Tenant"      value={currentUser.tenantId?.slice(0, 8) ?? '—'} />
      </section>

      <Button
        variant="outline"
        onClick={logout}
        className="w-full h-11 text-base border-red-200 text-red-700 hover:bg-red-50"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
        <Icon className="h-4 w-4 text-blue-600" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}
