/**
 * Single source of truth for the app's navigation + view registry.
 *
 * Each entry binds together a stable `id` (used for the active-view state),
 * the permission `module` it gates on (matched against role_permissions in the
 * backend), the React component to render, and the sidebar metadata
 * (label, icon, optional parent group).
 *
 * Both `<Layout>` and `<App>` consume this single list:
 *   – Layout filters it by `canView(module)` to build the sidebar.
 *   – App resolves `currentView` to the entry's component and renders it
 *     when permitted.
 *
 * To add a new page:
 *   1. Append a `NavLeaf` entry here with the right `module`.
 *   2. (No other change needed — Layout shows it, App routes to it,
 *      and the permission matrix gates it.)
 */

import { ComponentType } from 'react';
import {
  LayoutDashboard, Users, Clock, TimerIcon, DollarSign, AlertCircle,
  Minus, TrendingUp, BarChart3, Settings, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { Dashboard } from '../components/views/Dashboard';
import { Employees } from '../components/views/Employees';
import { Attendance } from '../components/views/Attendance';
import { Overtime } from '../components/views/Overtime';
import { Payroll } from '../components/views/Payroll';
import { UserManagement } from '../components/views/UserManagement';
import { Settings as SettingsView } from '../components/views/Settings';
import { AllLeave } from '../components/views/AllLeave';
import { Exception } from '../components/views/Exception';
import { Deduction } from '../components/views/Deduction';
import { Increase } from '../components/views/Increase';
import { AttendanceSettings } from '../components/views/AttendanceSettings';
import { EmployeeSettings } from '../components/views/EmployeeSettings';
import { PayrollCategorySettings } from '../components/views/PayrollCategorySettings';
import { Reports } from '../components/views/Reports';

export interface NavLeaf {
  id: string;
  /** Translation key for the sidebar label. */
  labelKey: string;
  icon: LucideIcon;
  /** Permission module key (matches backend `role_permissions.module`). */
  module: string;
  component: ComponentType;
  /** Optional group id — leaves with the same group are nested in the sidebar. */
  group?: string;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  icon: LucideIcon;
}

/** Sidebar groups (collapsible parent menus). */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'time-tracking',  labelKey: 'nav.time_tracking', icon: Clock },
  { id: 'payroll-mgmt',   labelKey: 'nav.payroll_mgmt',  icon: DollarSign },
  { id: 'settings-group', labelKey: 'nav.setting',       icon: Settings },
];

/** All views the app exposes. Order here drives the order in the sidebar. */
export const NAV_LEAVES: NavLeaf[] = [
  { id: 'dashboard',          labelKey: 'nav.home',                  icon: LayoutDashboard, module: 'dashboard',       component: Dashboard },
  { id: 'employees',          labelKey: 'nav.employee',              icon: Users,           module: 'employees',       component: Employees },

  { id: 'attendance',         labelKey: 'nav.attendance',            icon: Clock,           module: 'attendance',      component: Attendance,    group: 'time-tracking' },
  { id: 'overtime',           labelKey: 'nav.overtime',              icon: TimerIcon,       module: 'overtime',        component: Overtime,      group: 'time-tracking' },
  { id: 'all-leave',          labelKey: 'nav.allleave',              icon: AlertCircle,     module: 'all-leave',       component: AllLeave,      group: 'time-tracking' },
  { id: 'exception',          labelKey: 'nav.exception',             icon: AlertCircle,     module: 'exception',       component: Exception,     group: 'time-tracking' },

  { id: 'payroll',            labelKey: 'nav.payroll',               icon: DollarSign,      module: 'payroll',         component: Payroll,       group: 'payroll-mgmt' },
  { id: 'increase',           labelKey: 'nav.increase',              icon: TrendingUp,      module: 'increase',        component: Increase,      group: 'payroll-mgmt' },
  { id: 'deduction',          labelKey: 'nav.deduction',             icon: Minus,           module: 'deduction',       component: Deduction,     group: 'payroll-mgmt' },

  { id: 'reports',            labelKey: 'nav.reports',               icon: BarChart3,       module: 'reports',         component: Reports },

  { id: 'settings',           labelKey: 'nav.setting.general',       icon: Settings,        module: 'settings',        component: SettingsView,            group: 'settings-group' },
  { id: 'attendance-settings',labelKey: 'nav.setting.attendance',    icon: Clock,           module: 'settings',        component: AttendanceSettings,      group: 'settings-group' },
  { id: 'employee-settings',  labelKey: 'nav.setting.empset',        icon: Briefcase,       module: 'settings',        component: EmployeeSettings,        group: 'settings-group' },
  { id: 'user-management',    labelKey: 'nav.setting.usermgmt',      icon: Users,           module: 'user-management', component: UserManagement,          group: 'settings-group' },
  { id: 'payroll-categories', labelKey: 'nav.setting.payrollcat',    icon: DollarSign,      module: 'settings',        component: PayrollCategorySettings, group: 'settings-group' },
];

/** Map for O(1) lookup by id. */
export const NAV_BY_ID: Record<string, NavLeaf> = NAV_LEAVES.reduce((acc, l) => {
  acc[l.id] = l;
  return acc;
}, {} as Record<string, NavLeaf>);
