import { ReactNode, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../ui/button';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  Shield, LayoutDashboard, Building2, UsersRound, Link2, SlidersHorizontal,
  ScrollText, Database, LogOut, Menu, X, UserCog,
} from 'lucide-react';
import { UserProfileDialog } from '../../common/UserProfileDialog';
import { LanguageSwitcher } from '../../common/LanguageSwitcher';
import { useI18n } from '../../../i18n/I18nContext';

export type SuperAdminView = 'dashboard' | 'companies' | 'users' | 'sync' | 'activity' | 'backups' | 'policy';

interface Props {
  children: ReactNode;
  currentView: SuperAdminView;
  onViewChange: (view: SuperAdminView) => void;
}

const MENU_ITEMS: { id: SuperAdminView; icon: typeof LayoutDashboard; tKey: string; tDesc: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard,   tKey: 'nav.platform.dashboard', tDesc: 'nav.platform.dashboard.desc' },
  { id: 'companies', icon: Building2,         tKey: 'nav.platform.companies', tDesc: 'nav.platform.companies.desc' },
  { id: 'users',     icon: UsersRound,        tKey: 'nav.platform.users',     tDesc: 'nav.platform.users.desc' },
  { id: 'sync',      icon: Link2,             tKey: 'nav.platform.sync',      tDesc: 'nav.platform.sync.desc' },
  { id: 'activity',  icon: ScrollText,        tKey: 'nav.platform.activity',  tDesc: 'nav.platform.activity.desc' },
  { id: 'backups',   icon: Database,          tKey: 'nav.platform.backups',   tDesc: 'nav.platform.backups.desc' },
  { id: 'policy',    icon: SlidersHorizontal, tKey: 'nav.platform.policy',    tDesc: 'nav.platform.policy.desc' },
];

export function SuperAdminLayout({ children, currentView, onViewChange }: Props) {
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const MENU = MENU_ITEMS.map(m => ({ ...m, label: t(m.tKey), description: t(m.tDesc) }));

  const handleNav = (id: SuperAdminView) => {
    onViewChange(id);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 bg-slate-900 text-slate-100 border-r border-slate-800
          transform transition-transform duration-200 ease-in-out overflow-y-auto flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-slate-800 shrink-0">
          <div className="p-1.5 bg-amber-500/20 rounded-md">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{t('brand.platform')}</p>
            <p className="text-[10px] uppercase tracking-wide text-amber-400">{t('header.super_admin')}</p>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {MENU.map((item) => {
            const active = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`
                  w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors
                  ${active
                    ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                    : 'text-slate-200 hover:bg-slate-800 border border-transparent'}
                `}
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.label}</p>
                  <p className={`text-[11px] truncate ${active ? 'text-amber-300/70' : 'text-slate-500'}`}>
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400">
          Control plane v0.1 · Build 20260421
        </div>
      </aside>

      {/* Right side */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b shrink-0">
          <div className="flex items-center justify-between px-4 h-16">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              <div>
                <h1 className="text-sm font-semibold capitalize">
                  {MENU.find(m => m.id === currentView)?.label}
                </h1>
                <p className="text-xs text-gray-500">
                  {MENU.find(m => m.id === currentView)?.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Badge className="bg-amber-100 text-amber-900 border border-amber-300 gap-1">
                <Shield className="h-3 w-3" />
                {t('header.platform')}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar>
                      <AvatarFallback className="bg-amber-100 text-amber-900">SA</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm">{t('header.super_admin')}</p>
                      <p className="text-xs text-gray-500">{currentUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                    <UserCog className="mr-2 h-4 w-4" />
                    {t('header.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('header.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
