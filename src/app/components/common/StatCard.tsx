import { ReactNode } from 'react';
import { Card, CardContent } from '../ui/card';

/**
 * Shared KPI card used across every report page (Attendance,
 * Payroll, Compliance, Sale Ledger, Purchase Ledger, Profit &
 * Loss). Coloured icon chip top-left, big coloured number top-
 * right, muted label + optional hint below. Same visual shape
 * everywhere so a user's eye doesn't have to relearn the layout
 * between report tabs.
 *
 * <p>Previously three near-duplicate copies lived in each report
 * file. Consolidated here so future style tweaks (padding, tone
 * palette, hover states) apply everywhere from one edit.</p>
 */
export const STAT_CARD_TONES: Record<string, { bg: string; text: string; ring: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   ring: 'ring-blue-300' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-300' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-300' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-300' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-300' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-300' },
};

export type StatCardTone = keyof typeof STAT_CARD_TONES;

export function StatCard({
  label, value, hint, icon: Icon, tone,
}: {
  label: string;
  value: string | number;
  /** Optional secondary line under the label (e.g. supporting
   *  breakdown or short explanation). ReactNode so callers can
   *  compose numbers + inline styling. */
  hint?: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: StatCardTone;
}) {
  const t = STAT_CARD_TONES[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${t.bg}`}>
            <Icon className={`h-4 w-4 ${t.text}`} />
          </div>
          <span className={`text-2xl font-bold tabular-nums ${t.text}`}>{value}</span>
        </div>
        <p className="text-xs text-gray-500">{label}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
