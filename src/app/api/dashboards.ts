/**
 * V316 — dynamic multi-category Dashboard.
 *
 * The FE loads the current user's available categories (server has
 * already intersected them with tenant modules + role permissions),
 * renders one tab per category, and calls the batched summary
 * endpoint for whichever tab is selected.
 */
import { apiJson } from './client';

export interface DashboardCategory {
  code: string;
  name: string;
  description: string | null;
  /** Lucide icon name (kebab-case). FE maps to a component. */
  icon: string | null;
  sortOrder: number;
}

/**
 * Batched summary payload — one call returns everything the tab's
 * widgets need. HR currently returns the legacy /summary shape; the
 * other categories return a "coming_soon" stub until their widgets
 * ship. Widgets should check {@link isComingSoon} before trying to
 * read category-specific fields.
 */
export interface DashboardSummary {
  category?: string;
  status?: 'coming_soon' | string;
  message?: string;
  /** HR / legacy fields — present when the category has real data. */
  employees?: { total: number; active: number; newThisMonth: number };
  approvals?: { leavePending: number; otPending: number; payrollPending: number };
  payrollMonth?: { month: string; netTotal: string; totalEarnings: string; totalDeductions: string };
  contracts?: { expiringIn30Days: number };
  [k: string]: unknown;
}

export function isComingSoon(s: DashboardSummary | null | undefined): boolean {
  return !!s && s.status === 'coming_soon';
}

export async function listCategories(): Promise<DashboardCategory[]> {
  return apiJson('/api/v1/dashboard/categories');
}

export async function getCategorySummary(code: string): Promise<DashboardSummary> {
  return apiJson(`/api/v1/dashboard/${encodeURIComponent(code)}`);
}
