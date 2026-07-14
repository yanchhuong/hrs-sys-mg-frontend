import { apiJson } from './client';

/* ================================================================
 * Cambodian tax-calendar surface (MVP #4).
 *   Agency side  → /api/v1/agency/tax-calendar/**
 *   Tenant side  → /api/v1/tax-calendar/**
 * ================================================================ */

export type CalendarStatus = 'not_due' | 'due' | 'overdue' | 'filed';

export interface CalendarEntry {
  obligationCode: string;
  obligationName: string;
  frequency: 'monthly' | 'annual';
  /** YYYY-MM for monthly, YYYY for annual. */
  period: string;
  /** ISO date, e.g. '2026-02-20'. */
  dueDate: string;
  status: CalendarStatus;
  filedAt: string | null;
  filedBySide: 'agency' | 'client' | null;
  referenceNo: string | null;
  attachmentUrl: string | null;
  notes: string | null;
  statuteRef: string | null;
  /** Nudge for the UI — negative when overdue. Null when filed
   *  or not_due. */
  daysUntilDue: number | null;
}

export interface MarkFiledRequest {
  obligationCode: string;
  period: string;
  referenceNo?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
}

export interface SweepResult {
  opened: number;
  skipped: number;
}

/* -------------------- agency side -------------------- */

export const agency = {
  calendar: (clientTenantId: string, periods?: string[]) =>
    apiJson<CalendarEntry[]>('/api/v1/agency/tax-calendar', {
      query: {
        clientTenantId,
        ...(periods && periods.length ? { periods: periods.join(',') } : {}),
      },
    }),
  markFiled: (clientTenantId: string, req: MarkFiledRequest) =>
    apiJson<CalendarEntry>('/api/v1/agency/tax-calendar/mark-filed', {
      method: 'POST',
      query: { clientTenantId },
      json: req,
    }),
  sweepOverdue: (clientTenantId: string) =>
    apiJson<SweepResult>('/api/v1/agency/tax-calendar/sweep-overdue', {
      method: 'POST',
      query: { clientTenantId },
    }),
};

/* -------------------- tenant side (admin) -------------------- */

export const tenant = {
  calendar: (periods?: string[]) =>
    apiJson<CalendarEntry[]>('/api/v1/tax-calendar', {
      query: periods && periods.length ? { periods: periods.join(',') } : {},
    }),
  markFiled: (req: MarkFiledRequest) =>
    apiJson<CalendarEntry>('/api/v1/tax-calendar/mark-filed', {
      method: 'POST',
      json: req,
    }),
};
