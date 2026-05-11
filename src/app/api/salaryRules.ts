import { apiJson, apiVoid } from './client';

/**
 * Maps an experience range (in years) to a recommended base salary. The
 * matching rule is the one whose [minYears, maxYears) bracket contains the
 * employee's tenure (with maxYears null = open-ended upper bound).
 */
export interface SalaryRule {
  id: string;
  name: string;
  minYears: number;
  /** null = open-ended ("and above"). */
  maxYears?: number | null;
  baseSalary: number;
  currency?: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSalaryRuleRequest {
  name: string;
  minYears: number;
  maxYears?: number | null;
  baseSalary: number;
  currency?: string;
  description?: string;
}

export async function list(): Promise<SalaryRule[]> {
  return apiJson<SalaryRule[]>('/api/v1/salary-rules');
}

export async function create(req: CreateSalaryRuleRequest): Promise<SalaryRule> {
  return apiJson<SalaryRule>('/api/v1/salary-rules', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateSalaryRuleRequest): Promise<SalaryRule> {
  return apiJson<SalaryRule>(`/api/v1/salary-rules/${id}`, { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/salary-rules/${id}`, { method: 'DELETE' });
}

/**
 * Pick the rule whose [minYears, maxYears) bracket contains the given years.
 * If multiple match, the most specific (smallest range) wins; ties resolve to
 * the first listed. Returns undefined when nothing applies.
 */
export function pickRuleFor(rules: SalaryRule[], years: number): SalaryRule | undefined {
  const matching = rules.filter(r =>
    years >= r.minYears && (r.maxYears == null || years < r.maxYears)
  );
  if (matching.length === 0) return undefined;
  return matching.reduce((best, r) => {
    const bestSpan = best.maxYears == null ? Infinity : best.maxYears - best.minYears;
    const rSpan = r.maxYears == null ? Infinity : r.maxYears - r.minYears;
    return rSpan < bestSpan ? r : best;
  });
}
