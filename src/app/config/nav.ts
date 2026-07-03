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
  Minus, TrendingUp, BarChart3, Settings, Briefcase, Calculator,
  FileText, UserCheck, ShoppingCart, ReceiptText, ShoppingBag, FileMinus,
  Package, Boxes, Megaphone, History, ClipboardEdit, Wallet, ArrowLeftRight, Banknote,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';
import { Dashboard } from '../components/views/Dashboard';
import { Employees } from '../components/views/Employees';
import { Attendance } from '../components/views/Attendance';
import { Overtime } from '../components/views/Overtime';
import { Payroll } from '../components/views/Payroll';
import { BenefitCalculator } from '../components/views/BenefitCalculator';
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
import { Customers } from '../components/views/Customers';
import { Vendors } from '../components/views/Vendors';
import { Invoices } from '../components/views/Invoices';
import { POS } from '../components/views/POS';
import { Quotations } from '../components/views/Quotations';
import { Vouchers } from '../components/views/Vouchers';
import { Bills } from '../components/views/Bills';
import { Receipts } from '../components/views/Receipts';
import { Items } from '../components/views/Items';
import { StockMovements } from '../components/views/StockMovements';
import { Transactions } from '../components/views/Transactions';
import { CashAdvances } from '../components/views/CashAdvances';
import { Approvals } from '../components/views/Approvals';
import { StockAdjustments } from '../components/views/StockAdjustments';
import { Announcements } from '../components/views/Announcements';
import { SaleLedger, PurchaseLedger } from '../components/views/LedgerReport';
import { ProfitLossReport } from '../components/views/ProfitLossReport';
// Offices + QrDisplay are no longer registered as standalone leaves.
// Both are reached through popups on the Attendance page:
//   • Offices  → the gear-icon "Manage Offices" dialog
//   • QrDisplay → the per-row "View QR" dialog inside Manage Offices
// The component files still live under views/ — OfficesDialog and
// QrDisplayDialog import them — but they no longer back any leaf.

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
  /** Optional initial view for components that render multiple
   *  sub-pages (currently just Reports). Lets one component back
   *  several sidebar leaves without duplicating the data-fetch. */
  initialView?: string;
  /** When true, the leaf is reachable via `currentView` state +
   *  programmatic onNavigate() but is NOT rendered in the sidebar.
   *  Used for sub-pages reached from a parent page's "Settings"
   *  menu (e.g. Offices + QR Display launched from the Attendance
   *  page's gear icon). */
  hideFromSidebar?: boolean;
  /** Optional additional permission modules — leaf is visible ONLY
   *  when the role can view ALL of these (AND-semantics) on top of
   *  the primary {@link #module}. Use for sub-settings whose existence
   *  is meaningful only if the parent module is also granted: e.g.
   *  Attendance Settings (settings + attendance), Employee Settings
   *  (settings + employees). */
  requireAlso?: string[];
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
  { id: 'reports-group',  labelKey: 'nav.reports',       icon: BarChart3 },
  { id: 'sales-group',    labelKey: 'nav.sales',         icon: ShoppingCart },
  { id: 'purchases',      labelKey: 'nav.purchases',     icon: ShoppingBag },
  { id: 'stock-group',    labelKey: 'nav.stock',         icon: Boxes },
  { id: 'cashflow-group', labelKey: 'nav.cashflow',      icon: Wallet },
  { id: 'settings-group', labelKey: 'nav.setting',       icon: Settings },
];

/** All views the app exposes. Order here drives the order in the sidebar. */
export const NAV_LEAVES: NavLeaf[] = [
  { id: 'dashboard',          labelKey: 'nav.home',                  icon: LayoutDashboard, module: 'dashboard',       component: Dashboard },
  { id: 'employees',          labelKey: 'nav.employee',              icon: Users,           module: 'employees',       component: Employees },
  { id: 'announcements',      labelKey: 'nav.announcements',         icon: Megaphone,       module: 'announcements',   component: Announcements },

  { id: 'attendance',         labelKey: 'nav.attendance',            icon: Clock,           module: 'attendance',      component: Attendance,    group: 'time-tracking' },
  { id: 'overtime',           labelKey: 'nav.overtime',              icon: TimerIcon,       module: 'overtime',        component: Overtime,      group: 'time-tracking' },
  { id: 'all-leave',          labelKey: 'nav.allleave',              icon: AlertCircle,     module: 'all-leave',       component: AllLeave,      group: 'time-tracking' },
  { id: 'exception',          labelKey: 'nav.exception',             icon: AlertCircle,     module: 'exception',       component: Exception,     group: 'time-tracking' },
  // QR-attendance (V116) is *not* registered here. Office CRUD lives
  // in the OfficesDialog popup launched from the Attendance gear
  // icon, and the per-office QR lives in the QrDisplayDialog popup
  // launched from each row inside that dialog. No leaf needed.

  { id: 'payroll',            labelKey: 'nav.payroll',               icon: DollarSign,      module: 'payroll',            component: Payroll,           group: 'payroll-mgmt' },
  { id: 'benefit-calculator', labelKey: 'nav.benefit_calculator',    icon: Calculator,      module: 'benefit-calculator', component: BenefitCalculator, group: 'payroll-mgmt' },
  { id: 'increase',           labelKey: 'nav.increase',              icon: TrendingUp,      module: 'increase',        component: Increase,          group: 'payroll-mgmt' },
  { id: 'deduction',          labelKey: 'nav.deduction',             icon: Minus,           module: 'deduction',       component: Deduction,         group: 'payroll-mgmt' },

  // Reports has been split into one leaf per sub-module (V77). Each
  // leaf's `module` is the sub-module key so the Permission Matrix
  // gates them independently (a custom role can be granted Attendance
  // Report but not Compliance). Same key drives both gates: canView
  // (role permission) AND isModuleAvailable (tenant catalog).
  { id: 'attendance-report', labelKey: 'nav.reports.attendance',     icon: Clock,           module: 'attendance-report',  component: Reports, group: 'reports-group', initialView: 'attendance' },
  { id: 'payroll-report',    labelKey: 'nav.reports.payroll',        icon: DollarSign,      module: 'payroll-report',     component: Reports, group: 'reports-group', initialView: 'payroll' },
  { id: 'compliance-report', labelKey: 'nav.reports.compliance',     icon: FileText,        module: 'compliance',         component: Reports, group: 'reports-group', initialView: 'compliance' },
  // Sale / Purchase Ledger reports — gated by the parent module
  // (`invoice` / `bill`) so they show up whenever Super Admin has
  // enabled the Sale or Purchase side for the tenant, without
  // needing a separate flag in the tenant module catalog.
  { id: 'sale-ledger',       labelKey: 'nav.reports.sale_ledger',     icon: FileText,        module: 'invoice',            component: SaleLedger,     group: 'reports-group' },
  { id: 'purchase-ledger',   labelKey: 'nav.reports.purchase_ledger', icon: FileText,        module: 'bill',               component: PurchaseLedger, group: 'reports-group' },
  // Profit & Loss — pulls income from the Sale side and expenses from
  // the Purchase side. Gated on `invoice` for visibility (matches Sale
  // Ledger); the backend additionally requires bill.view so a Sales-
  // only user can't see the expense numbers.
  { id: 'profit-loss',       labelKey: 'nav.reports.profit_loss',     icon: TrendingUp,      module: 'invoice',            component: ProfitLossReport, group: 'reports-group' },

  { id: 'customers',         labelKey: 'nav.customers',              icon: UserCheck,       module: 'customer',           component: Customers,                group: 'sales-group' },
  { id: 'quotations',        labelKey: 'nav.quotations',             icon: FileText,        module: 'quotation',          component: Quotations,               group: 'sales-group' },
  { id: 'invoices',          labelKey: 'nav.invoices',               icon: ReceiptText,     module: 'invoice',            component: Invoices,                 group: 'sales-group' },
  // POS (V130). Counter-style sale that spawns a Commercial / Tax
  // invoice on checkout — sits next to Invoices so the cashier can
  // jump between counter sales and the invoice ledger without
  // switching context.
  { id: 'pos',               labelKey: 'nav.pos',                    icon: ShoppingCart,    module: 'pos',                component: POS,                      group: 'sales-group' },
  { id: 'vouchers',          labelKey: 'nav.vouchers',               icon: FileText,        module: 'voucher',            component: Vouchers,                 group: 'sales-group' },

  { id: 'vendors',           labelKey: 'nav.vendors',                icon: UserCheck,       module: 'vendor',             component: Vendors,                  group: 'purchases' },
  { id: 'bills',             labelKey: 'nav.bills',                  icon: FileMinus,       module: 'bill',               component: Bills,                    group: 'purchases' },
  { id: 'receipts',          labelKey: 'nav.receipts',               icon: FileText,        module: 'receipt',            component: Receipts,                 group: 'purchases' },

  { id: 'items',             labelKey: 'nav.items',                  icon: Package,         module: 'stock',              component: Items,                    group: 'stock-group' },
  { id: 'stock-movement',    labelKey: 'nav.stock.movement',         icon: History,         module: 'movement',           component: StockMovements,           group: 'stock-group' },
  { id: 'stock-adjustment',  labelKey: 'nav.stock.adjustment',       icon: ClipboardEdit,   module: 'adjustment',         component: StockAdjustments,         group: 'stock-group' },
  { id: 'transactions',      labelKey: 'nav.cashflow.transactions',  icon: ArrowLeftRight,  module: 'transaction',        component: Transactions,             group: 'cashflow-group' },
  { id: 'cash-advances',     labelKey: 'nav.cashflow.advance',       icon: Banknote,        module: 'cashadvance',        component: CashAdvances,             group: 'cashflow-group' },
  { id: 'approvals',         labelKey: 'nav.approvals',              icon: ClipboardCheck,  module: 'approval',           component: Approvals },
  // Warehouse CRUD lives inside Item Settings → Warehouse section
  // (the gear popup on the Items page). No standalone sidebar leaf —
  // one surface is enough; duplicating both was confusing.

  { id: 'settings',           labelKey: 'nav.setting.general',       icon: Settings,        module: 'settings',        component: SettingsView,            group: 'settings-group' },
  // Attendance / Employee Settings only make sense when the role
  // actually has the corresponding business module — there's no
  // attendance to configure if you can't see Attendance. Gated on
  // BOTH settings + the parent module via requireAlso (AND-semantics).
  { id: 'attendance-settings',labelKey: 'nav.setting.attendance',    icon: Clock,           module: 'settings',        component: AttendanceSettings,      group: 'settings-group', requireAlso: ['attendance'] },
  { id: 'employee-settings',  labelKey: 'nav.setting.empset',        icon: Briefcase,       module: 'settings',        component: EmployeeSettings,        group: 'settings-group', requireAlso: ['employees'] },
  { id: 'user-management',    labelKey: 'nav.setting.usermgmt',      icon: Users,           module: 'user-management', component: UserManagement,          group: 'settings-group' },
  { id: 'payroll-categories', labelKey: 'nav.setting.payrollcat',    icon: DollarSign,      module: 'settings',        component: PayrollCategorySettings, group: 'settings-group' },
];

/** Map for O(1) lookup by id. */
export const NAV_BY_ID: Record<string, NavLeaf> = NAV_LEAVES.reduce((acc, l) => {
  acc[l.id] = l;
  return acc;
}, {} as Record<string, NavLeaf>);
