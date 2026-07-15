import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';

/**
 * v-agency-page-tooltip — shared "ⓘ" beside every agency page's
 * title. Replaces the previous inline subtitle paragraph so the
 * page chrome stays tight and the explainer only surfaces on hover.
 */
export function PageTitleTooltip({ label, children }: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
            aria-label={label}
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
