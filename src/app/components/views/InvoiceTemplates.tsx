import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import { FileText, Plus, RefreshCw, Trash2, Edit3, Star, StarOff, Loader2, Copy, Lock } from 'lucide-react';
import {
  invoiceTemplates, defaultTemplateConfig,
} from '../../api/invoiceTemplates';
import type {
  InvoiceTemplate, TemplateKind, TemplateConfig, UpsertInvoiceTemplate,
  LogoPosition, LogoShape,
} from '../../api/invoiceTemplates';

const KIND_META: Record<TemplateKind, { label: string; cls: string }> = {
  invoice: { label: 'Invoice', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  receipt: { label: 'Receipt', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

/**
 * v-invoice-template-mvp — Sale → Templates. List page + form-based
 * editor with a live sample preview. Print path reads the default
 * template per kind (wired in a follow-up).
 */
export function InvoiceTemplates() {
  const [rows, setRows]     = useState<InvoiceTemplate[]>([]);
  const [loading, setLoad]  = useState(false);
  const [open, setOpen]     = useState(false);
  const [editing, setEdit]  = useState<InvoiceTemplate | null>(null);
  /** Built-in preview state — opens the editor in view-only mode so
   *  the operator can inspect what the current default template
   *  looks like before deciding to customise. Null = closed. */
  const [previewingBuiltin, setPreviewingBuiltin] = useState(false);

  /** Open the editor pre-seeded with the built-in default config —
   *  operator ends up with a fresh custom template that starts from
   *  the current print layout instead of a blank canvas. */
  const duplicateBuiltin = () => {
    setEdit({
      id: '', name: 'Copy of Default Template', kind: 'invoice', isDefault: false,
      config: defaultTemplateConfig(),
      createdAt: '', updatedAt: '',
    } as InvoiceTemplate);
    setOpen(true);
  };

  const load = useCallback(async () => {
    setLoad(true);
    try {
      setRows(await invoiceTemplates.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load templates');
    } finally { setLoad(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const doDelete = async (r: InvoiceTemplate) => {
    if (!confirm(`Delete "${r.name}"? Documents printed with this template stay unchanged; only future prints use another.`)) return;
    try {
      await invoiceTemplates.remove(r.id);
      toast.success('Template deleted');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const setDefault = async (r: InvoiceTemplate) => {
    try {
      await invoiceTemplates.update(r.id, { name: r.name, kind: r.kind, isDefault: true });
      toast.success(`${r.name} is now the default ${r.kind}`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Set default failed'); }
  };

  /** Un-promote a custom template so the built-in fallback takes
   *  over for that kind. Sends isDefault=false on the currently-
   *  default row for the same kind; the BE happily accepts the
   *  clear (see InvoiceTemplateController.update). */
  const clearDefault = async (r: InvoiceTemplate) => {
    try {
      await invoiceTemplates.update(r.id, { name: r.name, kind: r.kind, isDefault: false });
      toast.success(`${r.name} no longer default — built-in ${r.kind} template takes over`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Clear default failed'); }
  };

  /** Switch back to the built-in default for kind='invoice'. Finds
   *  whichever custom template currently holds the slot and clears
   *  its is_default flag; the built-in fallback then applies on
   *  the next print. */
  const restoreBuiltinDefault = async () => {
    const current = rows.find(r => r.isDefault && r.kind === 'invoice');
    if (!current) return; // nothing to unset — built-in already active
    await clearDefault(current);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <CardTitle>Templates</CardTitle>
            <span className="text-xs text-gray-500">
              Custom invoice / receipt layouts — set one as the default per doc type.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> New template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* v-invoice-template-builtin-row — pinned first row
                    representing the system-provided default. Not a
                    real DB row; the operator can Preview it, or
                    Duplicate it to a customisable copy. No Edit /
                    Delete because it's not user-owned.
                    Shown even when the tenant has custom templates
                    so the "starting point" stays discoverable. */}
                <TableRow className="bg-gray-50/60">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-gray-400" />
                      Default Template
                    </span>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      System-provided layout used when no custom template is set as default.
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-gray-300 bg-white text-gray-600">
                      Built-in
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* Only "active default" when the tenant hasn't
                        promoted a custom template for kind=invoice.
                        Same rule the print path will apply. */}
                    {rows.some(r => r.isDefault && r.kind === 'invoice') ? (
                      <button
                        type="button"
                        onClick={restoreBuiltinDefault}
                        className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1"
                        title="Switch back to the built-in default"
                      >
                        <StarOff className="h-3 w-3" /> Overridden · restore
                      </button>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 gap-1">
                        <Star className="h-3 w-3 fill-current" /> Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setPreviewingBuiltin(true)}
                        title="Preview the built-in layout"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" /> Preview
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={duplicateBuiltin}
                        title="Duplicate this into a new custom template"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={KIND_META[r.kind].cls}>{KIND_META[r.kind].label}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.isDefault ? (
                        <button
                          type="button"
                          onClick={() => clearDefault(r)}
                          className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-200 transition"
                          title="Unset default — built-in template will take over"
                        >
                          <Star className="h-3 w-3 fill-current" /> Default
                          <span className="ml-1 opacity-70 group-hover:opacity-100">· unset</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDefault(r)}
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                          title="Make this the default for its kind"
                        >
                          <StarOff className="h-3 w-3" /> Set default
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => { setEdit(r); setOpen(true); }} title="Edit">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => doDelete(r)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </CardContent>
      </Card>

      <TemplateEditorDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={() => { setOpen(false); void load(); }}
      />

      {/* Built-in preview — read-only. Reuses the same TemplatePreview
          the editor uses so the operator sees exactly what a
          duplicated copy would start from. */}
      <Dialog open={previewingBuiltin} onOpenChange={setPreviewingBuiltin}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Default Template · Preview</DialogTitle>
          </DialogHeader>
          <TemplatePreview config={defaultTemplateConfig()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewingBuiltin(false)}>Close</Button>
            <Button
              onClick={() => { setPreviewingBuiltin(false); duplicateBuiltin(); }}
            >
              <Copy className="h-4 w-4 mr-1.5" /> Duplicate & customise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Editor dialog — form on the left, live preview on the right  */
/* ------------------------------------------------------------ */

function TemplateEditorDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: InvoiceTemplate | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TemplateKind>('invoice');
  const [isDefault, setDefault] = useState(false);
  const [config, setConfig] = useState<TemplateConfig>(defaultTemplateConfig());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? 'New template');
      setKind(editing?.kind ?? 'invoice');
      setDefault(editing?.isDefault ?? false);
      setConfig({ ...defaultTemplateConfig(), ...(editing?.config ?? {}) });
    }
  }, [open, editing]);

  const patchHeader = (p: Partial<TemplateConfig['header']>) =>
    setConfig(c => ({ ...c, header: { ...c.header, ...p } }));
  const patchColumns = (p: Partial<TemplateConfig['columns']>) =>
    setConfig(c => ({ ...c, columns: { ...c.columns, ...p } }));
  const patchColumnLabels = (p: Partial<TemplateConfig['columnLabels']>) =>
    setConfig(c => ({ ...c, columnLabels: { ...c.columnLabels, ...p } }));
  const patchFooter = (p: Partial<TemplateConfig['footer']>) =>
    setConfig(c => ({ ...c, footer: { ...c.footer, ...p } }));

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body: UpsertInvoiceTemplate = { name: name.trim(), kind, isDefault, config };
      // editing?.id === '' → duplicate flow (built-in seeded), still a
      // create. Real edits carry a non-empty id.
      if (editing && editing.id) {
        await invoiceTemplates.update(editing.id, body);
        toast.success('Template updated');
      } else {
        await invoiceTemplates.create(body);
        toast.success('Template created');
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {/* Duplicate flow (editing has no id) reads as "New" —
                we're creating a fresh row seeded with the built-in
                config, not editing an existing one. */}
            {editing?.id
              ? `Edit ${editing.name}`
              : editing
                ? 'New template (from Default)'
                : 'New template'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
          {/* Left — form */}
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={v => setKind(v as TemplateKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={isDefault} onCheckedChange={setDefault} />
              <span className="text-sm">Default for {kind}</span>
              <span className="text-xs text-gray-500">(promoting demotes the current default)</span>
            </label>

            <div className="border rounded-md p-3 space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Header</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Doc title</Label>
                  <Input value={config.header?.title ?? ''} onChange={e => patchHeader({ title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Accent colour</Label>
                  <Input type="color" value={config.header?.accentColor ?? '#2563eb'} onChange={e => patchHeader({ accentColor: e.target.value })} className="h-9 p-1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Header background</Label>
                  <Input type="color" value={config.header?.headerBackgroundColor ?? '#0f172a'} onChange={e => patchHeader({ headerBackgroundColor: e.target.value })} className="h-9 p-1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Header text</Label>
                  <Input type="color" value={config.header?.headerTextColor ?? '#ffffff'} onChange={e => patchHeader({ headerTextColor: e.target.value })} className="h-9 p-1" />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <SwitchRow label="Show logo"          checked={!!config.header?.showLogo}         onChange={v => patchHeader({ showLogo: v })} />
                <SwitchRow label="Show company block" checked={!!config.header?.showCompanyBlock} onChange={v => patchHeader({ showCompanyBlock: v })} />
              </div>
              {/* v-invoice-template-logo-position — segmented picker
                  for where the logo sits inside the header bar.
                  Doc title + company block re-flow around it (see
                  TemplatePreview below). */}
              {config.header?.showLogo && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Logo position</Label>
                    <div className="inline-flex items-center gap-1 rounded-md border p-1 bg-white">
                      {(['left', 'middle', 'right'] as const).map(pos => {
                        const active = (config.header?.logoPosition ?? 'left') === pos;
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => patchHeader({ logoPosition: pos as LogoPosition })}
                            className={`px-3 h-7 text-xs rounded capitalize transition ${
                              active
                                ? 'bg-blue-600 text-white font-medium'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* v-invoice-template-logo-shape — how the logo
                      frame is cropped. Circle enforces 1:1 with a
                      pill radius; Square enforces 1:1 with a small
                      radius; Rectangle keeps the natural landscape
                      aspect (matches today's print behaviour). */}
                  <div className="space-y-1">
                    <Label className="text-xs">Logo shape</Label>
                    <div className="inline-flex items-center gap-1 rounded-md border p-1 bg-white">
                      {(['circle', 'square', 'rectangle'] as const).map(shape => {
                        const active = (config.header?.logoShape ?? 'rectangle') === shape;
                        return (
                          <button
                            key={shape}
                            type="button"
                            onClick={() => patchHeader({ logoShape: shape as LogoShape })}
                            className={`px-3 h-7 text-xs rounded capitalize transition ${
                              active
                                ? 'bg-blue-600 text-white font-medium'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {shape}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Line-item columns</div>
              <div className="grid grid-cols-2 gap-2">
                {(['item', 'specification', 'uom', 'quantity', 'unitPrice', 'total'] as const).map(col => (
                  <div key={col} className="flex items-center gap-2">
                    <Switch
                      checked={!!config.columns?.[col]}
                      onCheckedChange={v => patchColumns({ [col]: v })}
                    />
                    <Input
                      value={config.columnLabels?.[col] ?? ''}
                      onChange={e => patchColumnLabels({ [col]: e.target.value })}
                      placeholder={col}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                Toggle the switch to include the column; label lets you rename it (e.g. "Qty" → "Quantity").
              </p>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Footer</div>
              <SwitchRow label="Show banking / payment info" checked={!!config.footer?.showBanking} onChange={v => patchFooter({ showBanking: v })} />
              <SwitchRow label="Show terms & conditions"    checked={!!config.footer?.showTerms}   onChange={v => patchFooter({ showTerms: v })} />
              <SwitchRow label="Show thank-you line"        checked={!!config.footer?.showThankYou} onChange={v => patchFooter({ showThankYou: v })} />
              <div className="space-y-1">
                <Label className="text-xs">Thank-you text</Label>
                <Input
                  value={config.footer?.thankYouText ?? ''}
                  onChange={e => patchFooter({ thankYouText: e.target.value })}
                  disabled={!config.footer?.showThankYou}
                />
              </div>
            </div>
          </div>

          {/* Right — live preview */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Preview</div>
            <TemplatePreview config={config} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------ */
/* Live preview — same shape the print path will read           */
/* ------------------------------------------------------------ */

function TemplatePreview({ config }: { config: TemplateConfig }) {
  const h = config.header  ?? {};
  const c = config.columns ?? {};
  const l = config.columnLabels ?? {};
  const f = config.footer  ?? {};

  const SAMPLE_LINES = [
    { item: 'Web Design',           spec: 'Landing page + 3 sub-pages', uom: 'pcs', qty: 1, unit: 500 },
    { item: 'Software Development', spec: 'Backend + admin dashboard',  uom: 'pcs', qty: 1, unit: 1500 },
    { item: 'SEO Package',          spec: 'On-page + backlinks',        uom: 'mo',  qty: 3, unit: 200 },
  ];
  const subtotal = SAMPLE_LINES.reduce((s, l) => s + l.qty * l.unit, 0);

  const logoPos   = h.logoPosition ?? 'left';
  const logoShape = h.logoShape    ?? 'rectangle';
  /** Placeholder box representing the tenant logo — the real print
   *  path swaps this for the company_info.logo_url image. Shape
   *  drives width x height x border-radius:
   *    circle    → 40x40 with a fully-round pill radius
   *    square    → 40x40 with a small rounded corner
   *    rectangle → 90x32 landscape (matches today's print)
   *  Colour contrasts with the header background so it's visible
   *  on both the dark default and any lighter accent choice. */
  const LogoBox = () => {
    const { width, height, borderRadius } =
      logoShape === 'circle'   ? { width: 40, height: 40, borderRadius: 9999 }
      : logoShape === 'square' ? { width: 40, height: 40, borderRadius: 4 }
      :                          { width: 90, height: 32, borderRadius: 4 };
    return (
      <div
        className="flex items-center justify-center font-bold tracking-wider text-[10px]"
        style={{
          width, height, borderRadius,
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.35)',
          color: h.headerTextColor,
        }}
      >
        LOGO
      </div>
    );
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white text-[11px]">
      {/* Header bar — three-slot flex row so the logo can sit left,
          middle or right of the doc title + company block. */}
      <div
        className="relative px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: h.headerBackgroundColor, color: h.headerTextColor }}
      >
        {/* Left slot: logo (if left-positioned) + doc title */}
        <div className="flex items-center gap-3">
          {h.showLogo && logoPos === 'left' && <LogoBox />}
          <div className="text-xl font-semibold tracking-widest">{h.title || 'INVOICE'}</div>
        </div>

        {/* Middle slot: only used when logoPosition === 'middle'.
            Absolute so it doesn't push the outer flex — keeps the
            visual balance between title (left) and company block
            (right). */}
        {h.showLogo && logoPos === 'middle' && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <LogoBox />
          </div>
        )}

        {/* Right slot: company block + logo (if right-positioned) */}
        <div className="flex items-center gap-3">
          {h.showCompanyBlock && (
            <div className="text-right leading-tight">
              <div className="font-semibold">Acme Ltd.</div>
              <div className="opacity-80">1901 Thornridge Cir.</div>
            </div>
          )}
          {h.showLogo && logoPos === 'right' && <LogoBox />}
        </div>
      </div>
      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-gray-500">Invoice To</div>
            <div className="font-semibold">SMART TECH LTD</div>
            <div className="text-gray-600">Hawaii 81063</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">Invoice No · 5478459</div>
            <div className="text-gray-500">Date · 25 Mar, 2026</div>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ color: h.accentColor }}>
              {c.item          && <th className="text-left  py-1 font-semibold uppercase text-[10px]">{l.item ?? 'Item'}</th>}
              {c.specification && <th className="text-left  py-1 font-semibold uppercase text-[10px]">{l.specification ?? 'Specification'}</th>}
              {c.uom           && <th className="text-left  py-1 font-semibold uppercase text-[10px]">{l.uom ?? 'UOM'}</th>}
              {c.quantity      && <th className="text-right py-1 font-semibold uppercase text-[10px]">{l.quantity ?? 'Qty'}</th>}
              {c.unitPrice     && <th className="text-right py-1 font-semibold uppercase text-[10px]">{l.unitPrice ?? 'Unit Price'}</th>}
              {c.total         && <th className="text-right py-1 font-semibold uppercase text-[10px]">{l.total ?? 'Total'}</th>}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_LINES.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                {c.item          && <td className="py-1">{row.item}</td>}
                {c.specification && <td className="py-1 text-gray-500">{row.spec}</td>}
                {c.uom           && <td className="py-1">{row.uom}</td>}
                {c.quantity      && <td className="py-1 text-right tabular-nums">{row.qty}</td>}
                {c.unitPrice     && <td className="py-1 text-right tabular-nums">${row.unit.toFixed(2)}</td>}
                {c.total         && <td className="py-1 text-right tabular-nums">${(row.qty * row.unit).toFixed(2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-56 space-y-0.5">
            <div className="flex justify-between"><span className="text-gray-500">Sub Total</span><span className="tabular-nums">${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="tabular-nums">0.00</span></div>
            <div className="flex justify-between font-bold border-t pt-1" style={{ color: h.accentColor }}>
              <span>Total</span><span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
        {f.showBanking && (
          <div className="text-gray-600 border-t pt-2">
            <div className="text-gray-500 mb-0.5">Payment Info</div>
            <div>Account · 5478474586 · Natwest · Mark Wood</div>
          </div>
        )}
        {f.showThankYou && (
          <div className="text-gray-700 font-medium">{f.thankYouText ?? 'Thank you for your business!'}</div>
        )}
        {f.showTerms && (
          <div className="text-gray-500 italic border-t pt-2">
            Terms & Conditions apply. Please pay within 30 days.
          </div>
        )}
      </div>
    </div>
  );
}
