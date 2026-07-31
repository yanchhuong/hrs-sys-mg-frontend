import { useState } from 'react';
import { Plus, Trash2, X, Accessibility, Home, Bed, Crown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import type * as itemsApi from '../../api/paymentPlanItems';

/**
 * v-accommodation-layout (V299) — Manage-Layout renderer for
 * accommodation properties (hotels, condos, apartments). Unlike
 * cinema (SCREEN grid) or transport (van cabin), an accommodation
 * property is a set of rooms grouped by floor / tier. There's no
 * physical seating layout — just rooms listed inside their group
 * as tiles, mirroring the operator-facing "floor selection" UI
 * from real hotel booking systems.
 *
 * Shape:
 *   • Each group renders as a titled section with a small
 *     leading icon (crown for penthouse-like names, bed for
 *     standard rooms, home fallback).
 *   • Options render as square tiles inside the group's flex-wrap
 *     grid. Click a tile to rename inline; × on hover to delete.
 *   • "+ Add" tile at the end spawns a new room with an auto-name
 *     derived from the bulk generator's prefix.
 *   • Per-group bulk generator sits above the tile grid.
 *
 * Deliberately no grid coordinates — accommodation options don't
 * need (row, col). They round-trip whatever gridRow/gridCol the
 * BE returned but don't render them; the tile order comes from
 * `sortOrder`.
 */

interface AccommodationLayoutEditorProps {
  groups: itemsApi.UpsertPaymentPlanItemOptionGroup[];
  onChange: (groups: itemsApi.UpsertPaymentPlanItemOptionGroup[]) => void;
  disabled?: boolean;
}

/** Best-effort icon pick per group name — matches common hotel
 *  vernacular so the section header carries a small visual cue.
 *  Falls back to a Home icon when no keyword matches. */
function iconFor(name: string) {
  const n = (name ?? '').toLowerCase();
  if (/penthouse|suite\s*plus|royal|executive|presidential/.test(n)) return Crown;
  if (/standard|room|deluxe|superior|classic|basic/.test(n))         return Bed;
  return Home;
}

export function AccommodationLayoutEditor({ groups, onChange, disabled = false }: AccommodationLayoutEditorProps) {
  return (
    <div className="space-y-4">
      {/* Legend — mirrors the cinema canvas legend for
          cross-category consistency; ACCESSIBLE keeps the
          wheelchair symbol so rooms flagged in their description
          are visually recognisable. */}
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
        <span className="inline-flex items-center gap-1.5 ml-auto">
          <Accessibility className="h-4 w-4 text-gray-700" /> Accessible
        </span>
      </div>

      {groups.length === 0 && (
        <div className="text-[11px] italic text-gray-400 py-4 text-center border rounded">
          Add a group above (Standard Rooms, Deluxe Suites, Penthouse…) to start listing rooms.
        </div>
      )}

      {groups.map((group, gIdx) => (
        <GroupTileSection
          key={group.id ?? `accg-${gIdx}`}
          group={group}
          disabled={disabled}
          onChange={next => onChange(groups.map((x, i) => i === gIdx ? next : x))}
          onRemove={() => {
            const count = (group.options ?? []).length;
            if (count > 0 && !confirm(`Delete group "${group.name}" and its ${count} room${count === 1 ? '' : 's'}?`)) return;
            onChange(groups.filter((_, i) => i !== gIdx));
          }}
        />
      ))}
    </div>
  );
}

function GroupTileSection({
  group, disabled, onChange, onRemove,
}: {
  group: itemsApi.UpsertPaymentPlanItemOptionGroup;
  disabled: boolean;
  onChange: (next: itemsApi.UpsertPaymentPlanItemOptionGroup) => void;
  onRemove: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [bulkCount, setBulkCount] = useState('12');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPrefix, setBulkPrefix] = useState('Room');
  const Icon = iconFor(group.name ?? '');
  const name = (group.name ?? '').trim() || 'Untitled group';
  const opts = group.options ?? [];

  const setOpts = (mapper: (list: itemsApi.UpsertPaymentPlanItemOption[]) => itemsApi.UpsertPaymentPlanItemOption[]) => {
    onChange({ ...group, options: mapper(opts) });
  };

  const addOne = () => {
    const prefix = (bulkPrefix || '').trim() || 'Room';
    // Auto-number based on the highest existing suffix on this
    // group's options, so single Add keeps the sequence going.
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escape(prefix)}[\\s\\-_.]*(\\d+)$`, 'i');
    let n = 1;
    for (const o of opts) {
      const m = re.exec((o.name ?? '').trim());
      if (m) n = Math.max(n, Number(m[1]) + 1);
    }
    setOpts(list => [...list, {
      name: `${prefix}-${String(n).padStart(2, '0')}`,
      description: null,
      price: Number(bulkPrice) >= 0 ? Number(bulkPrice) : null,
      imageUrl: null,
      active: true,
      sortOrder: list.length,
    }]);
  };

  const generateBulk = () => {
    const count = Math.floor(Number(bulkCount) || 0);
    if (count < 1) { toast.error('Count must be at least 1'); return; }
    if (count > 500) { toast.error('Cap is 500 rooms at a time'); return; }
    const priceNum = Number(bulkPrice);
    if (!(priceNum >= 0)) { toast.error('Enter a valid price'); return; }
    const prefix = (bulkPrefix || '').trim() || 'Room';
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escape(prefix)}[\\s\\-_.]*(\\d+)$`, 'i');
    let startNum = 1;
    for (const o of opts) {
      const m = re.exec((o.name ?? '').trim());
      if (m) startNum = Math.max(startNum, Number(m[1]) + 1);
    }
    setOpts(list => {
      const next = [...list];
      for (let i = 0; i < count; i++) {
        const n = startNum + i;
        next.push({
          name: `${prefix}-${String(n).padStart(2, '0')}`,
          price: priceNum,
          description: null,
          active: true,
          sortOrder: next.length,
        });
      }
      return next;
    });
    toast.success(`Added ${count} room${count === 1 ? '' : 's'}`);
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      {/* Section header — icon + group name (rename on click) + count
          + delete button. Mirrors the hotel "PENTHOUSE COLLECTION"
          style of the reference UI. */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
        <Icon className="h-4 w-4 text-indigo-600" />
        {editingName ? (
          <Input
            autoFocus
            defaultValue={group.name ?? ''}
            onBlur={e => { onChange({ ...group, name: e.currentTarget.value }); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { onChange({ ...group, name: e.currentTarget.value }); setEditingName(false); }
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="h-7 text-sm font-semibold uppercase tracking-widest max-w-xs"
          />
        ) : (
          <button
            type="button"
            onClick={disabled ? undefined : () => setEditingName(true)}
            disabled={disabled}
            className="text-sm font-semibold uppercase tracking-widest text-gray-700 hover:text-indigo-600"
            title={disabled ? '' : 'Click to rename'}
          >
            {name}
          </button>
        )}
        <span className="text-[11px] text-gray-400 tabular-nums ml-1">
          {opts.length} room{opts.length === 1 ? '' : 's'}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-gray-400 hover:text-red-600"
            title="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Bulk generator row — count / price / prefix + Generate.
          Same contract as the cinema editor for muscle-memory
          consistency; Prefix defaults to "Room" here. */}
      <div className="flex items-end gap-2 flex-wrap rounded-md border border-dashed border-gray-300 bg-gray-50/60 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Count</span>
          <Input
            type="number" min="1" max="500"
            value={bulkCount}
            onChange={e => setBulkCount(e.target.value)}
            className="h-8 w-16 text-sm text-right tabular-nums"
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Price each</span>
          <Input
            type="number" step="0.01" min="0"
            value={bulkPrice}
            onChange={e => setBulkPrice(e.target.value)}
            placeholder="0.00"
            className="h-8 w-24 text-sm text-right tabular-nums"
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Prefix</span>
          <Input
            value={bulkPrefix}
            onChange={e => setBulkPrefix(e.target.value)}
            placeholder="Room"
            maxLength={40}
            className="h-8 text-sm"
            disabled={disabled}
          />
        </div>
        <Button
          size="sm" variant="outline" className="h-8"
          disabled={disabled || !(bulkPrefix || '').trim() || !(Number(bulkCount) >= 1) || bulkPrice === '' || !(Number(bulkPrice) >= 0)}
          onClick={generateBulk}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Generate
        </Button>
      </div>

      {/* Tile grid — flex-wrap of small squares showing the room
          number (short form). Each tile: click name to rename in
          place; × on hover to delete. + tile at end adds one. */}
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o, idx) => (
          <RoomTile
            key={o.id ?? `newr-${idx}`}
            option={o}
            disabled={disabled}
            onRename={next => setOpts(list => list.map((x, i) => i === idx ? { ...x, name: next } : x))}
            onDelete={() => setOpts(list => list.filter((_, i) => i !== idx))}
            onTogglePrice={next => setOpts(list => list.map((x, i) => i === idx ? { ...x, price: next } : x))}
          />
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={addOne}
            className="h-11 min-w-[3rem] px-2 rounded-md border border-dashed border-gray-300 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 text-xs font-medium flex items-center justify-center"
            title="Add a room to this group"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** One room rendered as a small tile. Click the name to rename
 *  inline. Hover shows a × to delete. Wheelchair-accessible rooms
 *  (name/description matches the keyword) get an inline icon. */
function RoomTile({
  option, disabled, onRename, onDelete, onTogglePrice,
}: {
  option: itemsApi.UpsertPaymentPlanItemOption;
  disabled: boolean;
  onRename: (next: string) => void;
  onDelete: () => void;
  onTogglePrice: (next: number | null) => void;
}) {
  const [editing, setEditing] = useState<'name' | 'price' | null>(null);
  const short = (option.name ?? '').replace(/^.*?[\s\-_.]+/, '') || (option.name ?? '');
  const isAccessible = /(accessible|wheelchair|handicap)/i.test(
    (option.description ?? '') + ' ' + (option.name ?? ''),
  );
  const inactive = option.active === false;

  if (editing === 'name') {
    return (
      <Input
        autoFocus
        defaultValue={option.name}
        onBlur={e => { onRename(e.currentTarget.value); setEditing(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onRename(e.currentTarget.value); setEditing(null); }
          if (e.key === 'Escape') setEditing(null);
        }}
        className="h-11 w-20 text-xs text-center"
      />
    );
  }
  if (editing === 'price') {
    return (
      <Input
        autoFocus
        type="number" step="0.01" min="0"
        defaultValue={option.price == null ? '' : String(option.price)}
        onBlur={e => {
          const v = e.currentTarget.value;
          onTogglePrice(v === '' ? null : Number(v));
          setEditing(null);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const v = e.currentTarget.value;
            onTogglePrice(v === '' ? null : Number(v));
            setEditing(null);
          }
          if (e.key === 'Escape') setEditing(null);
        }}
        className="h-11 w-20 text-xs text-right tabular-nums"
        placeholder="$"
      />
    );
  }
  return (
    <div
      className={`group relative h-11 min-w-[3rem] px-2 rounded-md flex flex-col items-center justify-center text-xs font-semibold tabular-nums select-none border ${
        inactive
          ? 'bg-gray-100 text-gray-400 line-through border-gray-200'
          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200'
      }`}
      title={`${option.name}${option.price != null ? ` — $${Number(option.price).toFixed(2)}` : ''}\nClick to rename · Right-click to edit price`}
    >
      <button
        type="button"
        onClick={disabled ? undefined : () => setEditing('name')}
        onContextMenu={disabled ? undefined : (e) => { e.preventDefault(); setEditing('price'); }}
        disabled={disabled}
        className="flex flex-col items-center justify-center leading-tight"
      >
        <span className="truncate max-w-[3.5rem]">{short}</span>
        {option.price != null && (
          <span className="text-[9px] font-normal text-current opacity-70">
            ${Number(option.price).toFixed(0)}
          </span>
        )}
      </button>
      {isAccessible && (
        <Accessibility className="absolute -bottom-0.5 -right-0.5 h-3 w-3 opacity-80" />
      )}
      {!disabled && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center leading-none"
          title="Delete room"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
