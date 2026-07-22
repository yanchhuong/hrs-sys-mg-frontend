import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { Layers, Save, RotateCcw, Building2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import * as platformApi from '../../../api/platform';

/**
 * v-tenant-modules-menu-alignment — the "Modules & Apps" grid renders
 * from the code-module registry (module_assignments), but the sidebar
 * the tenant actually sees is nav-driven. Two nav items are derived
 * views over another module's controllers and have no independent
 * gate: Students (inherits Enrollment) and Patients (inherits
 * Encounter). One code module has no sidebar entry: Medical Service
 * (managed inline from Encounter's detail dialog).
 *
 * Rather than adding synthetic module_assignments rows for the derived
 * views (which would create toggles that flip nothing on the backend)
 * or hiding Medical Service via a status='draft' migration (which
 * lies about its state), we shape display purely on the FE:
 *
 *   HIDDEN_MODULE_KEYS — dropped from the grid entirely.
 *   INHERIT_TILES      — read-only tiles injected before a specific
 *                        gate module, mirroring the Permission Matrix
 *                        inherit-row pattern.
 *   LABEL_OVERRIDES    — display labels that don't match the raw key.
 */
const HIDDEN_MODULE_KEYS = new Set([
  // Data-model helpers with no user-facing app tile — permission
  // gates only. Toggling them here would mislead the operator into
  // thinking there's a sidebar leaf to enable.
  'medical-service',
  // Settings-only modules: no page in the sidebar, no Apps-launcher
  // tile. They gate a slice of admin actions inside another app:
  //   * hr_telegram   — Telegram bot config (admin sub-setting
  //                     under Employees/Settings)
  //   * qr_attendance — QR / Offices management (dialog off the
  //                     Attendance page, V116). The Attendance leaf
  //                     itself is `attendance`; this row is the
  //                     admin gate on the Manage Offices dialog.
  //   * office        — same offices concept, retired standalone
  //                     leaf (see nav.ts comment); kept as a
  //                     permission key so back-end @perm.allow calls
  //                     don't break.
  'hr_telegram',
  'qr_attendance',
  'office',
  // Display-only module rows — no nav leaf reads them as a gate, so
  // the toggle here has no effect. Kept in module_assignments (so
  // Module Categories still lists them) but hidden from the tenant
  // grid to stop operators asking why the toggle "does nothing":
  //   * payment       — historical row from V80 / V203 (module
  //                     'payment' with category 'accounting'). No
  //                     nav leaf uses module:'payment' — the real
  //                     payment surfaces are `payment_plan` and
  //                     `payment_collection`, each with their own
  //                     dedicated toggle.
  //   * time-tracking — sidebar grouping label (nav.ts uses it as a
  //                     `group` id, never as a leaf's `module`). Its
  //                     children (attendance / overtime / all-leave
  //                     / exception) each carry the real gate.
  'payment',
  'time-tracking',
]);

const LABEL_OVERRIDES: Record<string, string> = {
  enrollment:         'Enrollments',
  'class-attendance': 'Attendance',
};

interface InheritTile {
  key: string;         // synthetic display key (not a real module)
  label: string;
  inheritsFrom: string;// real module key whose enabled-state we mirror
}
const INHERIT_TILES: Record<string, InheritTile[]> = {
  // Injected at the START of each category's tile list.
  education:  [{ key: 'students', label: 'Students', inheritsFrom: 'enrollment' }],
  healthcare: [{ key: 'patients', label: 'Patients', inheritsFrom: 'encounter'  }],
};

/**
 * Super Admin → Tenant Modules. Pick a company, toggle which menu
 * modules they have access to. Saved values write to {@code tenant_modules}
 * (V73) and gate both the sidebar visibility (via /me/modules on the
 * tenant side) and the API surface (via TenantModuleGuard on the
 * backend). Absence of a row = enabled, so new tenants start with
 * every module on by default.
 */
export function TenantModules() {
  const [tenants, setTenants] = useState<platformApi.PlatformTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [catalog, setCatalog] = useState<string[]>([]);
  const [categories, setCategories] = useState<platformApi.ModuleCategory[]>([]);
  const [original, setOriginal] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingTenants(true);
      try {
        const list = await platformApi.tenants.list();
        // Hide the synthetic 'platform' tenant — it's the super-admin
        // workspace, not a customer site, and has no menus to gate.
        const customer = list.filter(t => t.slug !== 'platform');
        setTenants(customer);
        if (customer.length > 0 && !selectedTenantId) {
          setSelectedTenantId(customer[0].id);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load companies');
      } finally {
        setLoadingTenants(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;
    (async () => {
      setLoadingFlags(true);
      try {
        const res = await platformApi.tenantModules.get(selectedTenantId);
        setCatalog(res.catalog);
        // Fallback when backend predates categories: render every module
        // under a single ungrouped pseudo-category so the UI still works.
        setCategories(res.categories ?? [
          {
            key: 'all', label: 'Modules',
            modules: res.catalog.map(k => ({
              key: k, label: k, status: 'complete' as const, source: 'code' as const, children: [],
            })),
          },
        ]);
        setOriginal(res.modules);
        setDraft(res.modules);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load modules');
      } finally {
        setLoadingFlags(false);
      }
    })();
  }, [selectedTenantId]);

  const dirty = useMemo(
    () => catalog.some(k => Boolean(draft[k]) !== Boolean(original[k])),
    [catalog, draft, original],
  );

  const handleToggle = (key: string) =>
    setDraft(d => ({ ...d, [key]: !d[key] }));

  /**
   * Flatten a category's module tree to its leaf keys for the toggle
   * grid. Tree position (parent module / sub-menu) is a planning
   * concept managed in Module Categories; here we just enumerate
   * every togglable key so a tenant admin can flip each one.
   */
  const flattenModules = (nodes: platformApi.ModuleNode[]): Array<{ key: string; label: string }> => {
    const out: Array<{ key: string; label: string }> = [];
    const walk = (ns: platformApi.ModuleNode[]) => {
      for (const n of ns) {
        // Preserve the BE-supplied label (module_assignments.label) so
        // the display picks up SA edits + V253-style DB renames without
        // any client-side transform. Falls back to key-derived title
        // case at render time when the BE omits label (older deploys).
        out.push({ key: n.key, label: n.label });
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };

  /** Fallback for when the BE omits label. Handles BOTH kebab (`-`)
   *  AND snake (`_`) separators so keys like `payment_plan` don't
   *  render as `Payment_plan` (the previous regex only replaced `-`,
   *  leaving the underscore intact — flagged by an operator). */
  const prettifyKey = (key: string): string =>
    key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  /**
   * Parent (category) toggle: bulk-flip every child to the same state.
   * Click semantics:
   *   - All children currently ON  → turn all OFF
   *   - Any child currently OFF    → turn all ON
   * Matches the most common pattern users expect from a "select all"
   * checkbox in spreadsheet UIs.
   */
  const handleCategoryToggle = (cat: platformApi.ModuleCategory) => {
    // Bulk-flip skips hidden modules so the operator can't toggle
    // something they can't see — matches the tile grid's own filter.
    const keys = flattenModules(cat.modules)
      .filter(n => !HIDDEN_MODULE_KEYS.has(n.key))
      .map(n => n.key);
    const allOn = keys.every(k => Boolean(draft[k]));
    const next = !allOn;
    setDraft(d => {
      const out = { ...d };
      for (const k of keys) out[k] = next;
      return out;
    });
  };

  const handleReset = () => setDraft(original);

  const handleSave = async () => {
    if (!selectedTenantId || !dirty) return;
    setSaving(true);
    try {
      // Send only the changed keys — the backend's setAll() leaves
      // absent keys untouched, so this minimises both write volume
      // and the chance of clobbering a concurrent edit on a flag we
      // didn't actually toggle in this session.
      const changed: Record<string, boolean> = {};
      for (const k of catalog) {
        if (Boolean(draft[k]) !== Boolean(original[k])) changed[k] = Boolean(draft[k]);
      }
      const res = await platformApi.tenantModules.set(selectedTenantId, changed);
      setOriginal(res.modules);
      setDraft(res.modules);
      toast.success('Module access updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save modules');
    } finally {
      setSaving(false);
    }
  };

  // Global enabled/disabled counters exclude HIDDEN_MODULE_KEYS so the
  // top-of-page badge matches what the operator actually sees below.
  // Without this, adding a new hidden entry silently drifted the total.
  const visibleCatalog = catalog.filter(k => !HIDDEN_MODULE_KEYS.has(k));
  const enabledCount = visibleCatalog.filter(k => draft[k]).length;
  const disabledCount = visibleCatalog.length - enabledCount;
  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tenant Modules</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-4 justify-between">
            <div className="flex-1 min-w-[260px]">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Company
              </label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId} disabled={loadingTenants}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingTenants ? 'Loading…' : 'Pick a company'} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} <span className="text-gray-400 ml-1">({t.slug})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                {enabledCount} enabled
              </Badge>
              <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
                {disabledCount} disabled
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFlags ? (
            <p className="text-sm text-gray-500">Loading module flags…</p>
          ) : selectedTenant == null ? (
            <p className="text-sm text-gray-500">No company selected.</p>
          ) : (
            <div className="space-y-4">
              {categories.map(cat => {
                // Real, togglable keys — hidden ones (e.g. medical-service)
                // pruned before counting so the "N / M enabled" badge tracks
                // what's actually visible.
                // Node objects here so the render loop below has the
                // BE-supplied label ready to render.
                const modules = flattenModules(cat.modules).filter(n => !HIDDEN_MODULE_KEYS.has(n.key));
                const moduleKeys = modules.map(n => n.key);
                const inheritTiles = INHERIT_TILES[cat.key] ?? [];
                const total = moduleKeys.length;
                const on = moduleKeys.filter(k => draft[k]).length;
                const allOn = on === total && total > 0;
                const noneOn = on === 0;
                return (
                  <div
                    key={cat.key}
                    className={`rounded-lg border ${
                      allOn ? 'border-emerald-200' : noneOn ? 'border-slate-200' : 'border-amber-200'
                    }`}
                  >
                    {/* Parent header — bulk-flip toggle + counter. The
                        category-level switch is the "App" gate the admin
                        flips when they want every sub-module on or off
                        in one click. */}
                    <div
                      className={`flex items-center justify-between px-4 py-3 rounded-t-lg ${
                        allOn ? 'bg-emerald-50/60' : noneOn ? 'bg-slate-50' : 'bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className={`h-4 w-4 shrink-0 ${
                          allOn ? 'text-emerald-600' : noneOn ? 'text-slate-400' : 'text-amber-600'
                        }`} />
                        <p className="text-sm font-semibold">{cat.label}</p>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${
                            allOn
                              ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                              : noneOn
                              ? 'border-slate-300 text-slate-700 bg-slate-100'
                              : 'border-amber-300 text-amber-700 bg-amber-50'
                          }`}
                        >
                          {on} / {total} enabled
                        </Badge>
                      </div>
                      <Switch
                        checked={allOn}
                        onCheckedChange={() => handleCategoryToggle(cat)}
                        aria-label={`Toggle entire ${cat.label} category for ${selectedTenant.name}`}
                      />
                    </div>

                    {/* Children — individual module toggles. Same per-row
                        styling as before; bulk-flip from the parent
                        propagates through the same draft object so this
                        view stays in sync without extra wiring. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                      {/* Inherit tiles first — Students (before Enrollment),
                          Patients (before Encounter). Read-only; state
                          mirrors the parent module so the operator sees
                          them light up when they enable the parent. */}
                      {inheritTiles.map(tile => {
                        const parentOn = Boolean(draft[tile.inheritsFrom]);
                        const parentLabel = LABEL_OVERRIDES[tile.inheritsFrom]
                          ?? tile.inheritsFrom.replace(/-/g, ' ');
                        return (
                          <div
                            key={tile.key}
                            title={`Inherits from ${parentLabel} — no independent toggle`}
                            className={`flex items-center justify-between px-3 py-2 rounded-md border border-dashed transition-colors ${
                              parentOn
                                ? 'border-emerald-200 bg-emerald-50/20'
                                : 'border-slate-200 bg-slate-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link2 className={`h-3 w-3 shrink-0 ${parentOn ? 'text-emerald-500' : 'text-slate-400'}`} />
                              <span className={`text-sm truncate ${parentOn ? 'text-slate-900' : 'text-slate-500'}`}>
                                {tile.label}
                              </span>
                            </div>
                            <Switch checked={parentOn} disabled aria-label={`${tile.label} inherits from ${parentLabel}`} />
                          </div>
                        );
                      })}
                      {modules.map(({ key, label }) => (
                        <div
                          key={key}
                          className={`flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
                            draft[key]
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm truncate ${draft[key] ? 'text-slate-900' : 'text-slate-500'}`}>
                              {/* BE label wins (module_assignments.label,
                                  edited via V253 and the SA Module
                                  Categories page). Only fall back to a
                                  key-derived title case when the BE row
                                  is blank. LABEL_OVERRIDES is the last
                                  resort so the hardcoded map still fires
                                  for keys we deliberately alias. */}
                              {LABEL_OVERRIDES[key] ?? (label && label.trim() ? label : prettifyKey(key))}
                            </span>
                          </div>
                          <Switch
                            checked={Boolean(draft[key])}
                            onCheckedChange={() => handleToggle(key)}
                            aria-label={`Toggle ${key} for ${selectedTenant.name}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Save changes</CardTitle>
          <CardDescription className="text-xs">
            Changes take effect on the tenant's next page load. Already-open
            tabs will get 403 from the gated endpoints until they refresh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reset
            </Button>
            {dirty && (
              <span className="text-xs text-amber-600 ml-2">Unsaved changes</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
