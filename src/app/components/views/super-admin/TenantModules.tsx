import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { Layers, Save, RotateCcw, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import * as platformApi from '../../../api/platform';

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
  const flattenModules = (nodes: platformApi.ModuleNode[]): string[] => {
    const out: string[] = [];
    const walk = (ns: platformApi.ModuleNode[]) => {
      for (const n of ns) { out.push(n.key); if (n.children?.length) walk(n.children); }
    };
    walk(nodes);
    return out;
  };

  /**
   * Parent (category) toggle: bulk-flip every child to the same state.
   * Click semantics:
   *   - All children currently ON  → turn all OFF
   *   - Any child currently OFF    → turn all ON
   * Matches the most common pattern users expect from a "select all"
   * checkbox in spreadsheet UIs.
   */
  const handleCategoryToggle = (cat: platformApi.ModuleCategory) => {
    const keys = flattenModules(cat.modules);
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

  const enabledCount = catalog.filter(k => draft[k]).length;
  const disabledCount = catalog.length - enabledCount;
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
                const moduleKeys = flattenModules(cat.modules);
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
                      {moduleKeys.map(key => (
                        <div
                          key={key}
                          className={`flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
                            draft[key]
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm capitalize truncate ${draft[key] ? 'text-slate-900' : 'text-slate-500'}`}>
                              {key.replace(/-/g, ' ')}
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
