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
  ScrollText, Database, LogOut, Menu, X, UserCog, Layers, Settings,
  ChevronRight, ChevronDown, DollarSign, CalendarDays, Bot, ClipboardList,
} from 'lucide-react';
import { UserProfileDialog } from '../../common/UserProfileDialog';
import { LanguageSwitcher } from '../../common/LanguageSwitcher';
import { useI18n } from '../../../i18n/I18nContext';

export type SuperAdminView =
  | 'dashboard' | 'companies' | 'plans' | 'users' | 'sync' | 'tenant_modules' | 'surveys'
  // Settings sub-menu
  | 'activity' | 'backups' | 'policy' | 'payroll_categories' | 'holidays' | 'system_holidays' | 'module_categories'
  | 'platform_telegram';

interface Props {
  children: ReactNode;
  currentView: SuperAdminView;
  onViewChange: (view: SuperAdminView) => void;
}

type LeafItem = {
  kind: 'leaf';
  id: SuperAdminView;
  icon: typeof LayoutDashboard;
  label: string;
  description: string;
};

type GroupItem = {
  kind: 'group';
  id: string;
  icon: typeof LayoutDashboard;
  label: string;
  description: string;
  children: LeafItem[];
};

type MenuNode = LeafItem | GroupItem;

/** Sub-menu ids that live under the Settings parent. Used both to
 *  build the nested nav and to keep Settings expanded automatically
 *  whenever one of its children is the active view. */
const SETTINGS_CHILDREN: SuperAdminView[] = [
  'module_categories', 'payroll_categories', 'holidays', 'system_holidays',
  'activity', 'backups', 'policy', 'platform_telegram',
];

export function SuperAdminLayout({ children, currentView, onViewChange }: Props) {
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Keep Settings auto-expanded when the active view is one of its
  // children so HR doesn't lose context after a deep-link reload.
  const [settingsOpen, setSettingsOpen] = useState(
    SETTINGS_CHILDREN.includes(currentView),
  );

  const MENU: MenuNode[] = [
    { kind: 'leaf', id: 'dashboard', icon: LayoutDashboard,
      label: t('nav.platform.dashboard'), description: t('nav.platform.dashboard.desc') },
    { kind: 'leaf', id: 'companies', icon: Building2,
      label: t('nav.platform.companies'), description: t('nav.platform.companies.desc') },
    { kind: 'leaf', id: 'plans', icon: Layers,
      label: t('nav.platform.plans'), description: t('nav.platform.plans.desc') },
    { kind: 'leaf', id: 'users', icon: UsersRound,
      label: t('nav.platform.users'), description: t('nav.platform.users.desc') },
    { kind: 'leaf', id: 'sync', icon: Link2,
      label: t('nav.platform.sync'), description: t('nav.platform.sync.desc') },
    { kind: 'leaf', id: 'tenant_modules', icon: SlidersHorizontal,
      label: t('nav.platform.tenantmodules'), description: t('nav.platform.tenantmodules.desc') },
    // V170 — inbound landing-form inquiries. Top-level leaf so it's a
    // first-class part of the sales workflow, not buried under Settings.
    { kind: 'leaf', id: 'surveys', icon: ClipboardList,
      label: 'Requirement Surveys',
      description: 'Inbound customer inquiries from the landing form.' },
    {
      kind: 'group', id: 'settings', icon: Settings,
      label: t('nav.platform.settings'),
      description: t('nav.platform.settings.desc'),
      children: [
        { kind: 'leaf', id: 'module_categories', icon: Layers,
          label: t('nav.platform.modulecat'), description: t('nav.platform.modulecat.desc') },
        { kind: 'leaf', id: 'payroll_categories', icon: DollarSign,
          label: t('nav.platform.payrollcat'), description: t('nav.platform.payrollcat.desc') },
        { kind: 'leaf', id: 'holidays', icon: CalendarDays,
          label: t('nav.platform.holidays'), description: t('nav.platform.holidays.desc') },
        { kind: 'leaf', id: 'system_holidays', icon: CalendarDays,
          label: 'System Holidays',
          description: 'Shared catalog every tenant sees and can copy from.' },
        { kind: 'leaf', id: 'activity', icon: ScrollText,
          label: t('nav.platform.activity'), description: t('nav.platform.activity.desc') },
        // Backups leaf hidden — the DBA takes snapshots outside the app
        // (nightly pg_dump + retention on the host), and surfacing a
        // half-wired "restore" button in the UI implied a self-service
        // capability we don't actually offer. Keep the view mounted in
        // SuperAdminApp routing so a saved deep-link doesn't 404; just
        // stop advertising it in the sidebar.
        { kind: 'leaf', id: 'policy', icon: SlidersHorizontal,
          label: t('nav.platform.policy'), description: t('nav.platform.policy.desc') },
        { kind: 'leaf', id: 'platform_telegram', icon: Bot,
          label: t('nav.platform.telegram'), description: t('nav.platform.telegram.desc') },
      ],
    },
  ];

  const handleNav = (id: SuperAdminView) => {
    onViewChange(id);
    setSidebarOpen(false);
  };

  /** Resolve the friendly label + description for the top-bar title.
   *  Walks both leaves and group children so a sub-item lands the right
   *  header even though it isn't at the top of MENU. */
  const activeMeta = (() => {
    for (const node of MENU) {
      if (node.kind === 'leaf' && node.id === currentView) return node;
      if (node.kind === 'group') {
        for (const child of node.children) {
          if (child.id === currentView) {
            return { label: `${node.label} · ${child.label}`, description: child.description };
          }
        }
      }
    }
    return { label: '', description: '' };
  })();

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
          {MENU.map((node) => {
            if (node.kind === 'leaf') {
              const active = currentView === node.id;
              const Icon = node.icon;
              return (
                <button
                  key={node.id}
                  onClick={() => handleNav(node.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors
                    ${active
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                      : 'text-slate-200 hover:bg-slate-800 border border-transparent'}
                  `}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-sm flex-1 min-w-0 truncate">{node.label}</span>
                </button>
              );
            }
            // Group — expandable parent (Settings)
            const expanded = settingsOpen || node.children.some(c => c.id === currentView);
            const Icon = node.icon;
            const groupActive = node.children.some(c => c.id === currentView);
            return (
              <div key={node.id}>
                <button
                  onClick={() => setSettingsOpen(o => !o)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors
                    ${groupActive
                      ? 'text-amber-200 border border-amber-500/30 bg-amber-500/5'
                      : 'text-slate-200 hover:bg-slate-800 border border-transparent'}
                  `}
                  aria-expanded={expanded}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${groupActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-sm flex-1 min-w-0 truncate">{node.label}</span>
                  {expanded
                    ? <ChevronDown className="h-4 w-4 text-slate-400" />
                    : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </button>
                {expanded && (
                  <div className="mt-1 ml-3 pl-3 border-l border-slate-700 space-y-1">
                    {node.children.map((child) => {
                      const active = currentView === child.id;
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.id}
                          onClick={() => handleNav(child.id)}
                          className={`
                            w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors
                            ${active
                              ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                              : 'text-slate-200 hover:bg-slate-800 border border-transparent'}
                          `}
                        >
                          <ChildIcon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-500'}`} />
                          <span className="text-sm flex-1 min-w-0 truncate">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
                <h1 className="text-sm font-semibold capitalize">{activeMeta.label}</h1>
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
