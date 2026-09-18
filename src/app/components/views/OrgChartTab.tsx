import React, { useMemo, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Search, ChevronDown, CornerLeftUp, List, LayoutGrid } from 'lucide-react';
import { Employee } from '../../types/hrms';
import { EmployeeAvatar } from '../common/EmployeeAvatar';
import { OrgChartProfile } from './OrgChartProfile';

/**
 * Org Chart — the reporting hierarchy, read from the same `managerId`
 * the roster's Managers column shows.
 *
 * <h3>Why an indented tree rather than boxes-and-connectors</h3>
 * The classic org-chart shape (centred boxes, elbow connectors, one
 * row per level) stops being readable past a few dozen people: a
 * 232-person roster is metres wide, needs pan/zoom to navigate, and
 * answers "who reports to whom" worse than a list does. An indented,
 * collapsible tree scales to any headcount, stays searchable, keeps
 * every row scannable at a glance, and prints. It is the shape every
 * large-directory product converges on for the same reason.
 *
 * <h3>Drag to re-parent</h3>
 * Dropping a person onto another person sets their manager; dropping
 * onto the Top-management zone clears it. Saves optimistically with an
 * Undo on the toast. Drops that would make somebody their own ancestor
 * are refused at the target rather than being created and then
 * repaired by {@link buildOrgForest}'s cycle-breaker on the next
 * render — a loop that briefly exists is a loop that can be saved.
 */

export interface OrgNode {
  emp: Employee;
  children: OrgNode[];
  /** 0 = top management — nobody to report to. */
  level: number;
  /** Everyone beneath this node at any depth. */
  totalBelow: number;
}

const keyOf = (e: Employee) => (e as { apiId?: string }).apiId ?? e.id;

/**
 * Build the reporting forest from `managerId`.
 *
 * Only level 1 of the ladder defines structure. Manager 2 / 3 are
 * escalation levels; treating them as edges would give most people
 * three parents and the tree would stop being a tree.
 *
 * Roots are employees with no manager — **Level 0, top management**.
 * Two other cases also surface as roots, deliberately rather than
 * silently vanishing from the chart:
 *
 *   • an **orphan**, whose managerId points at somebody outside the
 *     current view (inactive, deleted). Left alone it would be
 *     unreachable from any root and simply disappear.
 *   • a **cycle** (A reports to B reports to A), which real data does
 *     contain after a careless edit. The walk below detects the loop
 *     and re-roots the node rather than recursing forever.
 */
export function buildOrgForest(employees: Employee[]): {
  roots: OrgNode[];
  orphanCount: number;
  cycleCount: number;
  /** Effective parent per key, AFTER orphan/cycle repair. Drag-and-drop
   *  walks this to reject a drop that would make someone their own
   *  ancestor. */
  parentOf: Map<string, string | null>;
} {
  const byKey = new Map<string, Employee>();
  for (const e of employees) byKey.set(keyOf(e), e);

  // Resolve each employee's effective parent, dropping references we
  // can't follow.
  const parentOf = new Map<string, string | null>();
  let orphanCount = 0;
  for (const e of employees) {
    const k = keyOf(e);
    const mid = e.managerId ?? null;
    if (!mid) { parentOf.set(k, null); continue; }
    if (mid === k) { parentOf.set(k, null); continue; }       // self-manager
    if (!byKey.has(mid)) { parentOf.set(k, null); orphanCount++; continue; }
    parentOf.set(k, mid);
  }

  // Break cycles: walk up from each node; revisiting means a loop, so
  // cut this node's edge and let it stand as a root.
  let cycleCount = 0;
  for (const e of employees) {
    const start = keyOf(e);
    const seen = new Set<string>([start]);
    let cur = parentOf.get(start) ?? null;
    while (cur) {
      if (seen.has(cur)) { parentOf.set(start, null); cycleCount++; break; }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  const nodes = new Map<string, OrgNode>();
  for (const e of employees) {
    nodes.set(keyOf(e), { emp: e, children: [], level: 0, totalBelow: 0 });
  }

  const roots: OrgNode[] = [];
  for (const e of employees) {
    const node = nodes.get(keyOf(e))!;
    const pid = parentOf.get(keyOf(e)) ?? null;
    if (pid && nodes.has(pid)) nodes.get(pid)!.children.push(node);
    else roots.push(node);
  }

  // Depth + subtree sizes, iteratively. A hand-edited hierarchy can be
  // arbitrarily deep and blowing the stack on a roster page would be a
  // poor trade for a few saved lines.
  const assign = (root: OrgNode) => {
    root.level = 0;
    const stack: OrgNode[] = [root];
    const order: OrgNode[] = [];
    while (stack.length) {
      const n = stack.pop()!;
      order.push(n);
      n.children.sort((a, b) => a.emp.name.localeCompare(b.emp.name));
      for (const c of n.children) { c.level = n.level + 1; stack.push(c); }
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i];
      n.totalBelow = n.children.reduce((s, c) => s + 1 + c.totalBelow, 0);
    }
  };
  roots.forEach(assign);
  // Biggest org first — the real top of the company leads, not whoever
  // happens to sort first alphabetically.
  roots.sort((a, b) => b.totalBelow - a.totalBelow || a.emp.name.localeCompare(b.emp.name));

  return { roots, orphanCount, cycleCount, parentOf };
}

/** True when `ancestorKey` sits somewhere above `key` in the tree.
 *  Dropping a node onto one of its own descendants would close a loop,
 *  so the drop target refuses it rather than letting buildOrgForest cut
 *  the edge back open on the next render. */
function isDescendantOf(key: string, ancestorKey: string, parentOf: Map<string, string | null>): boolean {
  let cur = parentOf.get(key) ?? null;
  const guard = new Set<string>([key]);
  while (cur) {
    if (cur === ancestorKey) return true;
    if (guard.has(cur)) return false; // already-repaired data; don't spin
    guard.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

type Shape = 'list' | 'profile';

const SHAPES = [
  { key: 'list' as const,    label: 'List',    Icon: List,       hint: 'Indented tree — scales to any headcount and prints' },
  { key: 'profile' as const, label: 'Profile', Icon: LayoutGrid, hint: 'Top-down card chart with photos' },
];

/** react-dnd item type for a dragged employee row. */
const DRAG_EMPLOYEE = 'org-employee';

interface DragItem { key: string; name: string; parentKey: string | null }

export function OrgChartTab({
  employees, deptName, onOpenEmployee, canEdit = false, onReassign, positions = [],
}: {
  employees: Employee[];
  deptName: (id?: string) => string;
  onOpenEmployee: (e: Employee) => void;
  /** Position catalogue, for ranking the filter dropdown (V350). An
   *  employee only carries the position NAME, so the level has to come
   *  from here. */
  positions?: { name: string; level?: number | null }[];
  /** Gates dragging. Read-only users get the chart without handles. */
  canEdit?: boolean;
  /** Persist a new manager. `prevManagerId` is passed back so the
   *  caller can offer Undo without re-deriving it. */
  onReassign?: (emp: Employee, newManagerId: string | null, prevManagerId: string | null) => void;
}) {
  const [shape, setShape] = useState<Shape>('list');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeOnly, setActiveOnly] = useState(true);

  const dragEnabled = canEdit && !!onReassign;

  // Inactive staff distort the picture: a departed manager leaves their
  // whole team looking unmanaged, so default to active only.
  const pool = useMemo(
    () => (activeOnly ? employees.filter(e => e.status === 'active') : employees),
    [employees, activeOnly],
  );
  const { roots, orphanCount, cycleCount, parentOf } = useMemo(() => buildOrgForest(pool), [pool]);

  /**
   * Distinct positions present in the current pool, so the dropdown
   * never offers a filter that would return nothing.
   *
   * Ordered by rank (V350) rather than alphabetically — on a chart
   * whose whole subject is hierarchy, a seniority-ordered list is the
   * one a reader expects. Unranked titles keep their alphabetical run
   * at the bottom. Duplicate names across departments can hold
   * different ranks, so the most senior wins, matching what mobile's
   * suggestion list does.
   */
  const positionOptions = useMemo(() => {
    const levelByName = new Map<string, number | null>();
    for (const p of positions) {
      const key = p.name.trim().toLowerCase();
      const lvl = p.level ?? null;
      const seen = levelByName.get(key);
      if (seen === undefined || seen === null) { levelByName.set(key, lvl); continue; }
      if (lvl !== null && lvl < seen) levelByName.set(key, lvl);
    }
    const names = new Set<string>();
    for (const e of pool) {
      const p = e.position?.trim();
      if (p) names.add(p);
    }
    const rank = (n: string) => levelByName.get(n.toLowerCase()) ?? Number.POSITIVE_INFINITY;
    return Array.from(names).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [pool, positions]);

  const totals = useMemo(() => {
    let deepest = 0;
    let managers = 0;
    const walk = (n: OrgNode) => {
      deepest = Math.max(deepest, n.level);
      if (n.children.length > 0) managers++;
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return { deepest, managers };
  }, [roots]);

  /**
   * Keys on a path to a search hit. A match deep in the tree is
   * useless if its ancestors are collapsed or filtered away, so every
   * node from the root down to the hit is kept and force-expanded.
   * Null means no filter — render everything.
   */
  const matchPaths = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !position) return null;
    const keep = new Set<string>();
    const visit = (n: OrgNode, ancestors: string[]): boolean => {
      const hay = `${n.emp.name} ${n.emp.khmerName ?? ''} ${n.emp.id} ${n.emp.position ?? ''}`.toLowerCase();
      // Both filters must hold for a node to be a hit in its own right.
      // Ancestors are still kept below, so filtering by Position shows
      // the matches in their reporting context rather than as a flat
      // list with their managers cut away.
      const selfHit = (!q || hay.includes(q))
        && (!position || (n.emp.position ?? '').trim() === position);
      let childHit = false;
      const mine = [...ancestors, keyOf(n.emp)];
      for (const c of n.children) if (visit(c, mine)) childHit = true;
      if (selfHit || childHit) {
        keep.add(keyOf(n.emp));
        ancestors.forEach(a => keep.add(a));
        return true;
      }
      return false;
    };
    roots.forEach(r => visit(r, []));
    return keep;
  }, [query, position, roots]);

  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allParentKeys = useMemo(() => {
    const out: string[] = [];
    const walk = (n: OrgNode) => {
      if (n.children.length) out.push(keyOf(n.emp));
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
  }, [roots]);

  const renderNode = (n: OrgNode): React.ReactNode => {
    const key = keyOf(n.emp);
    if (matchPaths && !matchPaths.has(key)) return null;
    // A live filter forces matched paths open; otherwise honour the
    // operator's own collapse state.
    const isCollapsed = !matchPaths && collapsed.has(key);

    return (
      <OrgRow
        key={key}
        node={n}
        nodeKey={key}
        isCollapsed={isCollapsed}
        onToggle={() => toggle(key)}
        deptName={deptName}
        onOpenEmployee={onOpenEmployee}
        dragEnabled={dragEnabled}
        parentOf={parentOf}
        onReassign={onReassign}
        renderChildren={() => n.children.map(renderNode)}
      />
    );
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, ID, position…"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(allParentKeys))}>
              Collapse all
            </Button>
            <Button
              variant={activeOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveOnly(v => !v)}
              title="Inactive staff leave their teams looking unmanaged"
            >
              Active only
            </Button>

            {/* Same tree, two shapes. List scales and prints; Profile is
                the recognisable photo chart. Search / position / active
                filters drive both. */}
            <div className="ml-auto inline-flex rounded-md border p-0.5">
              {SHAPES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setShape(s.key)}
                  className={
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors '
                    + (shape === s.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100')
                  }
                  title={s.hint}
                >
                  <s.Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              title="Show only people holding this position, with their managers above them"
            >
              <option value="">All positions</option>
              {positionOptions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-gray-600">
              <span><b className="text-gray-900">{roots.length}</b> Top (Level&nbsp;0)</span>
              <span><b className="text-gray-900">{pool.length}</b> in chart</span>
              <span><b className="text-gray-900">{totals.managers}</b> with reports</span>
              <span><b className="text-gray-900">{totals.deepest}</b> levels deep</span>
              {orphanCount > 0 && (
                <span className="text-orange-600">
                  {orphanCount} whose manager isn&rsquo;t in this view — shown at top level
                </span>
              )}
              {cycleCount > 0 && (
                <span className="text-red-600">
                  {cycleCount} circular reporting {cycleCount === 1 ? 'line' : 'lines'} — edge cut
                </span>
              )}
            </div>
          </div>

          {dragEnabled && <TopManagementDropZone onReassign={onReassign!} />}

          {roots.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No employees to chart.</p>
          ) : matchPaths && matchPaths.size === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              {query.trim() && position
                ? <>Nobody matches &ldquo;{query}&rdquo; in {position}.</>
                : position
                  ? <>Nobody holds the position {position}.</>
                  : <>Nobody matches &ldquo;{query}&rdquo;.</>}
            </p>
          ) : shape === 'profile' ? (
            <OrgChartProfile
              roots={roots}
              matchPaths={matchPaths}
              deptName={deptName}
              onOpenEmployee={onOpenEmployee}
            />
          ) : (
            <ul className="max-h-[68vh] overflow-auto pr-1">
              {roots.map(renderNode)}
            </ul>
          )}
        </CardContent>
      </Card>
    </DndProvider>
  );
}

/**
 * Drop here to clear somebody's manager and promote them to Level 0.
 *
 * Rendered as a always-visible strip rather than appearing mid-drag:
 * a drop target that materialises only while dragging is invisible
 * until you already needed it, so nobody discovers the capability.
 */
function TopManagementDropZone({ onReassign }: {
  onReassign: (emp: Employee, newManagerId: string | null, prevManagerId: string | null) => void;
}) {
  const [{ isOver, canDrop, draggedName }, dropRef] = useDrop(() => ({
    accept: DRAG_EMPLOYEE,
    // Somebody already at the top has nothing to be promoted from.
    canDrop: (item: DragItem) => item.parentKey !== null,
    drop: (item: DragItem, monitor) => {
      const emp = monitor.getItem<DragItem & { emp?: Employee }>().emp;
      if (emp) onReassign(emp, null, item.parentKey);
      return { handled: true };
    },
    collect: m => ({
      isOver: m.isOver(),
      canDrop: m.canDrop(),
      draggedName: (m.getItem() as DragItem | null)?.name ?? null,
    }),
  }), [onReassign]);

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={
        'rounded-md border border-dashed px-3 py-2 text-xs transition-colors '
        + (isOver && canDrop
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-gray-300 text-gray-500')
      }
    >
      <CornerLeftUp className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
      {isOver && canDrop && draggedName
        ? <>Release to make <b>{draggedName}</b> top management (Level&nbsp;0)</>
        : <>Drag anyone here to clear their manager and promote them to Level&nbsp;0</>}
    </div>
  );
}

/**
 * One row in the chart.
 *
 * A real component, not a render-time helper, because it owns
 * react-dnd hooks — calling useDrag/useDrop inside the old inline
 * `renderNode` closure would have meant a different number of hooks
 * per render, which React forbids.
 */
function OrgRow({
  node: n, nodeKey: key, isCollapsed, onToggle, deptName, onOpenEmployee,
  dragEnabled, parentOf, onReassign, renderChildren,
}: {
  node: OrgNode;
  nodeKey: string;
  isCollapsed: boolean;
  onToggle: () => void;
  deptName: (id?: string) => string;
  onOpenEmployee: (e: Employee) => void;
  dragEnabled: boolean;
  parentOf: Map<string, string | null>;
  onReassign?: (emp: Employee, newManagerId: string | null, prevManagerId: string | null) => void;
  renderChildren: () => React.ReactNode;
}) {
  const hasKids = n.children.length > 0;

  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: DRAG_EMPLOYEE,
    // `emp` rides along so a drop target can act without looking the
    // employee back up out of the tree.
    item: { key, name: n.emp.name, parentKey: parentOf.get(key) ?? null, emp: n.emp },
    canDrag: dragEnabled,
    collect: m => ({ isDragging: m.isDragging() }),
  }), [key, n.emp, dragEnabled, parentOf]);

  const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
    accept: DRAG_EMPLOYEE,
    canDrop: (item: DragItem) => {
      if (!dragEnabled) return false;
      if (item.key === key) return false;              // onto self
      if (item.parentKey === key) return false;        // already reports here
      // Onto one of their own reports — that would close a loop.
      return !isDescendantOf(key, item.key, parentOf);
    },
    drop: (item: DragItem & { emp?: Employee }) => {
      if (item.emp) onReassign?.(item.emp, key, item.parentKey);
      return { handled: true };
    },
    collect: m => ({ isOver: m.isOver({ shallow: true }), canDrop: m.canDrop() }),
  }), [key, dragEnabled, parentOf, onReassign]);

  // The row is both the thing you pick up and the thing you drop onto,
  // so both refs attach to the same element.
  const attach = (el: HTMLDivElement | null) => { dragRef(el); dropRef(el); };

  return (
    <li>
      <div
        ref={attach}
        className={
          'group flex items-center gap-2 rounded-md py-1.5 pr-2 transition-colors '
          + (isDragging ? 'opacity-40 ' : '')
          + (isOver && canDrop ? 'ring-2 ring-blue-500 bg-blue-50 ' : '')
          + (isOver && !canDrop ? 'ring-2 ring-red-300 bg-red-50 cursor-not-allowed ' : '')
          + (!isOver ? 'hover:bg-gray-50 ' : '')
          + (n.level === 0 && !isOver ? 'bg-blue-50/50 ' : '')
          + (dragEnabled ? 'cursor-grab active:cursor-grabbing' : '')
        }
        title={dragEnabled
          ? `Drag ${n.emp.name} onto someone to make that person their manager`
          : undefined}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={onToggle}
            className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200"
            aria-label={isCollapsed ? `Expand ${n.emp.name}` : `Collapse ${n.emp.name}`}
            aria-expanded={!isCollapsed}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden />
        )}

        {/* Photo when the employee has uploaded one, initial otherwise.
            The level-0 blue / descendant grey tone stays on the initial,
            so the hierarchy still reads on rows with no photo. */}
        <EmployeeAvatar
          employee={n.emp}
          className="h-7 w-7 shrink-0 rounded-full"
          imageClassName="rounded-full"
          fallbackClassName={
            'text-[11px] font-medium '
            + (n.level === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700')
          }
        />

        <button
          type="button"
          onClick={() => onOpenEmployee(n.emp)}
          className="min-w-0 flex-1 text-left"
          title="Open employee details"
        >
          <span className="block text-sm font-medium truncate group-hover:underline">
            {n.emp.name}
          </span>
          <span className="block text-xs text-gray-500 truncate">
            {[n.emp.position, deptName(n.emp.department)].filter(x => x && x !== '-').join(' · ') || '—'}
          </span>
        </button>

        <span className="shrink-0 text-[11px] text-gray-500 tabular-nums">
          {n.level === 0 ? 'Level 0 · Top' : `L${n.level}`}
        </span>
        {hasKids && (
          <Badge
            variant="secondary"
            className="shrink-0 text-[11px] font-normal"
            title={`${n.children.length} direct, ${n.totalBelow} total below`}
          >
            {n.children.length}
            {n.totalBelow !== n.children.length && (
              <span className="text-gray-400">&nbsp;/&nbsp;{n.totalBelow}</span>
            )}
          </Badge>
        )}
      </div>

      {hasKids && !isCollapsed && (
        <ul className="ml-[14px] border-l border-gray-200 pl-3">
          {renderChildren()}
        </ul>
      )}
    </li>
  );
}
