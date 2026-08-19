import { apiJson, apiVoid } from './client';

/**
 * Custom roles + their permission grid.
 *
 * Built-in roles (admin / manager / employee) come back from `list()` with
 * `isBuiltin = true` and cannot be deleted; admins can rename or tweak
 * their permission grid. New roles are scoped per tenant.
 */
export interface Role {
  /** Stable machine key — lowercase letters, digits, dashes, underscores. */
  key: string;
  name: string;
  description?: string;
  /** Inheritance hint — what built-in role to seed permissions from. */
  baseRole?: 'admin' | 'manager' | 'employee' | string;
  isBuiltin: boolean;
}

export type PermissionModule =
  | 'dashboard' | 'employees' | 'announcements'
  | 'attendance' | 'all-leave' | 'exception' | 'overtime'
  | 'deduction' | 'increase' | 'payroll' | 'benefit-calculator'
  | 'reports' | 'attendance-report' | 'payroll-report' | 'compliance'
  | 'contracts' | 'settings' | 'user-management' | 'telegram' | 'office'
  // Sale + Purchase
  | 'customer' | 'quotation' | 'invoice' | 'pos' | 'voucher' | 'payment'
  | 'vendor' | 'bill' | 'receipt' | 'expenses' | 'sales'
  // Stock (V150)
  | 'stock' | 'movement' | 'adjustment'
  // Cash Flow (V156 / V158)
  | 'transaction' | 'cashadvance'
  // Business-base verticals — Healthcare (V181), Education (V181),
  // Membership (V-library-membership).
  | 'encounter' | 'appointment' | 'medical-service'
  | 'enrollment' | 'class-attendance'
  | 'member' | 'book' | 'reading'
  // Receivables (V251 / V287 / V288)
  | 'payment_plan' | 'payment_collection' | 'property' | 'booking'
  // Approval + templates + commission + consignment
  | 'approval' | 'invoice_template' | 'commission' | 'consignment';

/**
 * Permission actions split into two axes:
 *   Menu Access — what the role can do on a module (view, create, update, delete)
 *   Data Access — what records the role can see (owner / member / all)
 *
 * They share the role_permissions table by storing the data-access axis
 * as additional "scope_*" action rows. Runtime enforcement of the scope
 * grants is still role-based (useTeamScope); the grants are persisted
 * so future per-role overrides can be wired without another migration.
 */
export type PermissionAction =
  | 'view' | 'create' | 'update' | 'delete'
  | 'scope_owner' | 'scope_member' | 'scope_all';

export interface RolePermission {
  module: PermissionModule;
  action: PermissionAction;
  granted: boolean;
}

export interface CreateRoleRequest {
  /** Backend regex: `^[a-z][a-z0-9_-]*$`. */
  key: string;
  name: string;
  description?: string;
  baseRole?: 'admin' | 'manager' | 'employee';
}

export async function list(): Promise<Role[]> {
  return apiJson('/api/v1/roles');
}

export async function create(req: CreateRoleRequest): Promise<Role> {
  return apiJson('/api/v1/roles', { method: 'POST', json: req });
}

export async function remove(key: string): Promise<void> {
  return apiVoid(`/api/v1/roles/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export async function getPermissions(key: string): Promise<RolePermission[]> {
  return apiJson(`/api/v1/roles/${encodeURIComponent(key)}/permissions`);
}

/** Replace the entire grid for one role. PUT semantics. */
export async function replacePermissions(
  key: string,
  grid: RolePermission[],
): Promise<RolePermission[]> {
  return apiJson(`/api/v1/roles/${encodeURIComponent(key)}/permissions`, {
    method: 'PUT',
    json: grid,
  });
}
