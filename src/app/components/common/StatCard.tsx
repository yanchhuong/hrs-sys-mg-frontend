import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

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
  /** Optional explanatory hint — surfaces as a hover tooltip on a
   *  small info icon next to the label so the card body stays
   *  clean. Falsy (null / undefined / empty) hides the icon. */
  hint?: ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: StatCardTone;
}) {
  const t = STAT_CARD_TONES[tone];
  return (
    // `@container` lets children query THIS card's width (not the
    // viewport) so the value font scales when a 3- or 4-col grid
    // squeezes each card narrow on tablet. Without it a $95,000.00
    // rendered at text-2xl overflowed the card border on the Sale
    // Ledger / Profit & Loss reports at ≤1024px.
    <Card className="@container">
      <CardContent className="p-4">
        {/* Layout: label + icon on the top row (label on the left,
            icon chip on the right), then the big coloured value on
            the row below. Puts the descriptive text where the eye
            naturally lands first, matching the KPI layout the ops
            team prefers. */}
        <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs text-gray-500 truncate">{label}</p>
            {hint ? (
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help shrink-0"
                      aria-label={`${label} details`}
                    >
                      <Info className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                    {hint}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          <div className={`p-2 rounded-lg shrink-0 ${t.bg}`}>
            <Icon className={`h-4 w-4 ${t.text}`} />
          </div>
        </div>
        <div
          className={`font-bold tabular-nums truncate min-w-0 text-lg @xs:text-xl @sm:text-2xl ${t.text}`}
          title={String(value)}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
