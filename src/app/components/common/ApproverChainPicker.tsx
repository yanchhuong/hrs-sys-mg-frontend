/**
 * ApproverChainPicker — the "Approvers (optional, ordered — up to N)"
 * block on approval-backed forms (Cash Advance first).
 *
 *   Approvers (optional, ordered — up to 3) ⓘ               Clear
 *   1st [ Yanchhuong                    ▾ ]  ✕  +
 *
 * Starts with ONE row. Once a row is filled, a + after its ✕ adds the
 * next one, up to `max` — instead of always showing every slot empty.
 * ✕ removes that row (the ones below close up, keeping their order);
 * on the only row it just empties it. A user picked in one row is not
 * offered in the others.
 *
 * Mirrors the mobile ApproverChainField (hrs-mobile-app) — keep the two
 * behaving alike.
 */
import { useState } from 'react';
import { Info, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { SearchablePicker } from './SearchablePicker';

export interface ApproverCandidate {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

export function ApproverChainPicker({
  value, onChange, candidates, max = 3, noun = 'item',
}: {
  /** Ordered user ids; '' marks a row added but not yet picked. */
  value: string[];
  onChange: (next: string[]) => void;
  candidates: ApproverCandidate[];
  max?: number;
  /** For the help text: "the advance waits…". */
  noun?: string;
}) {
  // Rows on screen: at least one, and never fewer than the picks.
  const [rows, setRows] = useState(() => Math.max(1, value.filter(Boolean).length));
  const slots = Array.from({ length: rows }, (_, i) => value[i] ?? '');
  const anyPicked = slots.some(Boolean);

  const setAt = (i: number, id: string) => onChange(slots.map((v, k) => (k === i ? id : v)));
  const removeAt = (i: number) => {
    if (rows === 1) { onChange(['']); return; }
    onChange(slots.filter((_, k) => k !== i));
    setRows(r => r - 1);
  };
  const addRow = () => { onChange([...slots, '']); setRows(r => r + 1); };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-gray-200 p-3 bg-gray-50/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs font-medium">Approvers (optional, ordered — up to {max})</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-400 hover:text-gray-600" aria-label="Approvers help">
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              Leave blank to skip approval. Otherwise the {noun} waits until each picked approver acts, in order.
            </TooltipContent>
          </Tooltip>
        </div>
        {anyPicked && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-gray-500" type="button"
            onClick={() => { onChange(['']); setRows(1); }}>
            Clear
          </Button>
        )}
      </div>
      {slots.map((picked, i) => {
        const isLast = i === rows - 1;
        // ✕ when there is something to remove: a pick, or an extra row.
        const canRemove = !!picked || rows > 1;
        const canAdd = isLast && !!picked && rows < max;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 w-6 shrink-0">{ORDINAL[i] ?? `${i + 1}th`}</span>
            <div className="flex-1 min-w-0">
              <SearchablePicker
                value={picked}
                onChange={id => setAt(i, id)}
                placeholder="— none —"
                emptyLabel="— none —"
                searchPlaceholder="Search users by name, email, or role…"
                options={candidates
                  // Not offered here if picked in another row.
                  .filter(u => u.id === picked || !slots.some((v, k) => k !== i && v === u.id))
                  .map(u => ({
                    value: u.id,
                    label: u.name || u.email,
                    secondary: u.role ?? undefined,
                    searchKey: `${u.name ?? ''} ${u.email} ${u.role ?? ''}`,
                  }))}
              />
            </div>
            {/* Fixed-width icon cells so rows line up whether or not
                an icon shows. */}
            <div className="w-7 shrink-0 flex justify-center">
              {canRemove && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-700"
                  onClick={() => removeAt(i)} aria-label={`Remove ${ORDINAL[i] ?? ''} approver`}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="w-7 shrink-0 flex justify-center">
              {canAdd && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700"
                  onClick={addRow} aria-label="Add next approver">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
