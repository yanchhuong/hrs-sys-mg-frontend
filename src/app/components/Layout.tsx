import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { UserProfileDialog } from './common/UserProfileDialog';
import { LanguageSwitcher } from './common/LanguageSwitcher';
import { AppLauncher } from './common/AppLauncher';
import { NotificationsBell } from './common/NotificationsBell';
import { AttendanceCheckInWidget } from './common/AttendanceCheckInWidget';
import { useI18n } from '../i18n/I18nContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { NAV_GROUPS, NAV_LEAVES } from '../config/nav';
import { appIconColor } from '../utils/appColors';

interface LayoutProps {
  children: ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
}

interface MenuNode {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Permission module key (matches backend `role_permissions.module`). */
  module?: string;
  children?: MenuNode[];          // absent = leaf; present = group
}

/**
 * Sidebar entries whose values feed the auto-payroll generator (Tax /
 * NSSF / 1st Salary / seniority math run from these inputs without HR
 * needing to fill them on a spreadsheet). We render a small gold
 * "(Auto)" tag next to the label so HR knows entering data here flows
 * straight into Generate Payroll.
 */
const AUTO_NAV_IDS = new Set(['increase', 'deduction', 'overtime']);

function AutoTag() {
  return (
    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-500 font-semibold">
      (Auto)
    </span>
  );
}

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { currentUser, currentEmployee, canView, isModuleAvailable, logout } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  /** Combined visibility check: leaf passes when the role can view
   *  its permission module (role_permissions) AND the Super Admin
   *  catalog says the module is available + tenant-enabled. The same
   *  module key drives both gates — they're orthogonal axes (role-
   *  scoped vs tenant-scoped) but answer the same question from
   *  different sides. */
  const isLeafVisible = (l: typeof NAV_LEAVES[number]) =>
    !l.hideFromSidebar
    && canView(l.module)
    && isModuleAvailable(l.module);

  const visibleTree = useMemo<MenuNode[]>(() => {
    // Each leaf maps to a permission `module` matching the role-permissions
    // matrix configured in User Management → Permissions. Group nodes
    // (parents) are auto-hidden when none of their children are visible.
    //
    // Source of truth is `config/nav.ts` — both Layout and App consume the
    // same registry so the sidebar, the routing, and the access guards can
    // never drift apart.
    const groupOrder = NAV_GROUPS.map(g => g.id);
    const groupedLeaves = NAV_GROUPS.reduce((acc, g) => {
      acc[g.id] = [];
      return acc;
    }, {} as Record<string, MenuNode[]>);
    const topLeaves: MenuNode[] = [];

    NAV_LEAVES.forEach(l => {
      if (!isLeafVisible(l)) return;
      const node: MenuNode = {
        id: l.id,
        label: t(l.labelKey),
        icon: l.icon,
        module: l.module,
      };
      if (l.group && groupedLeaves[l.group]) groupedLeaves[l.group].push(node);
      else topLeaves.push(node);
    });

    // Interleave top-level leaves and groups in the original NAV_LEAVES order
    // so the sidebar reads naturally. Each group is emitted once at the
    // position of its first child.
    const seenGroups = new Set<string>();
    const ordered: MenuNode[] = [];
    NAV_LEAVES.forEach(l => {
      if (!isLeafVisible(l)) return;
      if (l.group) {
        if (seenGroups.has(l.group)) return;
        seenGroups.add(l.group);
        const groupMeta = NAV_GROUPS.find(g => g.id === l.group);
        if (!groupMeta) return;
        const children = groupedLeaves[l.group];
        if (children.length === 0) return;
        ordered.push({
          id: groupMeta.id,
          label: t(groupMeta.labelKey),
          icon: groupMeta.icon,
          children,
        });
      } else {
        const found = topLeaves.find(t => t.id === l.id);
        if (found) ordered.push(found);
      }
    });
    void groupOrder;
    return ordered;
    // isModuleAvailable is captured through isLeafVisible's closure;
    // referenced here so the deps array signals re-renders when the
    // catalog or per-tenant disabled set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, isModuleAvailable, t]);

  // If the user lands on a view they're not allowed to see (default
  // 'dashboard' when their role doesn't grant it), redirect them to the
  // first leaf they CAN see. Avoids the empty-page-with-403-toast confusion
  // the screenshot showed for the Approver role.
  useEffect(() => {
    if (visibleTree.length === 0) return;
    const allLeaves = visibleTree.flatMap(item => item.children ?? [item]);
    const firstAllowed = allLeaves[0];
    if (!firstAllowed) return;
    const matchesCurrent = allLeaves.some(l => l.id === currentView);
    if (!matchesCurrent) onViewChange(firstAllowed.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTree.length]);

  // Accordion behaviour: at most one group open at a time. Opening a different
  // group closes whichever was previously open.
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const match = visibleTree.find(g => g.children?.some(c => c.id === currentView));
    return match ? match.id : null;
  });
  useEffect(() => {
    const match = visibleTree.find(g => g.children?.some(c => c.id === currentView));
    if (match) setOpenGroup(match.id);
  }, [currentView, visibleTree]);
  const toggleExpanded = (id: string) => setOpenGroup(prev => (prev === id ? null : id));

  const handleMenuClick = (itemId: string) => {
    onViewChange(itemId);
    setSidebarOpen(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 hover:bg-red-100';
      case 'manager':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      default:
        return 'bg-green-100 text-green-800 hover:bg-green-100';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar - Full Height */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out overflow-y-auto flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
          <div className="p-2 bg-blue-600 rounded-lg">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg">{t('brand.hrms')}</span>
        </div>
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {visibleTree.map((item) => {
            const Icon = item.icon;
            if (!item.children) {
              const iconColor = appIconColor(item.id);
              return (
                <Button
                  key={item.id}
                  variant={currentView === item.id ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => handleMenuClick(item.id)}
                >
                  <Icon className={`mr-2 h-4 w-4 ${iconColor}`} />
                  {item.label}
                  {AUTO_NAV_IDS.has(item.id) && <AutoTag />}
                </Button>
              );
            }
            const isOpen = openGroup === item.id;
            const hasActiveChild = item.children.some(c => c.id === currentView);
            return (
              <div key={item.id}>
                <Button
                  variant={isOpen || hasActiveChild ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => toggleExpanded(item.id)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {isOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </Button>
                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.children.map((sub) => {
                      const SubIcon = sub.icon;
                      const subColor = appIconColor(sub.id);
                      return (
                        <Button
                          key={sub.id}
                          variant={currentView === sub.id ? 'secondary' : 'ghost'}
                          className="w-full justify-start text-sm"
                          size="sm"
                          onClick={() => handleMenuClick(sub.id)}
                        >
                          <SubIcon className={`mr-2 h-3 w-3 ${subColor}`} />
                          {sub.label}
                          {AUTO_NAV_IDS.has(sub.id) && <AutoTag />}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Right side: Top nav + Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <div className="bg-white border-b shrink-0">
          <div className="flex items-center justify-between px-4 h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {/* Self check-in widget — asks for location once on
                  mount, then shows Check-In or Check-Out depending
                  on whether the employee is in-range + has punched
                  yet today. Hidden for super_admin (they don't
                  belong to any tenant's office). */}
              {currentUser?.role !== 'super_admin' && <AttendanceCheckInWidget />}
              <AppLauncher currentView={currentView} onSelect={handleMenuClick} />
              {/* Notification bell (V127). Hidden for super_admin —
                  they don't subscribe to tenant announcements. */}
              {currentUser?.role !== 'super_admin' && <NotificationsBell />}
              <LanguageSwitcher />
              <Badge variant="secondary" className={getRoleBadgeColor(currentUser?.role || '')}>
                {t(`role.${currentUser?.role ?? 'employee'}`).toUpperCase()}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar>
                      <AvatarFallback>
                        {currentEmployee?.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm">{currentEmployee?.name}</p>
                      <p className="text-xs text-gray-500">{currentEmployee?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                    <UserCog className="mr-2 h-4 w-4" />
                    <span>{t('header.profile')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t('header.logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Overlay */}
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