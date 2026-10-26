import type { RecordType } from '../../api/employeeRecords';

/**
 * The five Employee Record types — what each is, its subtypes, the
 * fields its form asks for, and how its status moves. Mirrors
 * com.hrms.employee.record.RecordTypes on the server; the detail keys
 * here are the jsonb keys stored there.
 */

/**
 * Where a record comes from, which is also its colour everywhere:
 *   leave    Accident, Sick, Ceremony — the employee applies for leave;
 *            the leave's own approval rule covers them.
 *   hr       Promoted, Welfare — entered by HR.
 *   request  Join Club — the employee applies; the person in charge approves.
 */
export type RecordGroup = 'leave' | 'hr' | 'request';

export const GROUP_CHIP: Record<RecordGroup, string> = {
  leave:   'bg-blue-50 text-blue-700 border-blue-200',
  hr:      'bg-violet-50 text-violet-700 border-violet-200',
  request: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const RECORD_GROUPS: { key: RecordGroup; label: string; hint: string; types: RecordType[] }[] = [
  { key: 'leave',   label: 'From leave',       hint: 'Applied for by the employee as leave', types: ['accident', 'sick', 'ceremony'] },
  { key: 'hr',      label: 'HR input',         hint: 'Entered by HR',                          types: ['promoted', 'welfare'] },
  { key: 'request', label: 'Employee request', hint: 'Applied for by the employee; approved by the person in charge', types: ['club'] },
];

export const groupOf = (t: RecordType): RecordGroup =>
  RECORD_GROUPS.find(g => g.types.includes(t))?.key ?? 'hr';

export interface RecordField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'time' | 'date' | 'number' | 'select' | 'bool';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Accident medical detail — hidden from viewers without update rights. */
  medical?: boolean;
}

export interface RecordTypeMeta {
  label: string;
  category: 'Case' | 'Activity';
  /** Tailwind classes for the type chip. */
  chip: string;
  subtypes: { value: string; label: string }[];
  fields: RecordField[];
  /** Label of the amount input, when the type carries one. */
  amountLabel?: string;
  /** One line under the form saying how approval works for this type. */
  approvalHint: string;
}

/** Welfare above this needs approval — RecordTypes.WELFARE_APPROVAL_THRESHOLD. */
export const WELFARE_APPROVAL_THRESHOLD = 100;

/** The three a named approver can be asked for. Mirrors
 *  RecordTypes.APPROVABLE on the API. Accident, sick and ceremony are
 *  a thing that happened, recorded after the fact — there is nothing
 *  to approve. Leave-sourced records are excluded too: the leave was
 *  already approved through its own Manager 1 chain. */
export const APPROVABLE_TYPES = new Set<RecordType>(['promoted', 'club', 'welfare']);

export const RECORD_TYPES: Record<RecordType, RecordTypeMeta> = {
  accident: {
    label: 'Accident',
    category: 'Case',
    chip: GROUP_CHIP.leave,
    subtypes: [
      { value: 'workplace', label: 'Workplace' },
      { value: 'commuting', label: 'Commuting' },
      { value: 'near_miss', label: 'Near-miss' },
    ],
    fields: [
      { key: 'time', label: 'Time', kind: 'time' },
      { key: 'location', label: 'Location', kind: 'text', placeholder: 'Where it happened' },
      { key: 'injuryType', label: 'Injury type', kind: 'text', placeholder: 'e.g. Cut, Sprain, Burn', medical: true },
      { key: 'bodyPart', label: 'Body part', kind: 'text', placeholder: 'e.g. Left hand', medical: true },
      { key: 'witnesses', label: 'Witnesses', kind: 'text', placeholder: 'Names, comma separated' },
      { key: 'lostDays', label: 'Lost days', kind: 'number', medical: true },
      { key: 'nssfClaimNo', label: 'NSSF claim no.', kind: 'text', medical: true },
    ],
    approvalHint: 'Comes from approved sick leave marked as an accident, then runs as a case: Open → Investigating → Closed. Medical details are visible only to HR (update rights).',
  },
  club: {
    label: 'Join Club',
    category: 'Activity',
    chip: GROUP_CHIP.request,
    subtypes: [
      { value: 'sport', label: 'Sport' },
      { value: 'social', label: 'Social' },
      { value: 'volunteer', label: 'Volunteer' },
      { value: 'interest', label: 'Interest' },
      { value: 'ability', label: 'Ability' },
      { value: 'other', label: 'Other' },
    ],
    fields: [
      { key: 'clubName', label: 'Club name', kind: 'text' },
      { key: 'role', label: 'Role', kind: 'select', options: [
        { value: 'member', label: 'Member' }, { value: 'leader', label: 'Leader' },
      ] },
      { key: 'joinDate', label: 'Join date', kind: 'date' },
      { key: 'expireDate', label: 'Expire date', kind: 'date' },
    ],
    amountLabel: 'Fee / company subsidy ($)',
    approvalHint: 'Needs approval only when the company pays a subsidy (amount above 0).',
  },
  promoted: {
    label: 'Promoted',
    category: 'Activity',
    chip: GROUP_CHIP.hr,
    subtypes: [
      { value: 'promotion', label: 'Promotion' },
      { value: 'transfer', label: 'Transfer' },
      { value: 'role_change', label: 'Role change' },
    ],
    fields: [
      { key: 'oldPosition', label: 'Old position', kind: 'text' },
      { key: 'newPosition', label: 'New position', kind: 'text' },
      { key: 'oldDepartment', label: 'Old department', kind: 'text' },
      { key: 'newDepartment', label: 'New department', kind: 'text' },
      { key: 'effectiveDate', label: 'Effective date', kind: 'date' },
      { key: 'reason', label: 'Reason', kind: 'textarea' },
    ],
    approvalHint: 'Needs HR approval. Changing an employee\'s position or department adds one automatically.',
  },
  welfare: {
    label: 'Welfare',
    category: 'Activity',
    chip: GROUP_CHIP.hr,
    subtypes: [
      { value: 'gift', label: 'Gift' },
      { value: 'allowance', label: 'Allowance' },
      { value: 'support', label: 'Support' },
      { value: 'loan', label: 'Loan' },
    ],
    fields: [
      { key: 'item', label: 'Welfare item', kind: 'text', placeholder: 'e.g. Rice bag, Hospital support' },
      { key: 'paymentMethod', label: 'Payment method', kind: 'select', options: [
        { value: 'cash', label: 'Cash' }, { value: 'transfer', label: 'Bank transfer' }, { value: 'payroll', label: 'Through payroll' },
      ] },
      { key: 'payrollLink', label: 'Payroll link', kind: 'text', placeholder: 'e.g. Oct 2026 payroll, increase ref.' },
    ],
    amountLabel: 'Amount ($)',
    approvalHint: `Needs approval above $${WELFARE_APPROVAL_THRESHOLD}; smaller amounts are approved on save.`,
  },
  sick: {
    label: 'Sick',
    category: 'Case',
    chip: GROUP_CHIP.leave,
    subtypes: [
      { value: 'illness', label: 'Illness' },
      { value: 'hospital', label: 'Hospital stay' },
      { value: 'medical_check', label: 'Medical check' },
      { value: 'other', label: 'Other' },
    ],
    fields: [
      { key: 'days', label: 'Days off', kind: 'number' },
      { key: 'hospital', label: 'Hospital / clinic', kind: 'text' },
      { key: 'diagnosis', label: 'Diagnosis', kind: 'text', medical: true },
    ],
    approvalHint: 'Comes from approved sick leave — the leave\'s approval rule applies. Diagnosis and the leave reason are visible only to HR (update rights).',
  },
  ceremony: {
    label: 'Ceremony',
    category: 'Activity',
    chip: GROUP_CHIP.leave,
    subtypes: [
      { value: 'wedding', label: 'Wedding' },
      { value: 'funeral', label: 'Funeral' },
      { value: 'birthday', label: 'Birthday' },
      { value: 'childbirth', label: 'Childbirth' },
      { value: 'ordination', label: 'Ordination' },
      { value: 'housewarming', label: 'Housewarming' },
      { value: 'other', label: 'Other' },
    ],
    fields: [
      { key: 'relation', label: 'Relation', kind: 'select', options: [
        { value: 'self', label: 'Self' }, { value: 'spouse', label: 'Spouse' },
        { value: 'child', label: 'Child' }, { value: 'parent', label: 'Parent' },
      ] },
      { key: 'attendedByCompany', label: 'Attended by company', kind: 'bool' },
    ],
    approvalHint: 'Comes from approved special leave — the leave\'s approval rule applies; no second approval.',
  },
};

/** Group by group: From leave, HR input, Employee request. */
export const RECORD_TYPE_ORDER: RecordType[] = RECORD_GROUPS.flatMap(g => g.types);

/** Accident and Sick details carry medical fields. */
export const isMedicalType = (t: RecordType) => t === 'accident' || t === 'sick';

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open', investigating: 'Investigating', closed: 'Closed',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', recorded: 'Recorded',
};

/** The moves offered from a status, in the order the buttons show. */
export function nextStatuses(type: RecordType, status: string): string[] {
  if (type === 'accident') {
    if (status === 'open') return ['investigating', 'closed'];
    if (status === 'investigating') return ['closed'];
    return ['open'];                         // reopen a closed case
  }
  if (type === 'ceremony' || type === 'sick') return [];
  if (status === 'pending') return ['approved', 'rejected'];
  return ['pending'];                        // reopen a decision
}

export function subtypeLabel(type: RecordType, subtype: string): string {
  return RECORD_TYPES[type]?.subtypes.find(s => s.value === subtype)?.label ?? subtype;
}

/** A one-line summary of the details, for the list. */
export function summarize(type: RecordType, d: Record<string, unknown>): string {
  const s = (k: string) => (d[k] == null || d[k] === '' ? '' : String(d[k]));
  switch (type) {
    case 'accident':
      return [s('location'), s('injuryType') && `${s('injuryType')}${s('bodyPart') ? ` · ${s('bodyPart')}` : ''}`,
        s('lostDays') && `${s('lostDays')} lost day${s('lostDays') === '1' ? '' : 's'}`].filter(Boolean).join(' — ');
    case 'club':
      return [s('clubName'), s('role') && (s('role') === 'leader' ? 'Leader' : 'Member')].filter(Boolean).join(' · ');
    case 'promoted': {
      const pos = s('oldPosition') || s('newPosition') ? `${s('oldPosition') || '—'} → ${s('newPosition') || '—'}` : '';
      const dept = s('oldDepartment') !== s('newDepartment') && (s('oldDepartment') || s('newDepartment'))
        ? `${s('oldDepartment') || '—'} → ${s('newDepartment') || '—'}` : '';
      return [pos, dept].filter(Boolean).join(' · ');
    }
    case 'welfare':
      return [s('item'), s('paymentMethod') && ({ cash: 'Cash', transfer: 'Transfer', payroll: 'Payroll' } as Record<string, string>)[s('paymentMethod')]]
        .filter(Boolean).join(' · ');
    case 'sick':
      return [s('days') && `${s('days')} day${s('days') === '1' ? '' : 's'}`, s('hospital'), s('diagnosis')]
        .filter(Boolean).join(' · ') || (s('leaveDays') ? `${s('leaveDays')} day leave` : '');
    case 'ceremony': {
      const rel = s('relation') ? `${s('relation')[0].toUpperCase()}${s('relation').slice(1)}` : '';
      return [rel, d.attendedByCompany === true ? 'Company attended' : ''].filter(Boolean).join(' · ');
    }
  }
}
