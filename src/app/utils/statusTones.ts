/**
 * One colour per meaning for status and kind badges, app-wide (web).
 *
 * Screens used to keep their own STATUS_*_CLASS maps, so the same status
 * read differently from page to page — Paid red on Invoices but green on
 * Consignment, Void red on Invoices but slate on Approvals, Rejected red
 * here and rose there. Every badge now takes its classes from a TONE,
 * picked by what the status means. Same meanings as the mobile app's
 * src/theme/statusTones.ts, so both apps agree.
 *
 *   success    settled / approved / done / active          (Paid = green)
 *   warning    part-way: partially paid                     (orange)
 *   attention  waiting on a person: pending, submitted      (amber)
 *   info       open and moving: issued, in progress         (blue)
 *   neutral    not in play: draft, void, cancelled, closed  (slate)
 *   danger     needs attention: overdue, rejected, failed   (red)
 *
 * Classes are for an outline <Badge variant="outline" className={…}>.
 * The red PAID stamp printed on documents is a separate thing and stays red.
 */

export type Tone = 'success' | 'warning' | 'attention' | 'info' | 'neutral' | 'danger';

export const TONE_CLASS: Record<Tone, string> = {
  success:   'border-emerald-300 text-emerald-700 bg-emerald-50',
  warning:   'border-orange-300 text-orange-700 bg-orange-50',
  attention: 'border-amber-300 text-amber-700 bg-amber-50',
  info:      'border-blue-300 text-blue-700 bg-blue-50',
  neutral:   'border-slate-300 text-slate-600 bg-slate-50',
  danger:    'border-red-300 text-red-700 bg-red-50',
};

const STATUS_TONE: Record<string, Tone> = {
  paid: 'success', approved: 'success', done: 'success', completed: 'success',
  active: 'success', settled: 'success', checked_out: 'success', sent: 'success',
  verified: 'success', present: 'success', accepted: 'success', submitted_gdt: 'success',
  converted: 'info', refunded: 'info',
  partially: 'warning', partial: 'warning', partially_settled: 'warning',
  pending: 'attention', awaiting: 'attention', submitted: 'attention', requested: 'attention',
  prepared: 'attention', in_review: 'attention',
  progress: 'info', open: 'info', issued: 'info', disbursed: 'info', in_progress: 'info',
  scheduled: 'info', confirmed: 'info',
  draft: 'neutral', void: 'neutral', cancelled: 'neutral', canceled: 'neutral',
  close: 'neutral', closed: 'neutral', inactive: 'neutral', expired: 'neutral',
  withdrawn: 'neutral', suspended: 'neutral',
  overdue: 'danger', rejected: 'danger', failed: 'danger', late: 'danger', absent: 'danger',
};

/** Tone for a status key; unknown statuses are neutral, never a guessed colour. */
export function statusToneOf(status: string | null | undefined): Tone {
  return STATUS_TONE[(status ?? '').toLowerCase()] ?? 'neutral';
}

/** Badge classes for a status key, e.g. statusBadgeClass('void') → slate. */
export function statusBadgeClass(status: string | null | undefined): string {
  return TONE_CLASS[statusToneOf(status)];
}

/** Document kinds — the same on every list and detail. */
export const DOC_KIND_CLASS: Record<string, string> = {
  commercial:  'border-blue-300 text-blue-700 bg-blue-50',
  tax:         'border-violet-300 text-violet-700 bg-violet-50',
  credit_note: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  debit_note:  'border-amber-300 text-amber-700 bg-amber-50',
  medical:     'border-teal-300 text-teal-700 bg-teal-50',
  tuition:     'border-indigo-300 text-indigo-700 bg-indigo-50',
};
