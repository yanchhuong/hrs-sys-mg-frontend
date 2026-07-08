import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Loader2, Upload, Trash2, Image as ImageIcon, Building2, Hash, Plus, Pencil, Check, X, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import * as accountingSettingsApi from '../../api/accountingSettings';
import * as attachmentsApi from '../../api/attachments';
import * as branchesApi from '../../api/branches';
import { API_BASE, getToken } from '../../api/client';

/**
 * Encounter settings dialog (v-encounter-branch-list).
 * Left-side navigation with two sections:
 *
 * <ul>
 *   <li><b>Branch</b> — tenant-global clinic logo (polymorphic
 *       attachment {@code docType='hospital_logo'}, {@code docId=<tenantId>})
 *       + a table of branch rows (name / phone / address). Table
 *       supports inline Add / Edit / Delete.</li>
 *   <li><b>Numbering</b> — encounter document number prefix + date
 *       format + zero-pad width.</li>
 * </ul>
 *
 * <p>Deliberately excludes everything invoice-specific: no reminder,
 * no auto-issue toggle, no auto-send, no notes / terms defaults, no
 * CN/DN prefix slots.</p>
 */

type Section = 'branch' | 'numbering';

const MENU: ReadonlyArray<{ key: Section; label: string; icon: typeof Building2; hint: string }> = [
  { key: 'branch',    label: 'Branch',    icon: Building2, hint: 'Clinic logo + branch list' },
  { key: 'numbering', label: 'Numbering', icon: Hash,      hint: 'Encounter no. prefix + format' },
];

export function EncounterSettingsDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { currentUser } = useAuth();
  const tenantId = currentUser?.tenantId ?? null;

  const [section, setSection] = useState<Section>('branch');
  const [settings, setSettings]         = useState<accountingSettingsApi.AccountingSettings | null>(null);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);

  // Branch — tenant-global logo state.
  const [logo, setLogo]                 = useState<attachmentsApi.Attachment | null>(null);
  const [logoBlobUrl, setLogoBlobUrl]   = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement | null>(null);

  // Branch — list state. Each row edits inline; a "New Branch"
  // pseudo-row appears when the operator hits Add.
  const [branches, setBranches]         = useState<branchesApi.Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Numbering — local state.
  const [prefix, setPrefix]             = useState('MED');
  const [dateFormat, setDateFormat]     = useState<'DDMMYYYY' | 'MMYYYY' | 'YYYY'>('YYYY');
  const [seqWidth, setSeqWidth]         = useState(3);

  const loadBranches = async () => {
    setBranchesLoading(true);
    try {
      setBranches(await branchesApi.list());
    } catch {
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await accountingSettingsApi.get('hospital');
        if (cancelled) return;
        setSettings(s);
        setPrefix(s.prefixCommercial ?? 'MED');
        setDateFormat(s.numberDateFormat);
        setSeqWidth(s.numberSeqWidth);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) await loadBranches();
      if (!tenantId || cancelled) return;
      try {
        const rows = await attachmentsApi.list('hospital_logo', tenantId);
        if (cancelled) return;
        setLogo(rows[0] ?? null);
      } catch {
        setLogo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, tenantId]);

  useEffect(() => {
    if (!logo) { setLogoBlobUrl(null); return; }
    let revokedUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const tok = getToken();
      try {
        const res = await fetch(
          `${API_BASE.replace(/\/$/, '')}/api/v1/attachments/${logo.id}/download`,
          { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
        );
        if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revokedUrl = url;
        setLogoBlobUrl(url);
      } catch {
        setLogoBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [logo]);

  const uploadLogo = async (file: File) => {
    if (!tenantId) { toast.error('Tenant context missing — log out and back in'); return; }
    if (!file.type.startsWith('image/')) {
      toast.error('Logo must be an image (PNG, JPG, SVG, …)');
      return;
    }
    setUploading(true);
    try {
      const row = await attachmentsApi.upload('hospital_logo', tenantId, file);
      setLogo(row);
      toast.success('Logo uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!logo) return;
    try {
      await attachmentsApi.remove(logo.id);
      setLogo(null);
      toast.success('Logo removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove logo');
    }
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await accountingSettingsApi.update('hospital', {
        ...settings,
        // Numbering is the only accounting-settings-backed field left
        // — branch data lives on its own /branches table now, and the
        // logo persists via /attachments. Header text stays on the
        // row for backwards compat with the current print-header
        // reader but the FE no longer writes to it (branches are the
        // future source of truth).
        prefixCommercial: prefix.trim() || 'MED',
        prefixTax:        prefix.trim() || 'MED',
        prefixCreditNote: prefix.trim() || 'MED',
        prefixDebitNote:  prefix.trim() || 'MED',
        numberDateFormat: dateFormat,
        numberSeqWidth:   seqWidth,
      });
      setSettings(updated);
      toast.success('Encounter settings saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const numberPreview = (() => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const dateStr = dateFormat === 'DDMMYYYY' ? `${dd}${mm}${yyyy}`
                  : dateFormat === 'MMYYYY'   ? `${mm}${yyyy}`
                  :                             yyyy;
    const seq = String(1).padStart(Math.max(2, Math.min(6, seqWidth)), '0');
    return `${prefix.trim() || 'MED'}-${dateStr}-${seq}`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px] w-[94vw] max-h-[92vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            Encounter Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Encounter settings — logo, branches, and numbering.
          </DialogDescription>
        </DialogHeader>

        {loading || !settings ? (
          <div className="py-16 text-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 inline mr-1 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex min-h-[500px]">
            <nav className="w-48 shrink-0 border-r bg-gray-50/50 py-2">
              <ul className="space-y-0.5 px-2">
                {MENU.map(m => {
                  const active = section === m.key;
                  const Icon = m.icon;
                  return (
                    <li key={m.key}>
                      <button
                        type="button"
                        onClick={() => setSection(m.key)}
                        className={`w-full flex items-start gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                          active
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-teal-600' : 'text-gray-500'}`} />
                        <span>
                          <span className="font-medium block">{m.label}</span>
                          <span className={`text-[10px] leading-tight block ${active ? 'text-teal-700/70' : 'text-gray-500'}`}>
                            {m.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="flex-1 min-w-0 overflow-y-auto px-6 py-4 space-y-4">
              {section === 'branch' && (
                <BranchSection
                  logoBlobUrl={logoBlobUrl}
                  logo={logo}
                  fileInputRef={fileInputRef}
                  uploading={uploading}
                  onUpload={uploadLogo}
                  onRemove={removeLogo}
                  branches={branches}
                  loading={branchesLoading}
                  onRefresh={loadBranches}
                />
              )}

              {section === 'numbering' && (
                <NumberingSection
                  prefix={prefix} setPrefix={setPrefix}
                  dateFormat={dateFormat} setDateFormat={setDateFormat}
                  seqWidth={seqWidth} setSeqWidth={setSeqWidth}
                  preview={numberPreview}
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchSection({
  logoBlobUrl, logo, fileInputRef, uploading, onUpload, onRemove,
  branches, loading, onRefresh,
}: {
  logoBlobUrl: string | null;
  logo: attachmentsApi.Attachment | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  onUpload: (file: File) => Promise<void> | void;
  onRemove: () => Promise<void> | void;
  branches: branchesApi.Branch[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      {/* Tenant-global logo. Sits above the branch table because it
          applies to every branch until a future v-encounter-branch-logo
          introduces per-row overrides. */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <Label className="text-sm font-medium">Clinic logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 border rounded-md bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoBlobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoBlobUrl} alt="Clinic logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-gray-300" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {uploading ? 'Uploading…' : logo ? 'Replace' : 'Upload logo'}
                </Button>
                {logo && (
                  <Button
                    size="sm" variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={onRemove}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-tight">
                PNG / JPG / SVG. Applied to every branch until per-branch logos ship.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branch list. Add row spawns an inline editor; existing rows
          become editors when the operator clicks Edit. Delete is
          immediate (no confirm — the row is trivial to re-create if
          needed). */}
      <BranchList branches={branches} loading={loading} onRefresh={onRefresh} />
    </>
  );
}

/** Table + inline editor for branches. Keeps its own draft row state
 *  so Add / Edit / Delete can act immediately, independent of the
 *  outer dialog's Save (which only owns numbering). */
function BranchList({ branches, loading, onRefresh }: {
  branches: branchesApi.Branch[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft]         = useState<{ name: string; phone: string; address: string }>({ name: '', phone: '', address: '' });
  const [busy, setBusy]           = useState(false);

  const startNew = () => {
    setDraft({ name: '', phone: '', address: '' });
    setEditingId('new');
  };
  const startEdit = (b: branchesApi.Branch) => {
    setDraft({ name: b.name, phone: b.phone ?? '', address: b.address ?? '' });
    setEditingId(b.id);
  };
  const cancelEdit = () => setEditingId(null);

  const commit = async () => {
    if (!draft.name.trim()) { toast.error('Branch name is required'); return; }
    setBusy(true);
    try {
      if (editingId === 'new') {
        await branchesApi.create({
          name: draft.name.trim(),
          phone: draft.phone.trim() || null,
          address: draft.address.trim() || null,
        });
        toast.success('Branch added');
      } else if (editingId) {
        // Preserve the row's existing default flag on inline edits —
        // the "make default" star has its own dedicated action so a
        // rename doesn't accidentally demote it.
        const existing = branches.find(x => x.id === editingId);
        await branchesApi.update(editingId, {
          name: draft.name.trim(),
          phone: draft.phone.trim() || null,
          address: draft.address.trim() || null,
          isDefault: existing?.isDefault ?? false,
        });
        toast.success('Branch updated');
      }
      setEditingId(null);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save branch');
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (b: branchesApi.Branch) => {
    if (b.isDefault) return;
    setBusy(true);
    try {
      await branchesApi.update(b.id, {
        name: b.name,
        phone: b.phone ?? null,
        address: b.address ?? null,
        isDefault: true,
      });
      toast.success(`${b.name} is now the default branch for printing`);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set default branch');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: branchesApi.Branch) => {
    if (!confirm(`Delete branch "${b.name}"?`)) return;
    setBusy(true);
    try {
      await branchesApi.remove(b.id);
      toast.success('Branch deleted');
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete branch');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Branches</Label>
          <Button size="sm" variant="outline" onClick={startNew} disabled={editingId !== null}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add branch
          </Button>
        </div>

        {loading ? (
          <div className="py-4 text-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 mr-1 inline animate-spin" /> Loading…
          </div>
        ) : branches.length === 0 && editingId !== 'new' ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No branches yet — click Add branch to register the first location.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-center">Default</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[160px]">Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right w-[96px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editingId === 'new' && (
                <BranchEditorRow
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  onCommit={commit}
                  onCancel={cancelEdit}
                />
              )}
              {branches.map(b => (
                editingId === b.id ? (
                  <BranchEditorRow
                    key={b.id}
                    draft={draft}
                    setDraft={setDraft}
                    busy={busy}
                    onCommit={commit}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <TableRow key={b.id} className="hover:bg-gray-50">
                    {/* Default column is now the click target — filled
                        amber star = default, outline star = click to
                        promote. Consolidated with the set-default
                        action button so each row shows a single star. */}
                    <TableCell className="text-center">
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => makeDefault(b)}
                        disabled={editingId !== null || busy || b.isDefault}
                        title={b.isDefault ? 'Current default branch' : 'Set as default for printing'}
                      >
                        <Star
                          className={`h-4 w-4 ${b.isDefault ? 'text-amber-500 fill-amber-400' : 'text-gray-400'}`}
                          aria-label={b.isDefault ? 'Default branch' : 'Set default'}
                        />
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium align-top">{b.name}</TableCell>
                    <TableCell className="text-sm text-gray-600 align-top">{b.phone || '—'}</TableCell>
                    <TableCell
                      className="text-sm text-gray-600 max-w-[260px] whitespace-pre-wrap align-top"
                      title={b.address ?? ''}
                    >
                      {b.address || '—'}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7"
                          onClick={() => startEdit(b)}
                          disabled={editingId !== null}
                          title="Edit branch"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => remove(b)}
                          disabled={editingId !== null || busy}
                          title="Delete branch"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BranchEditorRow({ draft, setDraft, busy, onCommit, onCancel }: {
  draft: { name: string; phone: string; address: string };
  setDraft: React.Dispatch<React.SetStateAction<{ name: string; phone: string; address: string }>>;
  busy: boolean;
  onCommit: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <TableRow className="bg-teal-50/40">
      {/* Empty cell under the Default column while editing — the
          star action lives on the read-only row and toggles via a
          separate handler, so the editor doesn't duplicate it. */}
      <TableCell className="text-center text-gray-300">·</TableCell>
      <TableCell>
        <Input
          value={draft.name}
          placeholder="Branch name"
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          autoFocus
        />
      </TableCell>
      <TableCell>
        <Input
          value={draft.phone}
          placeholder="+855 12 345 678"
          onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
        />
      </TableCell>
      <TableCell>
        <Textarea
          value={draft.address}
          placeholder="Street, sangkat, khan"
          rows={1}
          className="min-h-[36px]"
          onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-emerald-600" onClick={onCommit} disabled={busy} title="Save">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={onCancel} disabled={busy} title="Cancel">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NumberingSection({
  prefix, setPrefix, dateFormat, setDateFormat, seqWidth, setSeqWidth, preview,
}: {
  prefix: string;   setPrefix: (v: string) => void;
  dateFormat: 'DDMMYYYY' | 'MMYYYY' | 'YYYY';
  setDateFormat: (v: 'DDMMYYYY' | 'MMYYYY' | 'YYYY') => void;
  seqWidth: number; setSeqWidth: (v: number) => void;
  preview: string;
}) {
  return (
    <>
      <Card>
        <CardContent className="pt-4 space-y-3">
          <Label className="text-sm font-medium">Encounter number format</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enc-prefix" className="text-xs">Prefix</Label>
              <Input
                id="enc-prefix"
                value={prefix}
                onChange={e => setPrefix(e.target.value.toUpperCase())}
                maxLength={16}
                placeholder="MED"
                className="uppercase"
              />
              <p className="text-[10px] text-gray-500">
                Leading token on every encounter no. Default {`"MED"`}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enc-date" className="text-xs">Date format</Label>
              <select
                id="enc-date"
                className="h-9 w-full border rounded-md px-2 text-sm bg-background"
                value={dateFormat}
                onChange={e => setDateFormat(e.target.value as 'DDMMYYYY' | 'MMYYYY' | 'YYYY')}
              >
                <option value="YYYY">YYYY (2026)</option>
                <option value="MMYYYY">MMYYYY (072026)</option>
                <option value="DDMMYYYY">DDMMYYYY (08072026)</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Middle chunk of the number. Longer formats reset the
                sequence more often.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enc-width" className="text-xs">Sequence width</Label>
              <select
                id="enc-width"
                className="h-9 w-full border rounded-md px-2 text-sm bg-background"
                value={String(seqWidth)}
                onChange={e => setSeqWidth(Number(e.target.value))}
              >
                <option value="2">2 digits (01)</option>
                <option value="3">3 digits (001)</option>
                <option value="4">4 digits (0001)</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Zero-padding on the running sequence.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="pt-4">
          <Label className="text-xs uppercase text-gray-500 mb-2 block">Next number preview</Label>
          <div className="text-lg font-semibold tabular-nums text-center">{preview}</div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Live sample using today&rsquo;s date. The real sequence
            picks up where the last saved encounter left off — it
            won&rsquo;t reset just because you re-open this dialog.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
