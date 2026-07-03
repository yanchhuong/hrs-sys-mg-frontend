import { apiJson } from './client';

/** Terminal chain state — 'auto_approved' is what the service sets
 *  when the requester has no manager in the chain (chain closes with
 *  zero steps and the source module fires as if approved). */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

/** Where the current viewer's step sits in the chain. */
export type ViewerRole = 'active' | 'waiting' | 'done';

export interface ApprovalStep {
  stepId: string;
  stepOrder: number;
  approverUserId: string;
  approverName: string | null;
  decision: 'approved' | 'rejected' | null;
  decisionAt: string | null;
  comment: string | null;
}

/** Wire shape returned by `/approvals/*`. `sourceSummary` is a
 *  loosely-typed map because each source module (cash_advance, leave,
 *  overtime, …) contributes its own fields. Renderers do their own
 *  narrowing via the `sourceType` discriminator. */
export interface Approval {
  chainId: string;
  sourceType: string;
  sourceId: string;
  requesterUserId: string;
  requesterName: string | null;
  status: ApprovalStatus;
  currentStep: number;
  totalSteps: number;
  createdAt: string;
  closedAt: string | null;
  viewerRole: ViewerRole;
  steps: ApprovalStep[];
  sourceSummary: Record<string, unknown>;
}

export interface DecideRequest {
  decision: 'approved' | 'rejected';
  comment?: string;
}

export async function pending(): Promise<Approval[]> {
  return apiJson('/api/v1/approvals/pending');
}

export async function get(chainId: string): Promise<Approval> {
  return apiJson(`/api/v1/approvals/${chainId}`);
}

export async function decide(chainId: string, req: DecideRequest): Promise<Approval> {
  return apiJson(`/api/v1/approvals/${chainId}/decide`, { method: 'POST', json: req });
}
