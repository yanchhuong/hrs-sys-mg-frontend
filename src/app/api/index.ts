/**
 * Barrel — import everything from one path.
 *
 * Usage:
 *   import { auth, employees, leave } from '@/app/api';
 *   const emps = await employees.list({ page: 0, size: 25 });
 */

export * as auth from './auth';
export * as attendance from './attendance';
export * as audit from './audit';
export * as contracts from './contracts';
export * as deductions from './deductions';
export * as departments from './departments';
export * as employees from './employees';
export * as increases from './increases';
export * as leave from './leave';
export * as overtime from './overtime';
export * as payroll from './payroll';
export * as payrollCategories from './payrollCategories';
export * as reports from './reports';
export * as settings from './settings';
export * as users from './users';

export { API_BASE, USE_MOCKS, ApiError } from './client';
export type { Page, FetchOptions } from './client';
