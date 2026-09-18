/**
 * Org Chart — Profile view. The classic top-down card chart: a person
 * per card with their photo, connected by elbow lines to the people
 * who report to them.
 *
 * <h3>Relationship to the List view</h3>
 * Same tree, same filters, different shape. The List view is the one
 * that scales — it stays readable at 200 people and prints. This view
 * trades that for recognisability: photos and a real hierarchy picture,
 * which is what people expect an "org chart" to look like and what
 * makes it useful to hand to someone outside HR.
 *
 * <h3>Structure is the manager tree, nothing else</h3>
 * Cards are tinted by department, but departments do NOT group the
 * chart — the only edges drawn are `managerId`. A department band
 * between a manager and their reports would be a level that does not
 * exist in the data, and anyone reporting across departments would have
 * to be filed somewhere arbitrary. Colour carries the department
 * instead, with a legend, so nothing is invented.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { EmployeeAvatar } from '../common/EmployeeAvatar';
import { Button } from '../ui/button';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { Employee } from '../../types/hrms';
import type { OrgNode } from './OrgChartTab';

/**
 * Card tints. Department colours are presentation-only in this app —
 * DepsGroup assigns them by list index, so they are not persisted and
 * would differ between screens. Hashing the department id instead gives
 * a colour that is stable for a given department everywhere, forever,
 * without a migration.
 */
const TINTS = [
  { bar: 'bg-blue-500',    chip: 'bg-blue-100 text-blue-800' },
  { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  { bar: 'bg-violet-500',  chip: 'bg-violet-100 text-violet-800' },
  { bar: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-800' },
  { bar: 'bg-rose-500',    chip: 'bg-rose-100 text-rose-800' },
  { bar: 'bg-teal-500',    chip: 'bg-teal-100 text-teal-800' },
  { bar: 'bg-pink-500',    chip: 'bg-pink-100 text-pink-800' },
  { bar: 'bg-indigo-500',  chip: 'bg-indigo-100 text-indigo-800' },
];

function tintFor(deptKey: string | undefined): typeof TINTS[number] | null {
  if (!deptKey) return null;
  let h = 0;
  for (let i = 0; i < deptKey.length; i++) h = (h * 31 + deptKey.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

const LINE = 'bg-gray-300';

export function OrgChartProfile({
  roots, matchPaths, deptName, onOpenEmployee,
}: {
  roots: OrgNode[];
  /** Ids to keep when a search / position filter is active; null = show
   *  everything. Shared with the List view so both obey one filter. */
  matchPaths: Set<string> | null;
  deptName: (id?: string) => string;
  onOpenEmployee: (e: Employee) => void;
}) {
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const keyOf = (e: Employee) => (e as { apiId?: string }).apiId ?? e.id;

  /** Departments actually drawn, for the legend. Built from the same
   *  filtered set the chart renders so the legend never lists a colour
   *  that isn't on screen. */
  const legend = useMemo(() => {
    const seen = new Map<string, string>();
    const walk = (n: OrgNode) => {
      if (!matchPaths || matchPaths.has(keyOf(n.emp))) {
        const id = n.emp.department;
        const name = deptName(id);
        if (id && name && name !== '-') seen.set(id, name);
      }
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [roots, matchPaths, deptName]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore drags that start on a card — those are clicks to open a
    // person, and panning would swallow them.
    if ((e.target as HTMLElement).closest('[data-org-card]')) return;
    dragState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
  };

  const endDrag = useCallback(() => {
    dragState.current = null;
    setDragging(false);
  }, []);

  const reset = () => { setZoom(0.9); setPan({ x: 0, y: 0 }); };

  const card = (n: OrgNode) => {
    const tint = tintFor(n.emp.department);
    const dept = deptName(n.emp.department);
    return (
      <button
        type="button"
        data-org-card
        onClick={() => onOpenEmployee(n.emp)}
        title={dept && dept !== '-' ? `${n.emp.name} · ${dept}` : n.emp.name}
        className="relative w-[190px] shrink-0 overflow-hidden rounded-lg border border-gray-200
                   bg-white text-left shadow-sm transition-shadow hover:shadow-md"
      >
        {/* Department stripe — the only thing colour encodes here. */}
        <span className={`absolute inset-y-0 left-0 w-1 ${tint ? tint.bar : 'bg-gray-200'}`} />
        <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
          <EmployeeAvatar
            employee={n.emp}
            className="h-9 w-9 shrink-0"
            fallbackClassName="text-[11px]"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">{n.emp.name}</div>
            <div className="truncate text-xs text-gray-500">{n.emp.position || '—'}</div>
          </div>
        </div>
      </button>
    );
  };

  /**
   * One subtree. Connectors are plain divs rather than SVG: the parent
   * drops a stub, each child draws a half-width rail on the side facing
   * its siblings plus its own stub, and the rails meet to form the bar.
   * That keeps the lines glued to the cards at any zoom without
   * measuring anything.
   */
  const renderNode = (n: OrgNode): React.ReactNode => {
    if (matchPaths && !matchPaths.has(keyOf(n.emp))) return null;
    const kids = n.children.filter(c => !matchPaths || matchPaths.has(keyOf(c.emp)));
    const only = kids.length === 1;

    return (
      <div key={keyOf(n.emp)} className="flex flex-col items-center">
        {card(n)}

        {kids.length > 0 && (
          <>
            <div className={`h-5 w-px ${LINE}`} />
            <div className="flex items-start">
              {kids.map((c, i) => (
                <div key={keyOf(c.emp)} className="flex flex-col items-center px-3">
                  <div className="relative h-5 w-full">
                    {!only && (
                      <div
                        className={`absolute top-0 h-px ${LINE} `
                          + (i === 0 ? 'left-1/2 right-0'
                            : i === kids.length - 1 ? 'left-0 right-1/2'
                              : 'left-0 right-0')}
                      />
                    )}
                    <div className={`absolute left-1/2 top-0 h-5 w-px ${LINE}`} />
                  </div>
                  {renderNode(c)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const visibleRoots = roots.filter(r => !matchPaths || matchPaths.has(keyOf(r.emp)));

  return (
    <div className="space-y-2">
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {legend.map(([id, name]) => (
            <span key={id} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${tintFor(id)?.bar ?? 'bg-gray-200'}`} />
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden rounded-md border bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
        <div
          className={`h-[68vh] w-full ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="inline-flex origin-top-left items-start gap-8 p-6"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              // Panning is a direct manipulation — a transition would
              // make the canvas lag behind the pointer.
              transition: dragging ? 'none' : 'transform 120ms ease-out',
            }}
          >
            {visibleRoots.length === 0
              ? <p className="text-sm text-gray-500">Nobody matches the current filter.</p>
              : visibleRoots.map(renderNode)}
          </div>
        </div>

        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8 bg-white"
            onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(2)))}
            title="Zoom in" aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-white"
            onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))}
            title="Zoom out" aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-white"
            onClick={reset} title="Reset view" aria-label="Reset view">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <span className="absolute bottom-3 left-3 rounded bg-white/80 px-1.5 py-0.5 text-[11px] text-gray-500">
          {Math.round(zoom * 100)}% · drag to pan
        </span>
      </div>
    </div>
  );
}
