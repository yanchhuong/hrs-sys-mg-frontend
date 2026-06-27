import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, Info, LayoutGrid } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as visApi from '../../api/categoryCardVisibility';

/** Lightweight shape of a payroll category as seen by the host
 *  pages — they already hold a list of these, so we accept them
 *  through props instead of re-fetching. */
export interface CategoryOption {
  code: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: visApi.CardPage;
  /** All enabled categories for this scope (already filtered by the
   *  host page). The dialog only lets the operator hide/show among
   *  these — disabled categories aren't a visibility decision. */
  categories: CategoryOption[];
  /** Fires after a successful save so the host page can refilter
   *  its card strip without re-fetching. */
  onSaved?: (hiddenCodes: string[]) => void;
}

const COPY = {
  increase: {
    title: 'Increase cards',
    hint: 'Toggle which earning categories show as summary cards on the Increase page.',
  },
  deduction: {
    title: 'Deduction cards',
    hint: 'Toggle which deduction categories show as summary cards on the Deduction page.',
  },
} as const;

/**
 * Per-page payroll-category card visibility settings (V154). One
 * Switch per category — on = visible, off = hidden. Persists the
 * inverse list (hidden codes) server-side so the default state is
 * "everything visible" without any rows.
 */
export function CategoryCardVisibilityDialog({ open, onOpenChange, scope, categories, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Working set of hidden codes — flipped by each Switch. Save
   *  flushes; Cancel discards. */
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const copy = COPY[scope];

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    visApi.getHiddenCodes(scope)
      .then(codes => setHidden(new Set(codes)))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load visibility'))
      .finally(() => setLoading(false));
  }, [open, scope]);

  const toggle = (code: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await visApi.setHiddenCodes(scope, [...hidden]);
      onSaved?.(next);
      toast.success('Saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-blue-600" />
            {copy.title}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label={`About ${copy.title}`}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  {copy.hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Per-page payroll-category summary card visibility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {loading ? (
            <div className="text-center py-6 text-sm text-gray-400">Loading…</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 border rounded-md">
              No categories configured. Add one under{' '}
              <strong>Settings → Payroll Categories</strong> first.
            </div>
          ) : (
            <div className="border rounded-md max-h-80 overflow-y-auto">
              {categories.map(cat => {
                const visible = !hidden.has(cat.code);
                return (
                  <div
                    key={cat.code}
                    className="flex items-center justify-between gap-4 px-3 py-2 border-b last:border-b-0"
                  >
                    <Label className="text-sm font-medium flex-1 min-w-0 truncate" title={cat.label}>
                      {cat.label}
                    </Label>
                    <Switch
                      checked={visible}
                      onCheckedChange={() => toggle(cat.code)}
                      disabled={saving}
                      aria-label={`Show ${cat.label} card`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={loading || saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
