/**
 * Super Admin → Mobile App Keys (V342).
 *
 * Two tabs:
 *   • App Keys      — mint / revoke / copy the keys embedded in mobile
 *                     builds. Public (all tenants) or pinned to one.
 *   • Email Domains — the domain → tenant map the PUBLIC build uses to
 *                     resolve which company a user belongs to at login.
 *
 * SECURITY NOTE: an app key is a client identifier, not a credential.
 * It grants no API access on its own — login still requires real
 * credentials — which is why the full value is displayed for copying.
 * Do not restyle this as a "secret" or add a reveal/mask affordance;
 * that would imply a security property it deliberately doesn't have.
 * (A tenant's `apiKey` IS a bearer token and must never be used here.)
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Alert, AlertDescription } from '../../ui/alert';
import { Copy, Plus, Ban, Trash2, Globe, Building2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../../context/ConfirmContext';
import * as appKeysApi from '../../../api/platformMobileAppKeys';
import type { MobileAppKey, TenantEmailDomain } from '../../../api/platformMobileAppKeys';
import * as platformApi from '../../../api/platform';
import { useDateFormat } from '../../../context/DateFormatContext';
import { TONE_CLASS } from '../../../utils/statusTones';
import { TableBodySkeletonRows } from '../../common/LoadingSkeletons';
import { ListEmpty, ListError } from '../../common/ListStates';
import type { PlatformTenant } from '../../../api/platform';

/** Sentinel for the "public build" option in the tenant Select.
 *  Radix Select can't hold an empty-string value, so the null tenant
 *  needs an explicit token. */
const PUBLIC_OPTION = '__public__';

export function MobileAppKeys() {
  const confirm = useConfirm();
  const { formatDate: fmtDate } = useDateFormat();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keys, setKeys] = useState<MobileAppKey[]>([]);
  const [domains, setDomains] = useState<TenantEmailDomain[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-key form
  const [newScope, setNewScope] = useState<string>(PUBLIC_OPTION);
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Add-domain form
  const [domTenant, setDomTenant] = useState<string>('');
  const [domValue, setDomValue] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<MobileAppKey | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [k, d, t] = await Promise.all([
        appKeysApi.listAppKeys(),
        appKeysApi.listDomains(),
        platformApi.tenants.list(),
      ]);
      setKeys(k);
      setDomains(d);
      setTenants(t);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load app keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const tenantOptions = useMemo(
    () => [...tenants].sort((a, b) => a.name.localeCompare(b.name)),
    [tenants],
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Key copied');
    } catch {
      // Clipboard API needs a secure context; surface the value so the
      // operator can still select it manually rather than silently failing.
      toast.error('Could not copy — select the value and copy manually.');
    }
  };

  const submitKey = async () => {
    if (!newLabel.trim()) {
      toast.error('Give the key a label so it can be told apart later.');
      return;
    }
    setCreating(true);
    try {
      const created = await appKeysApi.createAppKey({
        tenantId: newScope === PUBLIC_OPTION ? null : newScope,
        label: newLabel.trim(),
        notes: newNotes.trim() || null,
      });
      setKeys(prev => [created, ...prev]);
      setNewLabel('');
      setNewNotes('');
      toast.success(`Key minted — ${created.appKey}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mint key');
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    try {
      const updated = await appKeysApi.revokeAppKey(target.id);
      setKeys(prev => prev.map(k => (k.id === updated.id ? updated : k)));
      toast.success('Key revoked — builds using it can no longer start.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke key');
    }
  };

  const submitDomain = async () => {
    if (!domTenant) { toast.error('Pick the tenant this domain belongs to.'); return; }
    if (!domValue.trim()) { toast.error('Enter a domain like acme.com'); return; }
    setAddingDomain(true);
    try {
      const created = await appKeysApi.addDomain(domTenant, domValue.trim());
      setDomains(prev => [...prev, created].sort((a, b) => a.domain.localeCompare(b.domain)));
      setDomValue('');
      toast.success(`${created.domain} → ${created.tenantName}`);
    } catch (e) {
      // The server rejects shared providers and already-claimed
      // domains with an explanatory message — surface it verbatim.
      toast.error(e instanceof Error ? e.message : 'Could not add domain');
    } finally {
      setAddingDomain(false);
    }
  };

  const dropDomain = async (d: TenantEmailDomain) => {
    if (!(await confirm({
      title: `Remove ${d.domain}?`,
      message: `Users signing in with an @${d.domain} email will no longer be routed to this company automatically.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    }))) return;
    try {
      await appKeysApi.removeDomain(d.id);
      setDomains(prev => prev.filter(x => x.id !== d.id));
      toast.success(`${d.domain} unmapped`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove domain');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Controls which tenant a mobile build talks to. Embed a key as{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">EXPO_PUBLIC_APP_KEY</code>{' '}
          in its EAS build profile.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          An app key is an <strong>identifier, not a password</strong>. It grants no access on its
          own — users still sign in normally — so it's safe to embed in a published app bundle and
          safe to display here. Never use a tenant's API key for this: that one authenticates
          without a password.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">App Keys</TabsTrigger>
          <TabsTrigger value="domains">Email Domains</TabsTrigger>
        </TabsList>

        {/* ─── App keys ─────────────────────────────────────────── */}
        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mint a key</CardTitle>
              <CardDescription>
                Public keys let every tenant's users sign in (tenant resolved from their email
                domain). A tenant key pins the build to one company and hides tenant selection.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={newScope} onValueChange={setNewScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PUBLIC_OPTION}>Public — all tenants</SelectItem>
                    {tenantOptions.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label <span className="text-red-500">*</span></Label>
                <Input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Public — Play Store"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Which build / store listing this key ships in"
                  rows={2}
                />
              </div>
              <div className="md:col-span-4">
                <Button onClick={submitKey} disabled={creating}>
                  <Plus className="h-4 w-4 mr-1" />
                  {creating ? 'Minting…' : 'Mint key'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && keys.length === 0 && <TableBodySkeletonRows rows={4} columns={7} />}
                  {!loading && loadError && keys.length === 0 && (
                    <ListError message={loadError} onRetry={() => void load()} colSpan={7} />
                  )}
                  {!loading && !loadError && keys.length === 0 && (
                    <ListEmpty noun="app keys" colSpan={7}>
                      <p className="text-xs text-gray-400 mt-1">Mint one above.</p>
                    </ListEmpty>
                  )}
                  {keys.map(k => (
                    <TableRow key={k.id} className={k.status === 'revoked' ? 'opacity-50' : ''}>
                      <TableCell>
                        {k.scope === 'public' ? (
                          <Badge variant="outline" className="gap-1">
                            <Globe className="h-3 w-3" /> Public
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Building2 className="h-3 w-3" /> {k.tenantName ?? '(unknown)'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{k.label}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{k.appKey}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={k.status === 'active'
                          ? TONE_CLASS.success
                          : TONE_CLASS.danger}>
                          {k.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.lastSeenAt ? fmtDate(k.lastSeenAt) : <span title="No build has used this key yet">never</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(k.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void copy(k.appKey)} title="Copy key">
                          <Copy className="h-4 w-4" />
                        </Button>
                        {k.status === 'active' && (
                          <Button size="icon" variant="ghost" onClick={() => setRevokeTarget(k)}
                                  title="Revoke key" className="h-7 w-7 text-red-600">
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Email domains ────────────────────────────────────── */}
        <TabsContent value="domains" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map an email domain to a tenant</CardTitle>
              <CardDescription>
                Only used by the <strong>public</strong> build: it turns a login email into a
                tenant, so users don't have to type a company code. Each domain maps to exactly
                one tenant. Shared providers (gmail.com and similar) are rejected — those users
                need a private build instead.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Tenant <span className="text-red-500">*</span></Label>
                <Select value={domTenant} onValueChange={setDomTenant}>
                  <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                  <SelectContent>
                    {tenantOptions.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain <span className="text-red-500">*</span></Label>
                <Input
                  value={domValue}
                  onChange={e => setDomValue(e.target.value)}
                  placeholder="acme.com"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={submitDomain} disabled={addingDomain}>
                  <Plus className="h-4 w-4 mr-1" />
                  {addingDomain ? 'Adding…' : 'Add domain'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && domains.length === 0 && <TableBodySkeletonRows rows={3} columns={4} />}
                  {!loading && loadError && domains.length === 0 && (
                    <ListError message={loadError} onRetry={() => void load()} colSpan={4} />
                  )}
                  {!loading && !loadError && domains.length === 0 && (
                    <ListEmpty noun="email domains" colSpan={4}>
                      <p className="text-xs text-gray-400 mt-1">The public build can't resolve any tenant until one is added.</p>
                    </ListEmpty>
                  )}
                  {domains.map(d => (
                    <TableRow key={d.id}>
                      <TableCell><code className="text-xs">{d.domain}</code></TableCell>
                      <TableCell className="font-medium">{d.tenantName ?? '(unknown)'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600"
                                onClick={() => void dropDomain(d)} title="Remove mapping">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!revokeTarget} onOpenChange={o => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revokeTarget?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every installed build carrying this key will stop starting up — it can no longer
              resolve its tenant. This cannot be undone; recovering means minting a new key and
              shipping a new build. Only revoke a key you know is out of circulation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} className="bg-red-600 hover:bg-red-700 text-white">
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
