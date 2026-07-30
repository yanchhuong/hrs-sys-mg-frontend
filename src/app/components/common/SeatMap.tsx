import { Accessibility, Briefcase, Car } from 'lucide-react';
import type * as paymentPlanItemsApi from '../../api/paymentPlanItems';

/**
 * Van/vehicle seat-map rendering shared between the Booking Create
 * dialog and the Property View popup. Both surfaces read the same
 * catalogue (`paymentPlanItemsApi`) — the picker mode uses
 * `onToggle` to flip selection; the view mode omits it and shows
 * the layout in read-only.
 *
 * Naming conventions:
 *   * Options named exactly `DRIVER`, `LUGGAGE`, or `FRONT`
 *     (case-insensitive) are decorative — placed in fixed slots
 *     around the seat grid, never selectable.
 *   * Any other option must match `<letters><separator?><digits>`
 *     — tight forms like `A1`, `B2`, `AA3` AND separator forms like
 *     `Seat-001`, `Seat_02`, `Row 1`, `A.5`. Column padding zeros
 *     are stripped so `Seat-001` == column 1. A single misfit → the
 *     parser returns `null` and the caller falls back to a
 *     flat-list rendering.
 *   * Accessibility marker is derived from the option's own text —
 *     `accessible` / `wheelchair` / `handicap` in name or
 *     description flips the icon on. No schema change needed.
 */

export interface SeatLayout {
  rowLetters: string[];
  maxCol: number;
  byRow: Record<string, Array<paymentPlanItemsApi.PaymentPlanItemOption | null>>;
  specials: paymentPlanItemsApi.PaymentPlanItemOption[];
  /** True when every parsed seat shares the same row letter (e.g.
   *  the operator generated `Seat-001..015` in bulk). We reflow
   *  such layouts into a compact 3-column grid at render time and
   *  shorten each button label to just the number, since the row
   *  letter is redundant across every seat. */
  singleFamily: boolean;
  /** Uppercased shared prefix when `singleFamily` is true — used to
   *  strip the redundant leading text from each button's caption. */
  familyPrefix: string | null;
}

/** Parse a property's options into a seat-map layout, or return
 *  null when the shape doesn't fit (empty list, non-seat name). */
export function parseSeatLayout(
  options: paymentPlanItemsApi.PaymentPlanItemOption[],
): SeatLayout | null {
  const active = options.filter(o => o.active);
  if (active.length === 0) return null;
  const specials: paymentPlanItemsApi.PaymentPlanItemOption[] = [];
  const parsed: Array<{ opt: paymentPlanItemsApi.PaymentPlanItemOption; row: string; col: number }> = [];
  for (const o of active) {
    const name = (o.name ?? '').trim();
    const upper = name.toUpperCase();
    if (upper === 'DRIVER' || upper === 'LUGGAGE' || upper === 'FRONT') {
      specials.push(o);
      continue;
    }
    // Accept tight (A1, B2) AND separator forms (Seat-001, Seat_02,
    // Row 1, A.5). Leading zeros on the column are stripped by
    // Number(), so `Seat-001` and `Seat-1` land on the same column.
    const m = /^([A-Za-z]+)[\s\-_.]*(\d+)$/.exec(name);
    if (!m) return null;
    parsed.push({ opt: o, row: m[1].toUpperCase(), col: Number(m[2]) });
  }
  if (parsed.length === 0) return null;
  const rowLetters = Array.from(new Set(parsed.map(p => p.row))).sort();
  const maxCol = parsed.reduce((m, p) => Math.max(m, p.col), 0);
  const byRow: Record<string, Array<paymentPlanItemsApi.PaymentPlanItemOption | null>> = {};
  for (const r of rowLetters) byRow[r] = Array(maxCol).fill(null);
  for (const p of parsed) byRow[p.row][p.col - 1] = p.opt;
  const singleFamily = rowLetters.length === 1;
  return {
    rowLetters, maxCol, byRow, specials,
    singleFamily,
    familyPrefix: singleFamily ? rowLetters[0] : null,
  };
}

/** Van-shaped seat map with legend + grid. `readOnly` mode drops
 *  the hover cursor and ignores clicks — used by the Property View
 *  popup to preview a vehicle's layout. */
export function SeatMapDisplay({
  layout, selectedIds, occupiedIds, onToggle, showLegend = true,
}: {
  layout: SeatLayout;
  selectedIds: Set<string>;
  occupiedIds: Set<string>;
  onToggle?: (opt: paymentPlanItemsApi.PaymentPlanItemOption) => void;
  showLegend?: boolean;
}) {
  const readOnly = !onToggle;
  const driverOpt   = layout.specials.find(s => (s.name ?? '').trim().toUpperCase() === 'DRIVER')  ?? null;
  const frontOpt    = layout.specials.find(s => (s.name ?? '').trim().toUpperCase() === 'FRONT')   ?? null;
  const luggageOpt  = layout.specials.find(s => (s.name ?? '').trim().toUpperCase() === 'LUGGAGE') ?? null;

  const trigger = (opt: paymentPlanItemsApi.PaymentPlanItemOption) => {
    if (readOnly) return;
    onToggle!(opt);
  };

  /** Render rows — either the naive parsed shape (multi-letter
   *  properties like B1/B2 · C1/C2), or a reflowed 3-seats-per-row
   *  layout with a visual aisle between col 2 and col 3 when every
   *  seat shares one row letter. Reflow keeps buttons readable when
   *  the operator bulk-generated e.g. `Seat-001..015`, and the
   *  aisle mirrors a real van floor plan (2 seats · walkway ·
   *  1 seat). */
  const SEATS_PER_ROW = 3;
  const displayRows: Array<Array<paymentPlanItemsApi.PaymentPlanItemOption | null>> =
    layout.singleFamily
      ? (() => {
          const flat = layout.byRow[layout.rowLetters[0]].filter(x => x != null) as paymentPlanItemsApi.PaymentPlanItemOption[];
          const usableFlat = !frontOpt ? flat.slice(1) : flat;
          const rows: paymentPlanItemsApi.PaymentPlanItemOption[][] = [];
          for (let i = 0; i < usableFlat.length; i += SEATS_PER_ROW) {
            rows.push(usableFlat.slice(i, i + SEATS_PER_ROW));
          }
          return rows;
        })()
      : layout.rowLetters.map(rowLetter =>
          layout.byRow[rowLetter].map((opt, colIdx) =>
            !frontOpt && rowLetter === layout.rowLetters[0] && colIdx === 0 ? null : opt
          )
        );
  /** v-seat-map-aisle — the seat grid uses a CSS template where the
   *  third column is a narrow **aisle** (walking path). Applies to
   *  single-family reflow and to multi-letter layouts with ≥ 3
   *  columns so both surfaces read the same visually. Row F in the
   *  mockup with 4 seats and no aisle isn't achievable from the
   *  current data model without extra metadata — skip that variant
   *  for now. */
  /** Aisle only kicks in for single-family reflow — hand-crafted
   *  multi-letter layouts render as parsed so a 4-seat row like
   *  F1/F2/F3/F4 doesn't lose F3 to the walkway slot. Ops with a
   *  van floor plan naturally end up single-family via the bulk
   *  generator, so this is the common path. */
  const aisleTemplate = 'minmax(0, 1fr) minmax(0, 1fr) 0.35fr minmax(0, 1fr)';
  const gridTemplate = layout.singleFamily
    ? aisleTemplate
    : `repeat(${layout.maxCol}, minmax(0, 1fr))`;
  const useAisle = layout.singleFamily;

  /** v-seat-map-full-name-labels — buttons render the full option
   *  name (`Seat-001`, `Row A-1`, `B3`) instead of the previously
   *  stripped-numeric shortcut. Operators wanted the identifier
   *  they'd see on a receipt / ticket right on the seat. Long
   *  labels lean on the button's inner `truncate` + smaller font
   *  to fit; tooltip carries the full name too. */
  const shortLabel = (opt: paymentPlanItemsApi.PaymentPlanItemOption): string => opt.name;

  return (
    <div className="space-y-3">
      {showLegend && (
        <div className="rounded-xl border bg-white px-4 py-3 flex items-center gap-4 flex-wrap text-[11px] tracking-wide uppercase text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded bg-indigo-100 border border-indigo-200" /> Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded bg-indigo-600" /> Selected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-4 w-4 rounded bg-gray-300" /> Occupied
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Accessibility className="h-4 w-4 text-gray-700" /> Accessible
          </span>
        </div>
      )}

      {/* Outer wrapper hugs the van card instead of stretching to the
          full column width — the previous `flex justify-center` on
          a stretched parent left equal soft-blue strips on both
          sides. `w-fit mx-auto` sizes to content; `max-w-full`
          keeps small viewports from horizontal-scrolling. */}
      <div className="rounded-2xl bg-indigo-50/70 p-4 w-fit mx-auto max-w-full">
        <div className="bg-white rounded-t-[3rem] rounded-b-2xl shadow-sm w-full max-w-md px-6 py-5">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />

          {/* Top strip — Driver | (blank) | aisle | Front.
              Uses the same 4-slot template as the seat grid below
              when the aisle is active, so DRIVER lands at col 1
              and FRONT lands at col 4 with a visible walkway
              between them (matches the mockup's van cabin). */}
          <div
            className="grid gap-2 pb-3 border-b border-gray-100 items-end"
            style={{ gridTemplateColumns: useAisle
              ? aisleTemplate
              : `repeat(${Math.max(3, layout.maxCol)}, minmax(0, 1fr))` }}
          >
            <DriverCell hasOpt={!!driverOpt} />
            {useAisle ? (
              <>
                <div />
                <div />
              </>
            ) : (
              Array.from({ length: Math.max(0, layout.maxCol - 2) }, (_, i) => (
                <div key={`gap-${i}`} />
              ))
            )}
            <FrontCell
              opt={frontOpt ?? (layout.byRow[layout.rowLetters[0]]?.[0] ?? null)}
              selectedIds={selectedIds}
              occupiedIds={occupiedIds}
              onClick={trigger}
              readOnly={readOnly}
            />
          </div>

          {/* Seat grid — multi-letter properties render row-by-row as
              parsed; single-family (bulk-generated) properties are
              reflowed into groups of 3 seats. Both surfaces use the
              same 4-column template with col 3 as an aisle when
              ≥ 3 columns are present, so the walking path lines up
              vertically across all rows. */}
          <div className="pt-4 space-y-2.5">
            {displayRows.map((row, rowIdx) => (
              <div
                key={`row-${rowIdx}`}
                className="grid gap-2"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {useAisle ? (
                  <>
                    <SeatSlot opt={row[0] ?? null} shortLabel={shortLabel} selectedIds={selectedIds} occupiedIds={occupiedIds} readOnly={readOnly} trigger={trigger} />
                    <SeatSlot opt={row[1] ?? null} shortLabel={shortLabel} selectedIds={selectedIds} occupiedIds={occupiedIds} readOnly={readOnly} trigger={trigger} />
                    <div />
                    <SeatSlot opt={row[layout.singleFamily ? 2 : row.length - 1] ?? null} shortLabel={shortLabel} selectedIds={selectedIds} occupiedIds={occupiedIds} readOnly={readOnly} trigger={trigger} />
                  </>
                ) : (
                  row.map((opt, colIdx) => (
                    <SeatSlot
                      key={`${rowIdx}-${colIdx}`}
                      opt={opt}
                      shortLabel={shortLabel}
                      selectedIds={selectedIds}
                      occupiedIds={occupiedIds}
                      readOnly={readOnly}
                      trigger={trigger}
                    />
                  ))
                )}
              </div>
            ))}
            {luggageOpt && (
              <div className="flex justify-center pt-1">
                <LuggageCell />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small render helper — either a SeatButton or a blank grid cell.
 *  Keeps the main JSX branch above readable when a row's slot is
 *  null (aisle padding, past-end-of-row). */
function SeatSlot({
  opt, shortLabel, selectedIds, occupiedIds, readOnly, trigger,
}: {
  opt: paymentPlanItemsApi.PaymentPlanItemOption | null;
  shortLabel: (o: paymentPlanItemsApi.PaymentPlanItemOption) => string;
  selectedIds: Set<string>;
  occupiedIds: Set<string>;
  readOnly: boolean;
  trigger: (o: paymentPlanItemsApi.PaymentPlanItemOption) => void;
}) {
  if (!opt) return <div />;
  const isSelected = selectedIds.has(opt.id);
  const isOccupied = occupiedIds.has(opt.id);
  const isAccessible = /(accessible|wheelchair|handicap)/i.test(
    (opt.description ?? '') + ' ' + (opt.name ?? '')
  );
  return (
    <SeatButton
      opt={opt}
      label={shortLabel(opt)}
      selected={isSelected}
      occupied={isOccupied}
      accessible={isAccessible}
      readOnly={readOnly}
      onClick={() => trigger(opt)}
    />
  );
}

function SeatButton({
  opt, label, selected, occupied, accessible, readOnly, onClick,
}: {
  opt: paymentPlanItemsApi.PaymentPlanItemOption;
  /** Display caption. Defaults to `opt.name`; the grid passes a
   *  shortened label when the layout is single-family (e.g. `1`
   *  instead of `Seat-001`). Tooltip always shows the full name. */
  label?: string;
  selected: boolean;
  occupied: boolean;
  accessible: boolean;
  readOnly: boolean;
  onClick: () => void;
}) {
  const cls = occupied
    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
    : selected
      ? 'bg-indigo-600 text-white shadow-sm'
      : readOnly
        ? 'bg-indigo-100 text-indigo-700 cursor-default'
        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={occupied || readOnly}
      title={`${opt.name} — ${opt.price == null ? '—' : `$${Number(opt.price).toFixed(2)}`}${occupied ? ' (occupied)' : ''}${accessible ? ' · accessible' : ''}`}
      className={`relative h-10 rounded-lg text-[11px] font-semibold tabular-nums transition px-1 flex items-center justify-center ${cls}`}
    >
      <span className="truncate leading-tight">{label ?? opt.name}</span>
      {accessible && (
        <Accessibility className="absolute bottom-0.5 right-0.5 h-3 w-3 opacity-70" />
      )}
    </button>
  );
}

function DriverCell({ hasOpt }: { hasOpt: boolean }) {
  return (
    <div className={`h-14 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold tracking-wider text-gray-600 ${hasOpt ? '' : ''}`}>
      <Car className="h-5 w-5 text-gray-600" />
      <span>DRIVER</span>
    </div>
  );
}

function FrontCell({
  opt, label, selectedIds, occupiedIds, onClick, readOnly,
}: {
  opt: paymentPlanItemsApi.PaymentPlanItemOption | null;
  label?: string;
  selectedIds: Set<string>;
  occupiedIds: Set<string>;
  onClick: (opt: paymentPlanItemsApi.PaymentPlanItemOption) => void;
  readOnly: boolean;
}) {
  if (!opt) {
    return (
      <div className="h-14 rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-[10px] text-gray-400 uppercase tracking-wider">
        Front
      </div>
    );
  }
  const isSelected = selectedIds.has(opt.id);
  const isOccupied = occupiedIds.has(opt.id);
  const cls = isOccupied
    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
    : isSelected
      ? 'bg-indigo-600 text-white shadow-sm'
      : readOnly
        ? 'bg-indigo-100 text-indigo-700 cursor-default'
        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200';
  return (
    <button
      type="button"
      onClick={() => onClick(opt)}
      disabled={isOccupied || readOnly}
      title={`${opt.name} — ${opt.price == null ? '—' : `$${Number(opt.price).toFixed(2)}`}${isOccupied ? ' (occupied)' : ''}`}
      className={`relative h-14 rounded-xl text-sm font-semibold tabular-nums transition flex flex-col items-center justify-center gap-0.5 ${cls}`}
    >
      <span className="text-sm">{label ?? opt.name}</span>
      <span className={`text-[9px] font-semibold tracking-wider ${isSelected ? 'text-indigo-100' : 'text-gray-500'}`}>FRONT</span>
    </button>
  );
}

function LuggageCell() {
  return (
    <div className="h-10 w-16 rounded-lg border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
      <Briefcase className="h-4 w-4 text-gray-400" />
    </div>
  );
}
