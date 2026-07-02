/**
 * Requirement Surveys — inbound customer inquiries submitted from the
 * landing page (V170). Two-audience API:
 *   • Public — {@link submitPublicSurvey} is called by the landing
 *     form; no auth required. Backed by SecurityConfig's permit-all
 *     entry for {@code /api/v1/public/surveys}.
 *   • Platform — {@link platformSurveys.*} is the Super Admin CRUD
 *     surface used by the RequirementSurveys management page.
 */
import { apiJson, apiVoid } from './client';

// Same paged-envelope shape as platform.ts. Duplicated locally so this
// module can stand alone if the surveys become a shipped-alone SDK.
type Paged<T> = { data: T[]; page?: number; size?: number; totalPages?: number; totalElements?: number } | T[];
const unwrap = <T>(r: Paged<T>): T[] => Array.isArray(r) ? r : (r?.data ?? []);

export type SurveyStatus =
  | 'new' | 'reviewed' | 'contacted' | 'discussion' | 'quotation_sent'
  | 'negotiation' | 'won' | 'lost' | 'closed';

export type SurveyPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Ordered set of statuses in pipeline flow — drives the summary card
 *  grid + the status dropdown ordering. Kept co-located with the type
 *  so the Super Admin view doesn't need its own mapping table. */
export const SURVEY_STATUSES: { key: SurveyStatus; label: string; tone: string }[] = [
  { key: 'new',             label: 'New',               tone: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'reviewed',        label: 'Reviewed',          tone: 'bg-slate-100 text-slate-800 border-slate-200' },
  { key: 'contacted',       label: 'Contacted',         tone: 'bg-sky-100 text-sky-800 border-sky-200' },
  { key: 'discussion',      label: 'Discussion',        tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { key: 'quotation_sent',  label: 'Quotation Sent',    tone: 'bg-violet-100 text-violet-800 border-violet-200' },
  { key: 'negotiation',     label: 'Negotiation',       tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  { key: 'won',             label: 'Won',               tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { key: 'lost',            label: 'Lost',              tone: 'bg-rose-100 text-rose-800 border-rose-200' },
  { key: 'closed',          label: 'Closed',            tone: 'bg-gray-100 text-gray-700 border-gray-200' },
];

export const SURVEY_PRIORITIES: { key: SurveyPriority; label: string; tone: string }[] = [
  { key: 'low',    label: 'Low',    tone: 'bg-gray-100 text-gray-700' },
  { key: 'normal', label: 'Normal', tone: 'bg-blue-50 text-blue-700' },
  { key: 'high',   label: 'High',   tone: 'bg-amber-100 text-amber-800' },
  { key: 'urgent', label: 'Urgent', tone: 'bg-rose-100 text-rose-800' },
];

export interface RequirementSurvey {
  id: string;
  surveyNo: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  projectType: string | null;
  selectedApps: string[];
  priority: SurveyPriority;
  budgetRange: string | null;
  expectedImplDate: string | null;   // YYYY-MM-DD
  currentSystem: string | null;
  businessRequirement: string | null;
  additionalNotes: string | null;
  status: SurveyStatus;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  statusRemarks: string | null;
  assignedUserId: string | null;
  assignedAt: string | null;
  assignmentNote: string | null;
  submittedAt: string;
  updatedAt: string;
  tenantId: string | null;
}

export interface SurveyStatusHistoryEntry {
  id: string;
  surveyId: string;
  fromStatus: SurveyStatus | null;
  toStatus: SurveyStatus;
  remarks: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

/** Public-form payload — matches RequirementSurveyRequest.java. */
export interface SubmitSurveyRequest {
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  projectType?: string;
  selectedApps?: string[];
  priority?: SurveyPriority;
  budgetRange?: string;
  expectedImplDate?: string;
  currentSystem?: string;
  businessRequirement?: string;
  additionalNotes?: string;
}

/** Anonymous POST from the landing page. No JWT — allowed by
 *  SecurityConfig's permit-list. */
export async function submitPublicSurvey(req: SubmitSurveyRequest): Promise<RequirementSurvey> {
  return apiJson('/api/v1/public/surveys', { method: 'POST', json: req });
}

export interface ListSurveysParams {
  q?: string;
  status?: SurveyStatus | '';
  priority?: SurveyPriority | '';
  assigned?: string;
  from?: string;   // YYYY-MM-DD
  to?: string;     // YYYY-MM-DD
  page?: number;
  size?: number;
}

export const platformSurveys = {
  list: (params: ListSurveysParams = {}): Promise<RequirementSurvey[]> =>
    apiJson<Paged<RequirementSurvey>>('/api/v1/platform/surveys', { query: { ...params } }).then(unwrap),
  summary: (): Promise<Record<string, number>> =>
    apiJson('/api/v1/platform/surveys/summary'),
  get: (id: string): Promise<RequirementSurvey> =>
    apiJson(`/api/v1/platform/surveys/${id}`),
  history: (id: string): Promise<SurveyStatusHistoryEntry[]> =>
    apiJson(`/api/v1/platform/surveys/${id}/history`),
  update: (id: string, req: SubmitSurveyRequest): Promise<RequirementSurvey> =>
    apiJson(`/api/v1/platform/surveys/${id}`, { method: 'PUT', json: req }),
  changeStatus: (id: string, toStatus: SurveyStatus, remarks?: string): Promise<RequirementSurvey> =>
    apiJson(`/api/v1/platform/surveys/${id}/status`, { method: 'POST', json: { toStatus, remarks } }),
  assign: (id: string, userId: string | null, note?: string): Promise<RequirementSurvey> =>
    apiJson(`/api/v1/platform/surveys/${id}/assign`, { method: 'POST', json: { userId, note } }),
  delete: (id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/surveys/${id}`, { method: 'DELETE' }),
};
