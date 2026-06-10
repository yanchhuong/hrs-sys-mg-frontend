import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Layers, Plus, Pencil, Trash2, CheckCircle2, CircleDashed, Lock, GripVertical,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import * as platformApi from '../../../api/platform';

/**
 * Super Admin → Module Categories. Plans the platform-wide menu
 * structure: categories (apps), modules under them, sub-menus
 * under modules. Each module carries a status — green 'complete'
 * = real controller behind it, orange 'draft' = planning
 * placeholder. Drafts surface here for planning but are hidden
 * from tenant sidebars + the Tenant Modules toggles.
 */
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

type CategoryEditState = {
  key: string;
  label: string;
  sortOrder: string;
  isEdit: boolean;
};
const EMPTY_CAT: CategoryEditState = { key: '', label: '', sortOrder: '', isEdit: false };

type ModuleEditState = {
  /** Module key — immutable when editing. */
  key: string;
  label: string;
  status: 'complete' | 'draft';
  categoryKey: string;
  parentModuleKey: string;
  sortOrder: string;
  isEdit: boolean;
  /** Source from the row (set when editing) — code modules have label
   *  editable but status + delete locked. */
  source: 'code' | 'manual';
};
const EMPTY_MOD: ModuleEditState = {
  key: '', label: '', status: 'draft', categoryKey: '',
  parentModuleKey: '', sortOrder: '', isEdit: false, source: 'manual',
};

/** Flatten the tree once so dropdowns (parent selector, etc.) can
 *  list every node regardless of depth. */
function flatten(nodes: platformApi.ModuleNode[], depth = 0): Array<platformApi.ModuleNode & { depth: number }> {
  const out: Array<platformApi.ModuleNode & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

export function ModuleCategories() {
  const [catalog, setCatalog] = useState<platformApi.ModuleCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Category create / edit dialog state
  const [catEditOpen, setCatEditOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<CategoryEditState>(EMPTY_CAT);
  const [catSaving, setCatSaving] = useState(false);
  const [deleteCatTarget, setDeleteCatTarget] = useState<platformApi.ModuleCategory | null>(null);

  // Module create / edit dialog state
  const [modEditOpen, setModEditOpen] = useState(false);
  const [modEdit, setModEdit] = useState<ModuleEditState>(EMPTY_MOD);
  const [modSaving, setModSaving] = useState(false);
  const [deleteModTarget, setDeleteModTarget] = useState<platformApi.ModuleNode | null>(null);

  // Drag-and-drop reorder state. We only allow same-sibling-group
  // reorders (same category + same parentKey) — re-parenting stays in
  // the Edit dialog where the cycle check + category move are explicit.
  // groupKey shape: `${categoryKey}::${parentKey ?? ''}` so a single
  // string identifies the drop target group.
  const [dragModule, setDragModule] = useState<{ key: string; groupKey: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // Same idea for the category cards themselves.
  const [dragCategory, setDragCategory] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  // Expanded category keys — persisted so the admin's expand/collapse
  // choice survives reloads. We track expanded (not collapsed) so the
  // default for any unseen / newly-created category is folded.
  // Stored as a JSON array (the natural Set shape doesn't serialize);
  // we rehydrate into a Set in state.
  const EXPANDED_KEY = 'hrms.moduleCategories.expanded';
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch { return new Set(); }
  });
  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch { /* quota / private mode */ }
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      setCatalog(await platformApi.moduleCategories.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const allCats = catalog?.categories ?? [];
  const counts = useMemo(() => {
    let total = 0, complete = 0, draft = 0;
    for (const c of allCats) {
      for (const m of flatten(c.modules)) {
        total++;
        if (m.status === 'complete') complete++;
        else draft++;
      }
    }
    return { total, complete, draft };
  }, [allCats]);

  /* -------------------- category handlers -------------------- */

  const openCreateCat = () => {
    setCatEdit({ ...EMPTY_CAT, sortOrder: String(allCats.length + 1) });
    setCatEditOpen(true);
  };
  const openEditCat = (cat: platformApi.ModuleCategory, idx: number) => {
    setCatEdit({ key: cat.key, label: cat.label, sortOrder: String(idx + 1), isEdit: true });
    setCatEditOpen(true);
  };
  const submitCat = async () => {
    setCatSaving(true);
    try {
      const sort = catEdit.sortOrder.trim() === '' ? undefined : Number(catEdit.sortOrder);
      if (catEdit.isEdit) {
        await platformApi.moduleCategories.update(catEdit.key, {
          label: catEdit.label.trim(),
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Category updated');
      } else {
        const key = slugify(catEdit.key || catEdit.label);
        if (!key) { toast.error('Key is required'); setCatSaving(false); return; }
        await platformApi.moduleCategories.create({
          key, label: catEdit.label.trim() || key,
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Category created');
      }
      setCatEditOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  };
  const confirmDeleteCat = async () => {
    if (!deleteCatTarget) return;
    try {
      await platformApi.moduleCategories.delete(deleteCatTarget.key);
      toast.success(`Deleted '${deleteCatTarget.label}'`);
      setDeleteCatTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete category');
      setDeleteCatTarget(null);
    }
  };

  /* -------------------- module handlers -------------------- */

  const openCreateModule = (categoryKey: string, parentKey: string | null = null) => {
    setModEdit({
      ...EMPTY_MOD,
      categoryKey,
      parentModuleKey: parentKey ?? '',
      status: 'draft',  // new admin-added modules default to draft
      isEdit: false,
      source: 'manual',
    });
    setModEditOpen(true);
  };
  const openEditModule = (mod: platformApi.ModuleNode, parentKey: string | null, catKey: string) => {
    setModEdit({
      key: mod.key, label: mod.label, status: mod.status,
      categoryKey: catKey, parentModuleKey: parentKey ?? '',
      sortOrder: '', isEdit: true, source: mod.source,
    });
    setModEditOpen(true);
  };
  const submitModule = async () => {
    setModSaving(true);
    try {
      const sort = modEdit.sortOrder.trim() === '' ? undefined : Number(modEdit.sortOrder);
      if (modEdit.isEdit) {
        await platformApi.moduleCategories.updateModule(modEdit.key, {
          label: modEdit.label.trim() || undefined,
          status: modEdit.status,
          parentModuleKey: modEdit.parentModuleKey || '',
          categoryKey: modEdit.categoryKey || undefined,
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Module updated');
      } else {
        const key = slugify(modEdit.key || modEdit.label);
        if (!key) { toast.error('Key is required'); setModSaving(false); return; }
        if (!modEdit.categoryKey) { toast.error('Pick a category'); setModSaving(false); return; }
        await platformApi.moduleCategories.createModule({
          key, label: modEdit.label.trim() || key,
          categoryKey: modEdit.categoryKey,
          parentModuleKey: modEdit.parentModuleKey || null,
          status: modEdit.status,
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Module created');
      }
      setModEditOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save module');
    } finally {
      setModSaving(false);
    }
  };
  const confirmDeleteModule = async () => {
    if (!deleteModTarget) return;
    try {
      await platformApi.moduleCategories.deleteModule(deleteModTarget.key);
      toast.success(`Deleted '${deleteModTarget.label}'`);
      setDeleteModTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete module');
      setDeleteModTarget(null);
    }
  };

  /* -------------------- drag-and-drop reorder -------------------- */

  /** Collect the live sibling list for one group from the current catalog. */
  const siblingsOf = (categoryKey: string, parentKey: string | null): platformApi.ModuleNode[] => {
    const cat = allCats.find(c => c.key === categoryKey);
    if (!cat) return [];
    if (parentKey === null) return cat.modules;
    // depth > 0 — find the parent in the tree and return its children.
    const stack: platformApi.ModuleNode[] = [...cat.modules];
    while (stack.length) {
      const n = stack.shift()!;
      if (n.key === parentKey) return n.children ?? [];
      if (n.children?.length) stack.push(...n.children);
    }
    return [];
  };

  /** Apply the new order to a sibling group: optimistically rewrite the
   *  local catalog so the UI stays responsive, then POST the new
   *  sequence. On failure, refetch so the server is the source of
   *  truth and any drift is corrected. */
  const reorderModuleSiblings = async (
    categoryKey: string,
    parentKey: string | null,
    newOrder: platformApi.ModuleNode[],
  ) => {
    // Build the bulk update — 1-indexed so the order shown in the
    // tree matches what an admin types when they edit by hand.
    const items = newOrder.map((n, i) => ({ key: n.key, sortOrder: i + 1 }));

    // Optimistic local rewrite.
    setCatalog(prev => {
      if (!prev) return prev;
      const rewriteList = (list: platformApi.ModuleNode[]): platformApi.ModuleNode[] => {
        if (parentKey === null) return newOrder.map(o => list.find(n => n.key === o.key) ?? o);
        return list.map(n => {
          if (n.key === parentKey) {
            const kids = n.children ?? [];
            return { ...n, children: newOrder.map(o => kids.find(k => k.key === o.key) ?? o) };
          }
          if (n.children?.length) return { ...n, children: rewriteList(n.children) };
          return n;
        });
      };
      return {
        ...prev,
        categories: prev.categories.map(c =>
          c.key === categoryKey ? { ...c, modules: rewriteList(c.modules) } : c
        ),
      };
    });

    try {
      await platformApi.moduleCategories.reorderModules(items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save new order');
      await load();
    }
  };

  /** Same idea but at the category level. */
  const reorderCategorySiblings = async (newOrder: platformApi.ModuleCategory[]) => {
    const items = newOrder.map((c, i) => ({ key: c.key, sortOrder: i + 1 }));
    setCatalog(prev => prev ? { ...prev, categories: newOrder } : prev);
    try {
      await platformApi.moduleCategories.reorderCategories(items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save new order');
      await load();
    }
  };

  /* -------------------- render -------------------- */

  const StatusBadge = ({ status }: { status: 'complete' | 'draft' }) => (
    <Badge
      variant="outline"
      className={status === 'complete'
        ? 'border-emerald-300 text-emerald-700 bg-emerald-50 gap-1'
        : 'border-amber-300 text-amber-700 bg-amber-50 gap-1'}
    >
      {status === 'complete' ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
      {status}
    </Badge>
  );

  // Single module row + recursive children. Indented per depth so the
  // tree is readable without dedicated tree-line glyphs.
  const ModuleRow = ({
    node, depth, categoryKey, parentKey,
  }: {
    node: platformApi.ModuleNode;
    depth: number;
    categoryKey: string;
    parentKey: string | null;
  }) => {
    const groupKey = `${categoryKey}::${parentKey ?? ''}`;
    const isDragging = dragModule?.key === node.key;
    // Only highlight the drop slot when the active drag belongs to the
    // same sibling group — cross-group drops are rejected.
    const canAcceptDrop = !!dragModule && dragModule.groupKey === groupKey && dragModule.key !== node.key;
    const isDropTarget = canAcceptDrop && dragOverKey === node.key;
    return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          // Stop the dragstart from bubbling into the parent Card —
          // otherwise the Card also enters "category drag" mode and its
          // onDragEnd never fires (dragend only runs on the actual
          // drag source), leaving the whole card stuck at opacity-40.
          e.stopPropagation();
          setDragModule({ key: node.key, groupKey });
          e.dataTransfer.effectAllowed = 'move';
          // Firefox requires data to be set or the drag won't fire.
          e.dataTransfer.setData('text/plain', node.key);
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          setDragModule(null); setDragOverKey(null);
        }}
        onDragOver={(e) => {
          if (!canAcceptDrop) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverKey !== node.key) setDragOverKey(node.key);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dragOverKey === node.key) setDragOverKey(null);
        }}
        onDrop={(e) => {
          if (!canAcceptDrop || !dragModule) return;
          e.preventDefault();
          e.stopPropagation();
          const siblings = siblingsOf(categoryKey, parentKey);
          const fromIdx = siblings.findIndex(s => s.key === dragModule.key);
          const toIdx = siblings.findIndex(s => s.key === node.key);
          if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
            setDragModule(null); setDragOverKey(null); return;
          }
          const next = [...siblings];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          setDragModule(null); setDragOverKey(null);
          void reorderModuleSiblings(categoryKey, parentKey, next);
        }}
        className={`flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
          node.status === 'complete' ? 'border-slate-200 bg-white' : 'border-amber-100 bg-amber-50/30'
        } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-blue-300 ring-offset-1' : ''}`}
        style={{ marginLeft: depth * 18 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical
            className="h-3.5 w-3.5 shrink-0 text-slate-300 cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
          />
          <Layers className={`h-3.5 w-3.5 shrink-0 ${
            node.status === 'complete' ? 'text-emerald-500' : 'text-amber-500'
          }`} />
          <span className="text-sm capitalize truncate">{node.label}</span>
          <code className="text-[11px] text-slate-400">{node.key}</code>
          <StatusBadge status={node.status} />
          {node.source === 'code' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Lock className="h-2.5 w-2.5" /> code
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs"
            onClick={() => openCreateModule(categoryKey, node.key)}
            title="Add sub-menu"
          >
            <Plus className="h-3 w-3 mr-1" /> Sub
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs"
            onClick={() => openEditModule(node, parentKey, categoryKey)}
          >
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDeleteModTarget(node)}
            disabled={node.source === 'code'}
            title={node.source === 'code' ? 'Code modules cannot be deleted from the UI' : 'Delete'}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Del
          </Button>
        </div>
      </div>
      {node.children?.map(child => (
        <ModuleRow
          key={child.key}
          node={child}
          depth={depth + 1}
          categoryKey={categoryKey}
          parentKey={node.key}
        />
      ))}
    </>
    );
  };

  // For the parent-module dropdown — every node from every category,
  // shown indented so the admin sees the tree position.
  const allModulesFlat = useMemo(() => {
    const out: Array<{ key: string; label: string; depth: number; categoryKey: string }> = [];
    for (const c of allCats) {
      for (const n of flatten(c.modules)) {
        out.push({ key: n.key, label: n.label, depth: n.depth, categoryKey: c.key });
      }
    }
    return out;
  }, [allCats]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Module Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Plan apps and menus. Each module is either <strong className="text-emerald-700">complete</strong>
            {' '}(real controller, shows up for tenants) or
            {' '}<strong className="text-amber-700">draft</strong>
            {' '}(planning placeholder, hidden from tenants). Add sub-menus to nest as deep as needed.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allCats.length > 0 && (
            expanded.size === allCats.length
              ? <Button variant="outline" size="sm" onClick={() => {
                  setExpanded(new Set());
                  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([])); } catch { /* ignore */ }
                }}>
                  <ChevronRight className="h-3.5 w-3.5 mr-1" /> Collapse all
                </Button>
              : <Button variant="outline" size="sm" onClick={() => {
                  const all = new Set(allCats.map(c => c.key));
                  setExpanded(all);
                  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...all])); } catch { /* ignore */ }
                }}>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" /> Expand all
                </Button>
          )}
          <Button onClick={openCreateCat}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Category
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
          {allCats.length} categor{allCats.length === 1 ? 'y' : 'ies'}
        </Badge>
        <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
          {counts.total} module{counts.total === 1 ? '' : 's'}
        </Badge>
        <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 gap-1">
          <CheckCircle2 className="h-3 w-3" /> {counts.complete} complete
        </Badge>
        <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1">
          <CircleDashed className="h-3 w-3" /> {counts.draft} draft
        </Badge>
      </div>

      {loading && !catalog ? (
        <p className="text-sm text-gray-500">Loading catalog…</p>
      ) : (
        <div className="space-y-4">
          {allCats.map((cat, idx) => {
            const isCatDragging = dragCategory === cat.key;
            const isCatDropTarget = !!dragCategory && dragCategory !== cat.key && dragOverCategory === cat.key;
            return (
            <Card
              key={cat.key}
              draggable
              onDragStart={(e) => {
                setDragCategory(cat.key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `cat:${cat.key}`);
              }}
              onDragEnd={() => { setDragCategory(null); setDragOverCategory(null); }}
              onDragOver={(e) => {
                if (!dragCategory || dragCategory === cat.key) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverCategory !== cat.key) setDragOverCategory(cat.key);
              }}
              onDragLeave={() => {
                if (dragOverCategory === cat.key) setDragOverCategory(null);
              }}
              onDrop={(e) => {
                if (!dragCategory || dragCategory === cat.key) return;
                e.preventDefault();
                const fromIdx = allCats.findIndex(c => c.key === dragCategory);
                const toIdx = allCats.findIndex(c => c.key === cat.key);
                setDragCategory(null); setDragOverCategory(null);
                if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
                const next = [...allCats];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(toIdx, 0, moved);
                void reorderCategorySiblings(next);
              }}
              className={`transition-all ${isCatDragging ? 'opacity-40' : ''} ${isCatDropTarget ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GripVertical
                      className="h-4 w-4 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing"
                      aria-label="Drag category to reorder"
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(cat.key)}
                      className="shrink-0 p-0.5 rounded hover:bg-slate-100 text-slate-500"
                      aria-label={expanded.has(cat.key) ? 'Collapse category' : 'Expand category'}
                      title={expanded.has(cat.key) ? 'Collapse' : 'Expand'}
                    >
                      {expanded.has(cat.key)
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Layers className="h-4 w-4 text-slate-500 shrink-0" />
                    <div
                      className="min-w-0 cursor-pointer select-none"
                      onClick={() => toggleExpanded(cat.key)}
                      title={expanded.has(cat.key) ? 'Collapse' : 'Expand'}
                    >
                      <CardTitle className="text-sm font-semibold">{cat.label}</CardTitle>
                      <CardDescription className="text-xs">
                        <code className="text-slate-500">{cat.key}</code>
                        <span className="mx-1.5 text-slate-300">·</span>
                        sort {idx + 1}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {flatten(cat.modules).length} module{flatten(cat.modules).length === 1 ? '' : 's'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openCreateModule(cat.key)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Module
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEditCat(cat, idx)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      onClick={() => setDeleteCatTarget(cat)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expanded.has(cat.key) && (
                <CardContent>
                  {cat.modules.length === 0 ? (
                    <p className="text-xs text-gray-500">No modules yet — click <em>Add Module</em>.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {cat.modules.map(node => (
                        <ModuleRow
                          key={node.key}
                          node={node}
                          depth={0}
                          categoryKey={cat.key}
                          parentKey={null}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Category create/edit */}
      <Dialog open={catEditOpen} onOpenChange={setCatEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catEdit.isEdit ? `Edit '${catEdit.key}'` : 'New category'}</DialogTitle>
            <DialogDescription>
              Categories are the app-level groupings shown on Tenant Modules and the
              tenant sidebar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="catkey" className="text-xs">
                Key {catEdit.isEdit && <span className="text-gray-400">(immutable)</span>}
              </Label>
              <Input
                id="catkey"
                value={catEdit.key}
                onChange={e => setCatEdit(s => ({ ...s, key: slugify(e.target.value) }))}
                placeholder="accounting"
                disabled={catEdit.isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catlabel" className="text-xs">Label</Label>
              <Input id="catlabel" value={catEdit.label}
                onChange={e => setCatEdit(s => ({ ...s, label: e.target.value }))}
                placeholder="Accountant" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catsort" className="text-xs">Sort order</Label>
              <Input id="catsort" type="number" value={catEdit.sortOrder}
                onChange={e => setCatEdit(s => ({ ...s, sortOrder: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatEditOpen(false)} disabled={catSaving}>Cancel</Button>
            <Button onClick={submitCat} disabled={catSaving}>
              {catSaving ? 'Saving…' : catEdit.isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module create/edit */}
      <Dialog open={modEditOpen} onOpenChange={setModEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modEdit.isEdit ? `Edit '${modEdit.key}'` : 'New module'}
            </DialogTitle>
            <DialogDescription>
              {modEdit.isEdit
                ? (modEdit.source === 'code'
                    ? 'Code-defined module — label, category, sort, and parent are editable; status is locked to complete.'
                    : 'Manual/planning module — fully editable.')
                : 'New modules default to draft. Promote to complete once the real controller ships.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="modkey" className="text-xs">
                Key {modEdit.isEdit && <span className="text-gray-400">(immutable)</span>}
              </Label>
              <Input id="modkey"
                value={modEdit.key}
                onChange={e => setModEdit(s => ({ ...s, key: slugify(e.target.value) }))}
                placeholder="invoices"
                disabled={modEdit.isEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modlabel" className="text-xs">Label</Label>
              <Input id="modlabel" value={modEdit.label}
                onChange={e => setModEdit(s => ({ ...s, label: e.target.value }))}
                placeholder="Invoices" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={modEdit.status}
                  onValueChange={v => setModEdit(s => ({ ...s, status: v as 'complete' | 'draft' }))}
                  disabled={modEdit.source === 'code'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (orange)</SelectItem>
                    <SelectItem value="complete">Complete (green)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort order</Label>
                <Input type="number" value={modEdit.sortOrder}
                  onChange={e => setModEdit(s => ({ ...s, sortOrder: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={modEdit.categoryKey}
                onValueChange={v => setModEdit(s => ({ ...s, categoryKey: v, parentModuleKey: '' }))}
              >
                <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {allCats.map(c => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parent module (optional)</Label>
              <Select
                value={modEdit.parentModuleKey || '__none__'}
                onValueChange={v => setModEdit(s => ({ ...s, parentModuleKey: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Top-level under category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Top-level (no parent) —</SelectItem>
                  {allModulesFlat
                    .filter(m => m.key !== modEdit.key && m.categoryKey === modEdit.categoryKey)
                    .map(m => (
                      <SelectItem key={m.key} value={m.key}>
                        {'  '.repeat(m.depth)}{m.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">
                Pick another module to nest this one underneath. Only siblings in the
                same category are listed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModEditOpen(false)} disabled={modSaving}>Cancel</Button>
            <Button onClick={submitModule} disabled={modSaving}>
              {modSaving ? 'Saving…' : modEdit.isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete category confirm */}
      <AlertDialog open={!!deleteCatTarget} onOpenChange={(o) => !o && setDeleteCatTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete '{deleteCatTarget?.label}'?</AlertDialogTitle>
            <AlertDialogDescription>
              {flatten(deleteCatTarget?.modules ?? []).length === 0
                ? 'This category has no modules assigned, so it can be safely removed.'
                : `${flatten(deleteCatTarget?.modules ?? []).length} module(s) still in this category. The backend will reject the delete with the list of modules to reassign first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCat} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete module confirm */}
      <AlertDialog open={!!deleteModTarget} onOpenChange={(o) => !o && setDeleteModTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete module '{deleteModTarget?.label}'?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteModTarget?.source === 'code'
                ? 'Code-defined module — cannot be deleted from the UI.'
                : (deleteModTarget?.children?.length ?? 0) > 0
                  ? `${deleteModTarget?.children?.length} sub-menu(s) still attached. The backend will reject the delete; re-parent or delete the children first.`
                  : 'This module has no sub-menus, so it can be safely removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteModule}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteModTarget?.source === 'code'}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
