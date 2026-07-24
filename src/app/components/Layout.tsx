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
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Badge } from './ui/badge';
import { NAV_GROUPS, NAV_LEAVES } from '../config/nav';
import { appIconColor } from '../utils/appColors';
import { DesktopApiModeBadge } from './DesktopApiModeBadge';
import { isTauri } from '../utils/runtime';
// Sidebar brand assets — wide wordmark when the sidebar is expanded,
// square app icon when collapsed. Same files that back the landing
// nav and the Tauri desktop shell so the identity stays coherent
// wherever the tenant lands.
import imgBrandLogo from '../../imports/smrt-web-logo1.png';
import imgAppIcon   from '../../imports/smrt-app-icon.png';

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
  const { currentUser, currentEmployee, canView, isModuleAvailable, hasActiveAgency, logout } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /** Foldable sidebar — when true, the desktop sidebar shrinks to an
   *  icon-only rail. Persisted to localStorage so the operator's
   *  preference survives a refresh / tab close. Off by default on
   *  first visit so new users see the labelled menu. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('hrms:sidebarCollapsed') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('hrms:sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  /** Combined visibility check: leaf passes when the role can view
   *  its permission module (role_permissions) AND the Super Admin
   *  catalog says the module is available + tenant-enabled. The same
   *  module key drives both gates — they're orthogonal axes (role-
   *  scoped vs tenant-scoped) but answer the same question from
   *  different sides.
   *
   *  AND requireAlso[]: extra modules that must ALSO clear both gates.
   *  Use this when a sub-setting only makes sense alongside a parent
   *  business module (Attendance Settings + Attendance, etc.). */
  const isLeafVisible = (l: typeof NAV_LEAVES[number]) =>
    !l.hideFromSidebar
    && canView(l.module)
    && isModuleAvailable(l.module)
    && (l.requireAlso ?? []).every(m => canView(m) && isModuleAvailable(m))
    && (l.requireFeature !== 'has-active-agency' || hasActiveAgency());

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
  // 'dashboard' when their role doesn't grant it, or dashboard
  // disabled at the tenant level), redirect them to the first leaf
  // they CAN see. Deps are the full tree + currentView, not just
  // .length — otherwise a leaf change that keeps total count identical
  // (or a redirect that races with tenant-module hydration) leaves
  // the user stranded on Access denied.
  //
  // Belt-and-suspenders with the App.tsx firstAllowedId redirect
  // (v-first-allowed-view-redirect): App handles the direct render
  // path, this catches downstream sidebar visibility drift.
  useEffect(() => {
    if (visibleTree.length === 0) return;
    const allLeaves = visibleTree.flatMap(item => item.children ?? [item]);
    const firstAllowed = allLeaves[0];
    if (!firstAllowed) return;
    const matchesCurrent = allLeaves.some(l => l.id === currentView);
    if (!matchesCurrent) onViewChange(firstAllowed.id);
  }, [visibleTree, currentView, onViewChange]);

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
      {/* Sidebar — full height. On desktop (lg+) it can fold to an
          icon-only rail; on mobile it slides in/out off-canvas. */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 bg-white border-r transform transition-all duration-200 ease-in-out overflow-y-auto flex flex-col
          ${sidebarCollapsed ? 'lg:w-16' : 'w-64'}
          ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className={`flex items-center gap-2 h-16 border-b shrink-0 ${sidebarCollapsed ? 'lg:justify-center px-2' : 'px-4'}`}>
          {sidebarCollapsed ? (
            // Collapsed rail — square app icon fits the narrow strip.
            <img
              src={imgAppIcon}
              alt="SMRT HRSM"
              className="h-9 w-9 object-contain rounded-lg shrink-0"
              draggable={false}
            />
          ) : (
            <>
              {/* Expanded — wide wordmark fills the header. Height caps
                  at the row's inner space so it never pushes the border
                  down. */}
              <img
                src={imgBrandLogo}
                alt="SMRT HRSM 360°"
                className="h-9 w-auto object-contain shrink-0"
                draggable={false}
              />
              {/* Fold toggle sits at the right edge — anchored via
                  ml-auto so it stays put regardless of the wordmark's
                  actual rendered width. */}
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex h-8 w-8 ml-auto shrink-0"
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <nav className={`p-2 space-y-1 flex-1 overflow-y-auto ${sidebarCollapsed ? 'lg:p-2' : 'lg:p-4'}`}>
          <TooltipProvider delayDuration={120}>
          {/* When collapsed, surface the Expand toggle as the first
              icon in the rail so the user can always restore the
              sidebar without hunting. Hidden in expanded mode where
              the brand-row carries the Collapse button. */}
          {sidebarCollapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-center px-0"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          )}
          {visibleTree.map((item) => {
            const Icon = item.icon;
            if (!item.children) {
              const iconColor = appIconColor(item.id);
              const btn = (
                <Button
                  key={item.id}
                  variant={currentView === item.id ? 'secondary' : 'ghost'}
                  className={sidebarCollapsed ? 'w-full justify-center px-0' : 'w-full justify-start'}
                  onClick={() => handleMenuClick(item.id)}
                  aria-label={item.label}
                >
                  <Icon className={`h-4 w-4 ${iconColor} ${sidebarCollapsed ? '' : 'mr-2'}`} />
                  {!sidebarCollapsed && item.label}
                  {!sidebarCollapsed && AUTO_NAV_IDS.has(item.id) && <AutoTag />}
                </Button>
              );
              return sidebarCollapsed ? (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : btn;
            }
            const isOpen = openGroup === item.id;
            const hasActiveChild = item.children.some(c => c.id === currentView);
            // When collapsed, clicking a group opens the sidebar and
            // expands that group in one action — saves a chained click.
            const groupClick = () => {
              if (sidebarCollapsed) {
                setSidebarCollapsed(false);
                setOpenGroup(item.id);
              } else {
                toggleExpanded(item.id);
              }
            };
            const groupBtn = (
              <Button
                variant={isOpen || hasActiveChild ? 'secondary' : 'ghost'}
                className={sidebarCollapsed ? 'w-full justify-center px-0' : 'w-full justify-start'}
                onClick={groupClick}
                aria-label={item.label}
              >
                <Icon className={`h-4 w-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
                {!sidebarCollapsed && (
                  <>
                    {item.label}
                    {isOpen ? (
                      <ChevronDown className="ml-auto h-4 w-4" />
                    ) : (
                      <ChevronRight className="ml-auto h-4 w-4" />
                    )}
                  </>
                )}
              </Button>
            );
            return (
              <div key={item.id}>
                {sidebarCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{groupBtn}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : groupBtn}
                {!sidebarCollapsed && isOpen && (
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
          </TooltipProvider>
        </nav>
      </aside>

      {/* Right side: Top nav + Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <div className="bg-white border-b shrink-0">
          <div className="flex items-center px-4 h-16 gap-2 min-w-0">
            <div className="flex items-center gap-4 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>

            {/* v-topbar-scroll-x — action cluster overflowed the viewport
                on mobile (attendance widget + bell + language + role
                badge + avatar), clipping the avatar dropdown out of
                reach. Same horizontal-scroll pattern the Items filter
                strip uses: single row that slides left/right, hidden
                scrollbar with hover-reveal on desktop, native momentum
                scroll on touch. Every direct child needs shrink-0 so
                the row grows past the container instead of squishing. */}
            <div className="flex-1 min-w-0 flex items-center justify-end gap-3 overflow-x-auto hover-scroll-x [&>*]:shrink-0">
              {/* Self check-in widget — asks for location once on
                  mount, then shows Check-In or Check-Out depending
                  on whether the employee is in-range + has punched
                  yet today. Hidden for super_admin (they don't
                  belong to any tenant's office). */}
              {currentUser?.role !== 'super_admin' && <AttendanceCheckInWidget />}
              <AppLauncher currentView={currentView} onSelect={handleMenuClick} />
              {/* v-tenant-freeze — compact frozen-mode indicator.
                  Replaces the full-width banner: an amber pill in
                  the top-bar action strip with the full explanation
                  on hover. Only rendered when the tenant is frozen. */}
              {currentUser?.tenantStatus === 'frozen' && (
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 h-8 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium cursor-help print:hidden"
                        aria-label="Read-only mode"
                      >
                        <span aria-hidden>❄</span>
                        <span className="hidden sm:inline">Read-only</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="text-xs font-medium mb-1">Read-only mode</p>
                      <p className="text-[11px] leading-relaxed">
                        This company has been frozen by an administrator. You can view but not create, update, or delete.
                      </p>
                      {currentUser.tenantFrozenUntil && (
                        <p className="text-[11px] leading-relaxed mt-1">
                          Auto-unfreezes on {new Date(currentUser.tenantFrozenUntil).toLocaleDateString()}.
                        </p>
                      )}
                      {currentUser.tenantFrozenReason && (
                        <p className="text-[11px] leading-relaxed mt-1 opacity-80">
                          Reason: {currentUser.tenantFrozenReason}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Notification bell (V127). Hidden for super_admin —
                  they don't subscribe to tenant announcements. */}
              {currentUser?.role !== 'super_admin' && <NotificationsBell />}
              {isTauri() && <DesktopApiModeBadge />}
              <LanguageSwitcher />
              <Badge variant="secondary" className={getRoleBadgeColor(currentUser?.role || '')}>
                {prettyRoleLabel(currentUser?.role, t)}
              </Badge>
              {(() => {
                // Avatar / dropdown identity — falls through when the
                // Admin has no linked Employee (valid state since
                // v-admin-optional-employee). Preference order:
                //   1. Employee name (has family + given → nicer initials)
                //   2. Explicit user.name from /auth/me
                //   3. Email local-part
                //   4. Literal "?" so the circle isn't just a grey blob.
                const displayName =
                  (currentEmployee?.name?.trim())
                  || (currentUser?.name?.trim())
                  || (currentUser?.email?.split('@')[0] ?? '')
                  || 'User';
                const displayEmail = currentEmployee?.email || currentUser?.email || '';
                const initials = displayName
                  .split(/\s+/)
                  .map(part => part[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || '?';
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar>
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm">{displayName}</p>
                          <p className="text-xs text-gray-500">{displayEmail}</p>
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
                );
              })()}
            </div>
          </div>
        </div>

        {/* Main Content.
            v-mobile-no-horizontal-scroll — `min-w-0 overflow-x-hidden`
            keep the page body pinned to viewport width on mobile.
            Wide children (tables, wide grids) get clipped here and
            must scroll INSIDE their own `overflow-x-auto` container
            (the shared shadcn <Table> already ships that wrapper).
            Without this, a wide table would push the whole page
            sideways, shifting the sidebar toggle + top nav out of
            view when the user swipes to scroll the table. */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto min-w-0 overflow-x-hidden">
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

/** Resolve the role badge label. Built-in keys (admin/manager/employee/
 *  super_admin) translate via i18n; custom-role keys (e.g. 'custom-gm')
 *  have no translation entry, so the i18n lookup returns the raw key —
 *  we strip the `custom-` prefix and title-case the slug. Prevents the
 *  badge from reading 'ROLE.CUSTOM-GM' for tenant-defined roles. */
function prettyRoleLabel(roleKey: string | undefined, t: (k: string) => string): string {
  const key = roleKey ?? 'employee';
  const translated = t(`role.${key}`);
  // i18n returns the raw key when no entry exists — that's our cue
  // to fall back to a humanised version of the slug.
  if (translated && translated !== `role.${key}`) return translated.toUpperCase();
  const slug = key.startsWith('custom-') ? key.slice('custom-'.length) : key;
  return slug.replace(/[-_]+/g, ' ').toUpperCase();
}