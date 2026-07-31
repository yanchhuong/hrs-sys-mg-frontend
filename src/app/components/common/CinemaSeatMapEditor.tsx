import { Fragment, useMemo, useState } from 'react';
import { Trash2, X, Car } from 'lucide-react';
import { Input } from '../ui/input';
import type * as itemsApi from '../../api/paymentPlanItems';

/**
 * v-cinema-shared-canvas (V299) — grid-canvas seat-map editor that
 * spans every group on a Property. A real cinema has ONE screen and
 * multiple sections (VIP, Standard, Loveseats…) share the same
 * layout, so this editor renders one canvas coloured by group
 * instead of one canvas per group.
 *
 * Interaction model:
 *   • Active group chip strip — the operator picks which group new
 *     seats join, then clicks empty cells to spawn them.
 *   • Drag placed seat → move to another empty cell (same group).
 *     Cross-group re-assignment isn't in MVP; delete + re-add is
 *     the workaround.
 *   • Double-click → rename inline.
 *   • Hover a seat → × delete button.
 *   • Unplaced strip below the canvas — chips for every seat still
 *     lacking coords across all groups. Drag onto the grid to place;
 *     drag a placed seat back onto the strip to un-place it.
 *
 * The parent (Property.tsx) manages `optionGroups` state; this
 * component receives them and calls back with a new list on every
 * change. It never mutates state directly.
 */

interface SharedCinemaCanvasProps {
  groups: itemsApi.UpsertPaymentPlanItemOptionGroup[];
  onChange: (groups: itemsApi.UpsertPaymentPlanItemOptionGroup[]) => void;
  disabled?: boolean;
  /** v-transport-canvas — 'cinema' swaps in a SCREEN gradient
   *  banner at the top; 'transport' shows a Van/Bus FRONT header
   *  with a car icon. The grid mechanics are identical either way;
   *  only the chrome differs. Defaults to 'cinema'. */
  variant?: 'cinema' | 'transport';
}

const MIN_ROWS = 8;
const MIN_COLS = 12;
const MAX_ROWS = 30;
const MAX_COLS = 30;
// v-transport-col-cap — Van/Bus layouts fit within a narrow cabin.
// Default to 5 (van shape: 2 seats + aisle + 2 seats) and cap at 8
// (wide coach bus). Operators can pick anything in-between via the
// Cols input surfaced on the canvas.
const TRANSPORT_MIN_COLS = 2;
const TRANSPORT_DEFAULT_COLS = 5;
const TRANSPORT_MAX_COLS = 8;

/** Tailwind class pairs per group index (background + hover + text)
 *  so groups are visually distinct on the canvas. Cycles past index
 *  6 — enough colours for any realistic cinema. */
const GROUP_COLORS: Array<{ bg: string; hover: string; ring: string; text: string; chip: string }> = [
  { bg: 'bg-indigo-100', hover: 'hover:bg-indigo-200', ring: 'ring-indigo-400', text: 'text-indigo-700', chip: 'bg-indigo-500' },
  { bg: 'bg-emerald-100', hover: 'hover:bg-emerald-200', ring: 'ring-emerald-400', text: 'text-emerald-700', chip: 'bg-emerald-500' },
  { bg: 'bg-amber-100', hover: 'hover:bg-amber-200', ring: 'ring-amber-400', text: 'text-amber-700', chip: 'bg-amber-500' },
  { bg: 'bg-rose-100', hover: 'hover:bg-rose-200', ring: 'ring-rose-400', text: 'text-rose-700', chip: 'bg-rose-500' },
  { bg: 'bg-cyan-100', hover: 'hover:bg-cyan-200', ring: 'ring-cyan-400', text: 'text-cyan-700', chip: 'bg-cyan-500' },
  { bg: 'bg-fuchsia-100', hover: 'hover:bg-fuchsia-200', ring: 'ring-fuchsia-400', text: 'text-fuchsia-700', chip: 'bg-fuchsia-500' },
  { bg: 'bg-lime-100', hover: 'hover:bg-lime-200', ring: 'ring-lime-400', text: 'text-lime-700', chip: 'bg-lime-500' },
];

export function CinemaSeatMapEditor({ groups, onChange, disabled = false, variant = 'cinema' }: SharedCinemaCanvasProps) {
  // Active group index — chip strip selects which group receives
  // seats clicked into empty cells. Defaults to the first group;
  // clamped whenever groups shrink so we don't point past the end.
  const [activeIdx, setActiveIdxRaw] = useState(0);
  const activeGroupIdx = Math.min(activeIdx, Math.max(0, groups.length - 1));
  const setActiveIdx = (i: number) => setActiveIdxRaw(Math.max(0, Math.min(i, groups.length - 1)));

  // v-cols-override — operator-picked grid width. null = auto (fit
  // to max placed seat). Constrained to the variant's [min, max]
  // range: transport 2..8, cinema 2..30. State is UI-local for now;
  // closing the popup resets it back to auto.
  const [colsOverride, setColsOverride] = useState<number | null>(
    variant === 'transport' ? TRANSPORT_DEFAULT_COLS : null
  );
  const variantMinCols = variant === 'transport' ? TRANSPORT_MIN_COLS : 2;
  const variantMaxCols = variant === 'transport' ? TRANSPORT_MAX_COLS : MAX_COLS;

  // Compute canvas dimensions — expand to fit the furthest placed
  // seat across every group + 2 rows/cols headroom.
  const { rows, cols } = useMemo(() => {
    const minColsForVariant = variant === 'transport' ? TRANSPORT_MIN_COLS : MIN_COLS;
    const maxColsForVariant = variant === 'transport' ? TRANSPORT_MAX_COLS : MAX_COLS;
    let maxR = MIN_ROWS - 1;
    let maxC = minColsForVariant - 1;
    for (const g of groups) {
      for (const o of g.options ?? []) {
        if (o.gridRow != null && o.gridRow > maxR) maxR = o.gridRow;
        if (o.gridCol != null && o.gridCol > maxC) maxC = o.gridCol;
      }
    }
    // v-cols-override — when the operator picks an explicit cols
    // value, respect it (clamped to the variant range + never
    // narrower than the furthest placed seat, otherwise we'd hide
    // valid seats). Auto-mode falls back to maxC + 2 padding.
    const autoCols = Math.min(maxColsForVariant, Math.max(minColsForVariant, maxC + 2));
    const cols = colsOverride != null
      ? Math.max(colsOverride, maxC + 1, minColsForVariant)
      : autoCols;
    return {
      rows: Math.min(MAX_ROWS, maxR + 2),
      cols,
    };
  }, [groups, variant, colsOverride]);

  // `cellIndex.get('r,c')` → { groupIdx, optIdx } for any placed
  // seat across all groups. Used both by cell rendering (lookup)
  // and the drop handler (collision check).
  const cellIndex = useMemo(() => {
    const m = new Map<string, { g: number; o: number }>();
    for (let g = 0; g < groups.length; g++) {
      const opts = groups[g].options ?? [];
      for (let o = 0; o < opts.length; o++) {
        const opt = opts[o];
        if (opt.gridRow != null && opt.gridCol != null) {
          m.set(`${opt.gridRow},${opt.gridCol}`, { g, o });
        }
      }
    }
    return m;
  }, [groups]);

  const unplaced = useMemo(() => {
    const out: Array<{ g: number; o: number; opt: itemsApi.UpsertPaymentPlanItemOption }> = [];
    for (let g = 0; g < groups.length; g++) {
      const opts = groups[g].options ?? [];
      for (let o = 0; o < opts.length; o++) {
        const opt = opts[o];
        if (opt.gridRow == null || opt.gridCol == null) out.push({ g, o, opt });
      }
    }
    return out;
  }, [groups]);

  // v-cinema-canvas-screen-look — per-row primary group so the canvas
  // can render "VIP RECLINERS" / "STANDARD SEATING" captions between
  // rows the way the read-only cinema map does. Primary = group with
  // the most seats in that row; ties break by lowest group index for
  // stability. Rows with no seats produce null (no caption).
  const rowPrimaryGroups = useMemo(() => {
    const out: Array<{ groupIdx: number; name: string } | null> = [];
    for (let r = 0; r < rows; r++) {
      const counts = new Map<number, number>();
      for (let c = 0; c < cols; c++) {
        const occ = cellIndex.get(`${r},${c}`);
        if (occ) counts.set(occ.g, (counts.get(occ.g) ?? 0) + 1);
      }
      if (counts.size === 0) { out.push(null); continue; }
      const primary = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      const name = (groups[primary].name ?? '').trim() || `Group ${primary + 1}`;
      out.push({ groupIdx: primary, name });
    }
    return out;
  }, [rows, cols, cellIndex, groups]);

  // Drag source — captured on dragstart. Drop targets read this to
  // know which group + option to move.
  const [drag, setDrag] = useState<{ g: number; o: number } | null>(null);

  const patchOption = (g: number, o: number, patch: Partial<itemsApi.UpsertPaymentPlanItemOption>) => {
    onChange(groups.map((grp, gi) => gi !== g ? grp : {
      ...grp,
      options: (grp.options ?? []).map((opt, oi) => oi === o ? { ...opt, ...patch } : opt),
    }));
  };

  const removeOption = (g: number, o: number) => {
    onChange(groups.map((grp, gi) => gi !== g ? grp : {
      ...grp,
      options: (grp.options ?? []).filter((_, oi) => oi !== o),
    }));
  };

  const spawnAt = (r: number, c: number) => {
    if (groups.length === 0) return;
    // v-transport-driver-cell — (0, 0) is reserved chrome on the
    // transport variant; refuse spawns / drops there.
    if (variant === 'transport' && r === 0 && c === 0) return;
    const g = activeGroupIdx;
    const opts = groups[g].options ?? [];
    // Auto-name — same "<prefix>-<2-digit>" contract as the group's
    // bulk generator, defaulting to "Seat" when the group is fresh.
    // Prefix is inferred from existing seat names in the active
    // group (shared root of the highest-numbered seat), or falls
    // back to "Seat".
    const prefix = inferPrefix(opts) || 'Seat';
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escape(prefix)}[\\s\\-_.]*(\\d+)$`, 'i');
    let n = 1;
    for (const o of opts) {
      const m = re.exec((o.name ?? '').trim());
      if (m) n = Math.max(n, Number(m[1]) + 1);
    }
    const nextGroups = [...groups];
    nextGroups[g] = {
      ...nextGroups[g],
      options: [
        ...opts,
        {
          name: `${prefix}-${String(n).padStart(2, '0')}`,
          description: null,
          price: null,
          imageUrl: null,
          active: true,
          sortOrder: opts.length,
          gridRow: r,
          gridCol: c,
        },
      ],
    };
    onChange(nextGroups);
  };

  const onCellDrop = (r: number, c: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!drag) return;
    // v-transport-driver-cell — (0, 0) is reserved chrome on the
    // transport variant. Any drop there is a no-op.
    if (variant === 'transport' && r === 0 && c === 0) { setDrag(null); return; }
    // No cross-group cell collision — if the target cell is
    // already filled, no-op (operator drags to an empty cell).
    const occupant = cellIndex.get(`${r},${c}`);
    if (occupant && (occupant.g !== drag.g || occupant.o !== drag.o)) { setDrag(null); return; }
    patchOption(drag.g, drag.o, { gridRow: r, gridCol: c });
    setDrag(null);
  };

  const onUnplacedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!drag) return;
    patchOption(drag.g, drag.o, { gridRow: null, gridCol: null });
    setDrag(null);
  };

  return (
    <div className="space-y-2">
      {/* Group chip strip — colour swatch + name + count. Click to
          activate; the active group receives new seats spawned by
          empty-cell clicks. */}
      <div className="flex items-center flex-wrap gap-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Adding to</span>
        {groups.length === 0 ? (
          <span className="text-[11px] italic text-gray-400">
            Add a group above to enable seat placement.
          </span>
        ) : (
          groups.map((g, i) => (
            <GroupChip
              key={g.id ?? `newga-${i}`}
              group={g}
              index={i}
              active={i === activeGroupIdx}
              disabled={disabled}
              onActivate={() => setActiveIdx(i)}
              onRename={next => onChange(groups.map((gg, gi) => gi === i ? { ...gg, name: next } : gg))}
              onDelete={() => onChange(groups.filter((_, gi) => gi !== i))}
            />
          ))
        )}
        {/* v-cols-override — grid width picker. Range clamps to the
            variant's [min, max]; can't be narrower than the furthest
            placed seat (that seat would fall off the canvas). */}
        <div className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
          Cols
          <Input
            type="number"
            min={variantMinCols}
            max={variantMaxCols}
            value={cols}
            onChange={e => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              setColsOverride(Math.max(variantMinCols, Math.min(variantMaxCols, Math.floor(v))));
            }}
            className="h-6 w-14 text-[11px] text-center tabular-nums"
            disabled={disabled}
            title={`Canvas width (min ${variantMinCols}, max ${variantMaxCols})`}
          />
        </div>
      </div>

      {/* Unplaced strip — chips for every seat lacking coords across
          all groups. Also the drop-target that un-places a seat when
          a placed one is dragged onto it. */}
      <div
        onDragOver={e => { if (drag) e.preventDefault(); }}
        onDrop={onUnplacedDrop}
        className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 min-h-[44px]"
      >
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
          Unplaced ({unplaced.length})
          <span className="ml-2 text-gray-400 normal-case tracking-normal">
            {disabled ? '' : '— drag onto the grid to place'}
          </span>
        </div>
        {unplaced.length === 0 ? (
          <div className="text-[11px] italic text-gray-400 px-1">
            Every seat is placed. Click an empty cell to add another.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {unplaced.map(({ g, o, opt }) => {
              const color = GROUP_COLORS[g % GROUP_COLORS.length];
              return (
                <SeatChip
                  key={opt.id ?? `newu-${g}-${o}`}
                  option={opt}
                  color={color}
                  draggable={!disabled}
                  onDragStart={() => setDrag({ g, o })}
                  onDelete={() => removeOption(g, o)}
                  disabled={disabled}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Canvas — one shared grid across every group.
          v-transport-van-cabin: transport variant wraps the grid in
          the same van-cabin chrome the read-only booking popup uses
          (indigo outer, white rounded-top pill, handle bar). Cinema
          variant keeps the flat white card + SCREEN gradient. Grid
          mechanics identical either way — extracted below so both
          branches render it. */}
      {(() => {
        const grid = (
          <div
            className="grid gap-1 w-fit mx-auto"
            style={{ gridTemplateColumns: `24px repeat(${cols}, minmax(28px, 32px))` }}
          >
            <div />
            {Array.from({ length: cols }, (_, c) => (
              <div key={`col-${c}`} className="text-[9px] text-gray-400 text-center leading-none pb-1">
                {c + 1}
              </div>
            ))}
            {Array.from({ length: rows }, (_, r) => (
              <Fragment key={`row-${r}`}>
                {(() => {
                  const cur = rowPrimaryGroups[r];
                  const prev = r > 0 ? rowPrimaryGroups[r - 1] : null;
                  if (!cur || cur.groupIdx === prev?.groupIdx) return null;
                  const color = GROUP_COLORS[cur.groupIdx % GROUP_COLORS.length];
                  return (
                    <div
                      className="text-center text-[10px] font-semibold tracking-widest uppercase pt-2 pb-1"
                      style={{ gridColumn: `1 / span ${cols + 1}` }}
                    >
                      <span className={`inline-flex items-center gap-1.5 ${color.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${color.chip}`} />
                        {cur.name}
                      </span>
                    </div>
                  );
                })()}
                <div className="text-[9px] text-gray-400 text-center leading-none flex items-center justify-center">
                  {String.fromCharCode(65 + r)}
                </div>
                {Array.from({ length: cols }, (_, c) => {
                  // v-transport-driver-cell — reserve (row 0, col 0)
                  // as a fixed DRIVER chrome cell for the transport
                  // variant. Never clickable / droppable — the
                  // driver isn't a bookable seat. If a legacy row
                  // has a real seat at (0, 0), the seat wins (so we
                  // don't accidentally hide operator data).
                  const occ = cellIndex.get(`${r},${c}`);
                  if (variant === 'transport' && r === 0 && c === 0 && !occ) {
                    return <DriverCell key={`driver-${r}-${c}`} />;
                  }
                  if (!occ) {
                    return (
                      <EmptyCell
                        key={`cell-${r}-${c}`}
                        onDrop={onCellDrop(r, c)}
                        onClick={disabled || groups.length === 0 ? undefined : () => spawnAt(r, c)}
                        disabled={disabled || groups.length === 0}
                      />
                    );
                  }
                  const opt = groups[occ.g].options![occ.o];
                  const color = GROUP_COLORS[occ.g % GROUP_COLORS.length];
                  return (
                    <FilledCell
                      key={opt.id ?? `newp-${occ.g}-${occ.o}`}
                      option={opt}
                      color={color}
                      draggable={!disabled}
                      onDragStart={() => setDrag({ g: occ.g, o: occ.o })}
                      onDrop={onCellDrop(r, c)}
                      onDelete={() => removeOption(occ.g, occ.o)}
                      onRename={next => patchOption(occ.g, occ.o, { name: next })}
                      disabled={disabled}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        );

        if (variant === 'transport') {
          return (
            <div
              className="rounded-2xl bg-indigo-50/70 p-4 overflow-x-auto"
              onDragOver={e => { if (drag) e.preventDefault(); }}
            >
              <div className="bg-white rounded-t-[3rem] rounded-b-2xl shadow-sm px-6 pt-5 pb-5 w-fit mx-auto">
                {/* Handle bar + FRONT hint mirror the read-only van
                    card so the editor visually reads as a vehicle
                    cabin. Both are chrome — the operator's seats
                    live in the grid below. */}
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200" />
                <div className="flex items-center justify-center gap-1.5 text-[9px] font-semibold tracking-[0.3em] text-gray-500 pb-2 border-b border-gray-100 mb-3">
                  <Car className="h-3.5 w-3.5 text-gray-500" />
                  FRONT
                </div>
                {grid}
              </div>
            </div>
          );
        }
        return (
          <div
            className="rounded-lg border bg-white px-3 py-4 overflow-x-auto"
            onDragOver={e => { if (drag) e.preventDefault(); }}
          >
            <div className="mx-auto max-w-md mb-4">
              <div className="h-1.5 rounded-t-full bg-gradient-to-r from-indigo-300 via-indigo-500 to-indigo-300" />
              <div className="text-center text-[10px] font-semibold tracking-[0.3em] text-gray-500 pt-1.5">
                SCREEN
              </div>
            </div>
            {grid}
          </div>
        );
      })()}
    </div>
  );
}

/** Best-effort prefix inference from existing seat names in a group.
 *  Picks the shared `<letters>` root of names matching
 *  `<letters>[\s\-_.]<digits>` — if all seats look like `A-01, A-02`,
 *  the prefix is "A". Falls back to null (caller uses "Seat"). */
function inferPrefix(opts: itemsApi.UpsertPaymentPlanItemOption[]): string | null {
  const re = /^([A-Za-z]+)[\s\-_.]*\d+$/;
  const prefixes = new Set<string>();
  for (const o of opts) {
    const m = re.exec((o.name ?? '').trim());
    if (m) prefixes.add(m[1]);
  }
  return prefixes.size === 1 ? Array.from(prefixes)[0] : null;
}

type Color = typeof GROUP_COLORS[number];

/** v-property-view-groupstack-hidden — chip in the "Adding to" strip.
 *  Doubles as the group management surface now that the tabular
 *  group cards are hidden from the Manage Layout popup: double-click
 *  to rename, × on hover to delete, single click to activate. */
function GroupChip({
  group, index, active, disabled, onActivate, onRename, onDelete,
}: {
  group: itemsApi.UpsertPaymentPlanItemOptionGroup;
  index: number;
  active: boolean;
  disabled: boolean;
  onActivate: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  const name = (group.name ?? '').trim() || `Group ${index + 1}`;
  const count = (group.options ?? []).length;
  const [editing, setEditing] = useState(false);
  const activeCls = `${color.bg} ${color.text} border-transparent ring-2 ${color.ring}`;
  const idleCls = 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50';
  if (editing) {
    return (
      <Input
        autoFocus
        defaultValue={group.name ?? ''}
        onBlur={e => { onRename(e.currentTarget.value); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onRename(e.currentTarget.value); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-6 text-[11px] w-32 px-2"
      />
    );
  }
  return (
    <div className={`group inline-flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5 text-[11px] border transition ${active ? activeCls : idleCls}`}>
      <button
        type="button"
        onClick={onActivate}
        onDoubleClick={disabled ? undefined : () => setEditing(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5"
        title={disabled ? name : `${name} — click to activate, double-click to rename`}
      >
        <span className={`h-2 w-2 rounded-full ${color.chip}`} />
        {name}
        <span className="text-[10px] text-gray-400 tabular-nums">{count}</span>
      </button>
      {!disabled && (
        <button
          type="button"
          onClick={() => {
            if (count > 0 && !confirm(`Delete "${name}" and its ${count} seat${count === 1 ? '' : 's'}?`)) return;
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 rounded-full h-4 w-4 flex items-center justify-center hover:bg-red-100 text-gray-400 hover:text-red-600 transition"
          title="Delete group"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** v-transport-driver-cell — fixed decorative DRIVER cell that
 *  occupies (row 0, col 0) on the transport variant canvas. Not
 *  clickable / droppable — the driver isn't a bookable seat, but
 *  it's essential chrome so the cabin reads as a real vehicle. */
function DriverCell() {
  return (
    <div
      className="h-7 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-[8px] font-semibold tracking-widest text-gray-500 select-none cursor-default"
      title="Driver — fixed position"
    >
      <Car className="h-3 w-3 mr-0.5" />
      DRV
    </div>
  );
}

function EmptyCell({
  onDrop, onClick, disabled,
}: {
  onDrop: (e: React.DragEvent) => void;
  onClick?: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      disabled={disabled}
      className="h-7 rounded border border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 transition disabled:cursor-not-allowed"
      title={disabled ? '' : 'Click to add a seat here'}
    />
  );
}

function FilledCell({
  option, color, draggable, onDragStart, onDrop, onDelete, onRename, disabled,
}: {
  option: itemsApi.UpsertPaymentPlanItemOption;
  color: Color;
  draggable: boolean;
  onDragStart: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDelete: () => void;
  onRename: (next: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const short = (option.name ?? '').replace(/^.*?[\s\-_.]+/, '');
  if (editing) {
    return (
      <Input
        autoFocus
        defaultValue={option.name}
        onBlur={e => { onRename(e.currentTarget.value); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onRename(e.currentTarget.value); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-7 text-[10px] px-1 text-center"
      />
    );
  }
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onDoubleClick={disabled ? undefined : () => setEditing(true)}
      className={`group relative h-7 rounded ${
        option.active ? `${color.bg} ${color.text}` : 'bg-gray-200 text-gray-500 line-through'
      } flex items-center justify-center text-[10px] font-semibold cursor-grab active:cursor-grabbing ${color.hover} select-none`}
      title={`${option.name}${option.price != null ? ` · $${Number(option.price).toFixed(2)}` : ''}\nDouble-click to rename\nDrag to move`}
    >
      <span className="truncate px-0.5">{short || option.name}</span>
      {!disabled && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center leading-none"
          title="Delete seat"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function SeatChip({
  option, color, draggable, onDragStart, onDelete, disabled,
}: {
  option: itemsApi.UpsertPaymentPlanItemOption;
  color: Color;
  draggable: boolean;
  onDragStart: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${color.bg} ${color.text} border border-white text-[11px] cursor-grab active:cursor-grabbing`}
      title="Drag onto the grid to place"
    >
      <span className={option.active ? '' : 'line-through opacity-70'}>
        {option.name}
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={onDelete}
          className="text-current opacity-60 hover:opacity-100"
          title="Delete seat"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
