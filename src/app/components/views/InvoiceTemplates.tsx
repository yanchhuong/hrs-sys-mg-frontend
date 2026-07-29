import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import {
  FileText, Plus, RefreshCw, Trash2, Edit3, Star, StarOff, Loader2, Copy, Lock,
  AlignLeft, AlignCenter, AlignRight,
  Circle, Square, RectangleHorizontal,
  Info,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  invoiceTemplates, defaultTemplateConfig,
} from '../../api/invoiceTemplates';
import type {
  InvoiceTemplate, TemplateKind, TemplateConfig, UpsertInvoiceTemplate,
  LogoPosition, LogoShape, PaperSize,
} from '../../api/invoiceTemplates';

/** Effective paper size — resolves the paperSize field against the
 *  template's kind. Kept in one place so preview / print / editor
 *  agree on the fallback. */
function effectivePaperSize(config: TemplateConfig, kind: TemplateKind): PaperSize {
  return config.paperSize ?? (kind === 'receipt' ? '80mm' : 'A4');
}
function isThermal(size: PaperSize): boolean {
  return size === '58mm' || size === '80mm';
}
const PAPER_SIZE_META: Record<PaperSize, { label: string; hint: string; widthPx: number }> = {
  'A4':   { label: 'A4',   hint: '210 × 297 mm — standard invoice',    widthPx: 210 * 3 },
  'A5':   { label: 'A5',   hint: '148 × 210 mm — compact invoice',     widthPx: 148 * 3 },
  '80mm': { label: '80 mm', hint: 'POS thermal — standard receipt',    widthPx:  80 * 3 },
  '58mm': { label: '58 mm', hint: 'POS thermal — narrow receipt',      widthPx:  58 * 3 },
};

const KIND_META: Record<TemplateKind, { label: string; cls: string }> = {
  invoice: { label: 'Invoice', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  receipt: { label: 'Receipt', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

/**
 * Starter presets — the operator picks one from the gallery when
 * they hit "New template" instead of starting on a blank canvas.
 * Each preset is (a) a full TemplateConfig, (b) a name we pre-fill
 * the editor with, and (c) a short description explaining who this
 * layout fits. Adding a new preset here is a one-liner change; no
 * plumbing needed downstream.
 */
type TemplatePreset = {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
  config: TemplateConfig;
  /** Flag the built-in "recommended" starting points — one per kind.
   *  The gallery highlights these two above the other samples so a
   *  tenant landing here for the first time knows where to start. */
  isRecommendedDefault?: boolean;
};

const SAMPLE_PRESETS: TemplatePreset[] = [
  {
    id: 'classic-bilingual',
    name: 'Classic Bilingual',
    description: 'Cambodian formal layout — logo left, full column set, signatures. Matches today\'s built-in default. Best for B2B commercial invoices.',
    kind: 'invoice',
    config: defaultTemplateConfig(),
    isRecommendedDefault: true,
  },
  {
    id: 'thermal-80-receipt',
    name: 'Thermal 80 mm · Receipt',
    description: 'Standard 80 mm POS thermal roll — narrow strip with Item / Amount, red PAID stamp, thank-you footer. Good for coffee shops and small retail.',
    kind: 'receipt',
    config: {
      paperSize: '80mm',
      header: {
        showLogo: false, logoPosition: 'middle', logoShape: 'rectangle', logoSize: 40,
        showCompanyBlock: true, title: 'Receipt', accentColor: '#dc2626',
      },
      columns:      { item: true, uom: false, quantity: true, unitPrice: true, total: true },
      columnLabels: { item: 'Item', quantity: 'Qty', unitPrice: 'Price', total: 'Amount' },
      footer: {
        showBanking: false, showTerms: false, showThankYou: true,
        thankYouText: 'Thank you!',
        showCustomerSignature: false, showSellerSignature: false,
      },
    },
    isRecommendedDefault: true,
  },
  {
    id: 'centered-logo-formal',
    name: 'Centered Logo — Formal',
    description: 'Logo centered above the company name for a more ceremonial look. All columns on, both signature blocks, terms + thank-you printed.',
    kind: 'invoice',
    config: {
      header: {
        showLogo: true, logoPosition: 'middle', logoShape: 'square', logoSize: 80,
        showCompanyBlock: true, title: 'Invoice', accentColor: '#0f172a',
      },
      columns:      { item: true, uom: true, quantity: true, unitPrice: true, total: true },
      columnLabels: { item: 'Description', uom: 'UOM', quantity: 'Qty', unitPrice: 'Unit Price', total: 'Amount' },
      footer: {
        showBanking: true, showTerms: true, showThankYou: true,
        thankYouText: 'Thank you for your business.',
        showCustomerSignature: true, showSellerSignature: true,
      },
    },
  },
  {
    id: 'branded-premium',
    name: 'Branded Premium',
    description: 'Larger logo (right-aligned), navy accent, all columns, full footer with banking + terms + both signatures. For a polished corporate look.',
    kind: 'invoice',
    config: {
      header: {
        showLogo: true, logoPosition: 'right', logoShape: 'square', logoSize: 96,
        showCompanyBlock: true, title: 'Invoice', accentColor: '#1e40af',
      },
      columns:      { item: true, uom: true, quantity: true, unitPrice: true, total: true },
      columnLabels: { item: 'Description', uom: 'Unit', quantity: 'Quantity', unitPrice: 'Unit Price', total: 'Line Total' },
      footer: {
        showBanking: true, showTerms: true, showThankYou: true,
        thankYouText: 'Thank you for your business!',
        showCustomerSignature: true, showSellerSignature: true,
      },
    },
  },
  {
    id: 'e-invoice-no-signature',
    name: 'E-Invoice · No Signature',
    description: 'For emailed / PDF-only invoices. Signature blocks removed (no wet-ink needed), banking front-and-center, thank-you line, terms printed.',
    kind: 'invoice',
    config: {
      header: {
        showLogo: true, logoPosition: 'left', logoShape: 'circle', logoSize: 60,
        showCompanyBlock: true, title: 'Invoice', accentColor: '#7c3aed',
      },
      columns:      { item: true, uom: true, quantity: true, unitPrice: true, total: true },
      columnLabels: { item: 'Description', uom: 'UOM', quantity: 'Qty', unitPrice: 'Unit Price', total: 'Amount' },
      footer: {
        showBanking: true, showTerms: true, showThankYou: true,
        thankYouText: 'Thank you — payment details below.',
        showCustomerSignature: false, showSellerSignature: false,
      },
    },
  },
  {
    id: 'thermal-58-narrow',
    name: 'Thermal 58 mm · Narrow',
    description: 'Ultra-narrow 58 mm receipt roll. Only Item + Amount lines with a qty×price sub-line. Fits handheld POS printers and mini kiosks.',
    kind: 'receipt',
    config: {
      paperSize: '58mm',
      header: {
        showLogo: false, logoPosition: 'middle', logoShape: 'rectangle', logoSize: 32,
        showCompanyBlock: true, title: 'Receipt', accentColor: '#111827',
      },
      columns:      { item: true, uom: false, quantity: true, unitPrice: true, total: true },
      columnLabels: { item: 'Item', quantity: 'Qty', total: 'Amount' },
      footer: {
        showBanking: false, showTerms: false, showThankYou: true,
        thankYouText: 'Thank you!',
        showCustomerSignature: false, showSellerSignature: false,
      },
    },
  },
];

/**
 * Card tile for a single template row (built-in or custom). Renders
 * a REAL scaled-down TemplatePreview thumbnail so the operator can
 * eyeball each layout at a glance without opening a modal. Same
 * shape as the gallery-preset cards so the two UIs feel like one
 * system. Clicking the thumbnail fires `onThumbnailClick` (usually
 * opens the full-size preview).
 */
function TemplateCard({
  variant,
  title,
  caption,
  config,
  kind = 'invoice',
  kindBadge,
  isDefault,
  onSetDefault,
  onClearDefault,
  onThumbnailClick,
  actions,
}: {
  variant: 'builtin' | 'custom';
  title: string;
  caption: string;
  /** Live config powering the thumbnail. Required — the schematic
   *  mock we used before hid meaningful differences between rows. */
  config: TemplateConfig;
  /** Drives paper-size fallback when config.paperSize is unset. */
  kind?: TemplateKind;
  kindBadge: React.ReactNode;
  isDefault: boolean;
  onSetDefault?: () => void;
  onClearDefault?: () => void;
  onThumbnailClick?: () => void;
  actions: React.ReactNode;
}) {
  const isBuiltin = variant === 'builtin';
  return (
    <div className={`group relative rounded-lg border bg-white overflow-hidden flex flex-col transition hover:shadow-md ${
      isDefault ? 'ring-2 ring-emerald-300 border-emerald-200' : 'border-gray-200'
    }`}>
      {/* Live-preview thumbnail — scale-42 render of the actual
          template config. Same trick as the gallery cards so the
          two UIs feel unified. */}
      <button
        type="button"
        onClick={onThumbnailClick}
        disabled={!onThumbnailClick}
        title={onThumbnailClick ? 'Click to preview' : undefined}
        className={`relative bg-gray-50 border-b p-2 text-left w-full overflow-hidden ${
          onThumbnailClick ? 'cursor-zoom-in' : 'cursor-default'
        }`}
        style={{ height: 200 }}
      >
        <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: '238%', pointerEvents: 'none' }}>
          <TemplatePreview config={config} kind={kind} />
        </div>
        {isDefault && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-semibold shadow">
            <Star className="h-3 w-3 fill-current" /> Default
          </div>
        )}
      </button>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm inline-flex items-center gap-1.5 truncate">
              {isBuiltin && <Lock className="h-3 w-3 text-gray-400 shrink-0" />}
              <span className="truncate">{title}</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{caption}</div>
          </div>
          <div className="shrink-0">{kindBadge}</div>
        </div>

        {/* Default toggle line — clickable state chip. */}
        <div className="text-[11px]">
          {isDefault ? (
            onClearDefault ? (
              <button
                type="button"
                onClick={onClearDefault}
                className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-semibold hover:bg-emerald-200 transition"
                title={isBuiltin ? 'Built-in is currently active' : 'Unset default — built-in template will take over'}
              >
                <Star className="h-3 w-3 fill-current" /> Active default
                {!isBuiltin && <span className="opacity-70">· unset</span>}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-semibold">
                <Star className="h-3 w-3 fill-current" /> Active default
              </span>
            )
          ) : isBuiltin ? (
            <button
              type="button"
              onClick={onClearDefault}
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
              title="Switch back to the built-in default"
            >
              <StarOff className="h-3 w-3" /> Overridden · restore
            </button>
          ) : onSetDefault ? (
            <button
              type="button"
              onClick={onSetDefault}
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
              title="Make this the default for its kind"
            >
              <StarOff className="h-3 w-3" /> Set as default
            </button>
          ) : null}
        </div>

        {/* Actions pinned to the bottom of the card. */}
        <div className="mt-auto pt-2 border-t flex flex-wrap gap-1">
          {actions}
        </div>
      </div>
    </div>
  );
}

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
  /** Sample-gallery dialog — opens when the operator hits
   *  "New template" so they pick a starting preset instead of a
   *  blank canvas. Null = closed. */
  const [pickingSample, setPickingSample] = useState(false);
  /** Full-size preview for a specific preset (from the gallery) or
   *  a saved custom template (from a Card's Preview action). Null =
   *  closed. The dialog offers a "Use this" action that seeds the
   *  editor with the previewed preset. */
  const [previewingConfig, setPreviewingConfig] = useState<{
    title: string;
    config: TemplateConfig;
    kind: TemplateKind;
    preset?: TemplatePreset;    // gallery preset — enables "Use this"
    kindBadge?: React.ReactNode;
  } | null>(null);

  /** Seed the editor from a gallery preset — creates an unsaved
   *  draft row that behaves like a duplicate (has no id yet, so
   *  submit() flows through the create path). */
  const startFromPreset = (preset: TemplatePreset) => {
    setPickingSample(false);
    setEdit({
      id: '', name: `New — ${preset.name}`, kind: preset.kind, isDefault: false,
      config: preset.config,
      createdAt: '', updatedAt: '',
    } as InvoiceTemplate);
    setOpen(true);
  };

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
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="What Templates are"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Custom invoice / receipt layouts — set one as the default per doc type.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => setPickingSample(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Two independent Cards side-by-side — "Invoice templates"
           *  and "POS Receipt templates" — each with its own CardTitle
           *  so the kind label reads as a proper heading. Each kind
           *  has its OWN active-default slot (V255 partial unique
           *  index on (tenant_id, kind)); both can be live at once.
           *  Collapses to a single column on narrow viewports. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {(['invoice', 'receipt'] as const).map(kindKey => {
            const kindRows     = rows.filter(r => r.kind === kindKey);
            const activeRow    = kindRows.find(r => r.isDefault);
            const sectionLabel = kindKey === 'invoice' ? 'Invoice templates' : 'POS Receipt templates';
            const builtinName  = kindKey === 'invoice' ? 'Classic Bilingual (A4)' : 'Thermal 80 mm';
            return (
              <Card key={kindKey} className="border-gray-200">
                <CardHeader className="flex flex-row items-center gap-3 py-3">
                  <CardTitle className="text-base">{sectionLabel}</CardTitle>
                  {activeRow ? (
                    <button
                      type="button"
                      onClick={() => clearDefault(activeRow)}
                      className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-200 transition"
                      title="Unset — the built-in fallback will take over"
                    >
                      <Star className="h-3 w-3 fill-current" /> Active: {activeRow.name}
                      <span className="opacity-70 ml-1">· unset</span>
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-medium"
                      title="No custom template promoted — printing uses the system default"
                    >
                      <Lock className="h-3 w-3" /> Using built-in {builtinName}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  {kindRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg bg-gray-50">
                      <FileText className="h-8 w-8 text-gray-300 mb-2" />
                      <div className="text-sm text-gray-600">
                        No custom {kindKey === 'invoice' ? 'Invoice' : 'Receipt'} templates yet
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                        Printing uses the built-in {builtinName} layout. Use “New template” above to customise.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {kindRows.map(r => (
                        <TemplateCard
                          key={r.id}
                          variant="custom"
                          title={r.name}
                          caption={`${KIND_META[r.kind].label} layout · updated ${new Date(r.updatedAt).toLocaleDateString()}`}
                          config={r.config ?? defaultTemplateConfig()}
                          kind={r.kind}
                          kindBadge={
                            <Badge variant="outline" className={KIND_META[r.kind].cls}>
                              {KIND_META[r.kind].label}
                            </Badge>
                          }
                          isDefault={r.isDefault}
                          onSetDefault={() => setDefault(r)}
                          onClearDefault={() => clearDefault(r)}
                          onThumbnailClick={() => setPreviewingConfig({
                            title: r.name,
                            config: r.config ?? defaultTemplateConfig(),
                            kind: r.kind,
                            kindBadge: <Badge variant="outline" className={KIND_META[r.kind].cls}>{KIND_META[r.kind].label}</Badge>,
                          })}
                          actions={
                            <>
                              <Button
                                variant="outline" size="sm"
                                onClick={() => setPreviewingConfig({
                                  title: r.name,
                                  config: r.config ?? defaultTemplateConfig(),
                                  kind: r.kind,
                                  kindBadge: <Badge variant="outline" className={KIND_META[r.kind].cls}>{KIND_META[r.kind].label}</Badge>,
                                })}
                                title="Preview this template"
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" /> Preview
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setEdit(r); setOpen(true); }} title="Edit template">
                                <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => doDelete(r)} title="Delete template">
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          </div>
        </CardContent>
      </Card>

      <TemplateEditorDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={() => { setOpen(false); void load(); }}
      />

      {/* Sample gallery — first step of "New template". Presents
          the operator with a grid of pre-designed starting points so
          they never begin from a blank canvas. Selecting a card
          seeds the editor with that preset's config; the editor
          takes over from there. */}
      <Dialog open={pickingSample} onOpenChange={setPickingSample}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            {/* Helper copy moved off-canvas into a hover tooltip so
                the gallery grid starts higher on the page. */}
            <DialogTitle className="flex items-center gap-2">
              Choose a starting template
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="What is this?" className="text-gray-400 hover:text-gray-600 transition">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    Pick a preset that's closest to what you need — you'll be able to edit anything (name, colours, columns, footer) on the next screen.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
          </DialogHeader>
          {/* Group presets: "Recommended defaults" (2 rows, one per
              kind — the tenant's real starting points) render at the
              top, then a divider, then the rest as "More sample
              layouts". First-time visitors focus on the two
              recommended cards before scrolling to explore variants. */}
          {(() => {
            const recommended = SAMPLE_PRESETS.filter(p => p.isRecommendedDefault);
            const others      = SAMPLE_PRESETS.filter(p => !p.isRecommendedDefault);
            const renderCard  = (p: TemplatePreset) => (
              <div
                key={p.id}
                className={`text-left border rounded-lg overflow-hidden bg-white hover:shadow-md hover:border-blue-300 transition flex flex-col group ${
                  p.isRecommendedDefault ? 'ring-2 ring-emerald-200' : ''
                }`}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPreviewingConfig({
                      title: p.name, config: p.config, kind: p.kind, preset: p,
                      kindBadge: <Badge variant="outline" className={KIND_META[p.kind].cls}>{KIND_META[p.kind].label}</Badge>,
                    })}
                    className="bg-gray-50 p-2 border-b overflow-hidden text-left w-full"
                    style={{ height: 200 }}
                    title="Click to preview"
                  >
                    <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: '238%', pointerEvents: 'none' }}>
                      <TemplatePreview config={p.config} kind={p.kind} />
                    </div>
                  </button>
                  {p.isRecommendedDefault && (
                    <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-semibold shadow">
                      <Star className="h-3 w-3 fill-current" /> Recommended
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    <Badge variant="outline" className={KIND_META[p.kind].cls}>{KIND_META[p.kind].label}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed flex-1">{p.description}</p>
                  <div className="mt-auto pt-2 border-t flex gap-1">
                    <Button
                      variant="outline" size="sm" className="flex-1"
                      onClick={() => setPreviewingConfig({
                        title: p.name, config: p.config, kind: p.kind, preset: p,
                        kindBadge: <Badge variant="outline" className={KIND_META[p.kind].cls}>{KIND_META[p.kind].label}</Badge>,
                      })}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" /> Preview
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => startFromPreset(p)}>
                      Use this
                    </Button>
                  </div>
                </div>
              </div>
            );
            return (
              <>
                {recommended.length > 0 && (
                  <>
                    <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mt-2 mb-1">
                      Recommended defaults
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {recommended.map(renderCard)}
                    </div>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mt-5 mb-1">
                      More sample layouts
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {others.map(renderCard)}
                    </div>
                  </>
                )}
              </>
            );
          })()}
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setPickingSample(false)}>Cancel</Button>
            {/* Escape hatch — for operators who really want to start
                with the bare minimum. Seeds an empty-name row using
                the built-in default config. */}
            <Button
              variant="secondary"
              onClick={() => { setPickingSample(false); setEdit(null); setOpen(true); }}
              title="Start from a blank editor with the built-in defaults"
            >
              Start blank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Universal preview modal — used by gallery preset cards and
          custom template cards alike. Shows the config rendered
          full-size (same TemplatePreview the editor uses). When the
          source is a gallery preset, offers a "Use this preset"
          primary action; otherwise it's read-only. */}
      <Dialog open={!!previewingConfig} onOpenChange={o => { if (!o) setPreviewingConfig(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewingConfig?.title}
              {previewingConfig?.kindBadge}
              <span className="text-xs font-normal text-gray-500">· Preview</span>
            </DialogTitle>
          </DialogHeader>
          {previewingConfig && <TemplatePreview config={previewingConfig.config} kind={previewingConfig.kind} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewingConfig(null)}>Close</Button>
            {previewingConfig?.preset && (
              <Button
                onClick={() => {
                  const p = previewingConfig.preset!;
                  setPreviewingConfig(null);
                  startFromPreset(p);
                }}
              >
                <Copy className="h-4 w-4 mr-1.5" /> Use this preset
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Built-in preview — read-only. Reuses the same TemplatePreview
          the editor uses so the operator sees exactly what a
          duplicated copy would start from. */}
      <Dialog open={previewingBuiltin} onOpenChange={setPreviewingBuiltin}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Default Template · Preview</DialogTitle>
          </DialogHeader>
          <TemplatePreview config={defaultTemplateConfig()} kind="invoice" />
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
                <Select
                  value={kind}
                  onValueChange={v => {
                    const next = v as TemplateKind;
                    setKind(next);
                    // Kind flip auto-updates the paperSize default so
                    // invoice→receipt lands on 80mm instead of A4
                    // (and the reverse). Manual override still wins.
                    setConfig(c => ({
                      ...c,
                      paperSize: next === 'receipt' ? '80mm' : 'A4',
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Paper size — segmented picker. Only shows options that
                make sense for the chosen kind: A4/A5 for invoices,
                80mm/58mm for receipts. Selecting anything here is
                what actually drives the preview + print layout. */}
            <div className="space-y-1">
              <Label className="text-xs">Paper size</Label>
              <div className="inline-flex items-center gap-1 rounded-md border p-1 bg-white">
                {(kind === 'receipt' ? (['80mm', '58mm'] as const) : (['A4', 'A5'] as const)).map(sz => {
                  const active = (config.paperSize ?? (kind === 'receipt' ? '80mm' : 'A4')) === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      title={PAPER_SIZE_META[sz].hint}
                      onClick={() => setConfig(c => ({ ...c, paperSize: sz }))}
                      className={`px-3 h-8 text-xs rounded transition ${
                        active
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {PAPER_SIZE_META[sz].label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500">
                {PAPER_SIZE_META[(config.paperSize ?? (kind === 'receipt' ? '80mm' : 'A4')) as PaperSize].hint}
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={isDefault} onCheckedChange={setDefault} />
              <span className="text-sm">Default for {kind}</span>
              <span className="text-xs text-gray-500">(promoting demotes the current default)</span>
            </label>

            <div className="border rounded-md p-3 space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Header</div>
              {/* The bilingual print header doesn't use a dark bar,
                  so background/text-colour pickers have been removed
                  as no-ops. Accent still drives table header text +
                  section labels in the preview and print. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Doc title</Label>
                  <Input value={config.header?.title ?? ''} onChange={e => patchHeader({ title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Accent colour</Label>
                  <Input type="color" value={config.header?.accentColor ?? '#2563eb'} onChange={e => patchHeader({ accentColor: e.target.value })} className="h-9 p-1" />
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
                <div className={`grid ${kind === 'receipt' ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                  {/* Logo position — hidden for Receipt because thermal
                      paper is too narrow to sit the logo left / right;
                      the thermal preview always centers regardless of
                      this setting, so we drop the picker on that kind
                      to keep the editor honest. */}
                  {kind !== 'receipt' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Logo position</Label>
                      <div
                        role="radiogroup"
                        aria-label="Logo position"
                        className="inline-flex items-center gap-1 rounded-md border p-1 bg-white"
                      >
                        {([
                          { key: 'left',   Icon: AlignLeft,   label: 'Left'   },
                          { key: 'middle', Icon: AlignCenter, label: 'Middle' },
                          { key: 'right',  Icon: AlignRight,  label: 'Right'  },
                        ] as const).map(({ key, Icon, label }) => {
                          const active = (config.header?.logoPosition ?? 'left') === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              title={label}
                              onClick={() => patchHeader({ logoPosition: key as LogoPosition })}
                              className={`inline-flex items-center justify-center h-8 w-9 rounded transition ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Logo shape — icon-radio row.
                      Circle → 1:1 pill radius, Square → 1:1 small
                      radius, Rectangle → landscape (today's default). */}
                  <div className="space-y-1">
                    <Label className="text-xs">Logo shape</Label>
                    <div
                      role="radiogroup"
                      aria-label="Logo shape"
                      className="inline-flex items-center gap-1 rounded-md border p-1 bg-white"
                    >
                      {([
                        { key: 'circle',    Icon: Circle,               label: 'Circle'    },
                        { key: 'square',    Icon: Square,               label: 'Square'    },
                        { key: 'rectangle', Icon: RectangleHorizontal,  label: 'Rectangle' },
                      ] as const).map(({ key, Icon, label }) => {
                        const active = (config.header?.logoShape ?? 'rectangle') === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            title={label}
                            onClick={() => patchHeader({ logoShape: key as LogoShape })}
                            className={`inline-flex items-center justify-center h-8 w-9 rounded transition ${
                              active
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {/* Logo size — pixel slider (24..120). Circle/Square use
                  this for w+h; Rectangle uses it as HEIGHT and scales
                  width by the natural 90:40 aspect of today's print. */}
              {config.header?.showLogo && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Logo size</Label>
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      {config.header?.logoSize ?? 60}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={24}
                    max={120}
                    step={2}
                    value={config.header?.logoSize ?? 60}
                    onChange={e => patchHeader({ logoSize: Number(e.target.value) })}
                    className="w-full accent-blue-600"
                    aria-label="Logo size in pixels"
                  />
                </div>
              )}
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Line-item columns</div>
              {/* Description merges name + specification onto two
                  lines inside a single column (matches the print).
                  Specification is no longer a standalone toggle.
                  On Receipt kind the toggles are locked ON — a POS
                  thermal receipt without an amount column is not
                  useful, so we don't let the operator strip them. */}
              <div className="grid grid-cols-2 gap-2">
                {(['item', 'uom', 'quantity', 'unitPrice', 'total'] as const).map(col => {
                  const isReceipt = kind === 'receipt';
                  return (
                    <div key={col} className="flex items-center gap-2">
                      <Switch
                        checked={isReceipt ? true : !!config.columns?.[col]}
                        disabled={isReceipt}
                        onCheckedChange={v => patchColumns({ [col]: v })}
                      />
                      <Input
                        value={config.columnLabels?.[col] ?? ''}
                        onChange={e => patchColumnLabels({ [col]: e.target.value })}
                        placeholder={col === 'item' ? 'Description' : col}
                        className="h-8 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500">
                {kind === 'receipt'
                  ? 'Receipt columns are locked on — labels are still editable.'
                  : 'Description shows the item name on line 1 and its specification on line 2. Toggle the switch to include the column; label lets you rename it.'}
              </p>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Footer</div>
              {/* Banking / terms / signatures don't fit on a thermal
                  receipt roll — the strip is too narrow and there's
                  no wet-ink workflow on POS. Toggles stay visible so
                  the operator understands they exist, but they're
                  locked off + disabled on Receipt kind. */}
              {(() => {
                const isReceipt = kind === 'receipt';
                const noThermal = isReceipt ? 'Not available on thermal receipts' : undefined;
                return (
                  <>
                    <SwitchRow
                      label="Show banking / payment info"
                      checked={isReceipt ? false : !!config.footer?.showBanking}
                      onChange={v => patchFooter({ showBanking: v })}
                      disabled={isReceipt}
                      title={noThermal}
                    />
                    <SwitchRow
                      label="Show terms & conditions"
                      checked={isReceipt ? false : !!config.footer?.showTerms}
                      onChange={v => patchFooter({ showTerms: v })}
                      disabled={isReceipt}
                      title={noThermal}
                    />
                    <SwitchRow
                      label="Show thank-you line"
                      checked={!!config.footer?.showThankYou}
                      onChange={v => patchFooter({ showThankYou: v })}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs">Thank-you text</Label>
                      <Input
                        value={config.footer?.thankYouText ?? ''}
                        onChange={e => patchFooter({ thankYouText: e.target.value })}
                        disabled={!config.footer?.showThankYou}
                      />
                    </div>
                    {/* Signature toggles — a POS thermal receipt never
                        has a hand-signature block, so both are forced
                        off + disabled on Receipt kind. On Invoice the
                        undefined default is still "true" so legacy
                        rows keep printing both. */}
                    <div className="pt-2 border-t mt-2 grid grid-cols-2 gap-2">
                      <SwitchRow
                        label="Customer signature"
                        checked={isReceipt ? false : (config.footer?.showCustomerSignature !== false)}
                        onChange={v => patchFooter({ showCustomerSignature: v })}
                        disabled={isReceipt}
                        title={noThermal}
                      />
                      <SwitchRow
                        label="Seller signature"
                        checked={isReceipt ? false : (config.footer?.showSellerSignature !== false)}
                        onChange={v => patchFooter({ showSellerSignature: v })}
                        disabled={isReceipt}
                        title={noThermal}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Right — live preview */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Preview</div>
            <TemplatePreview config={config} kind={kind} />
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

function SwitchRow({ label, checked, onChange, disabled, title }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-xs ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      title={title}
    >
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------ */
/* Live preview — same shape the print path will read           */
/* ------------------------------------------------------------ */

/**
 * Top-level preview dispatcher — inspects the effective paper size
 * and hands off to whichever preview component matches the physical
 * medium:
 *   - A4 / A5      → A4InvoicePreview (bilingual full-page format)
 *   - 58mm / 80mm  → ThermalReceiptPreview (narrow POS strip)
 * Call sites don't need to know which one they're rendering; they
 * just pass config + kind.
 */
function TemplatePreview({ config, kind = 'invoice' }: { config: TemplateConfig; kind?: TemplateKind }) {
  const size = effectivePaperSize(config, kind);
  if (isThermal(size)) return <ThermalReceiptPreview config={config} paperSize={size} />;
  return <A4InvoicePreview config={config} />;
}

function A4InvoicePreview({ config }: { config: TemplateConfig }) {
  const h = config.header  ?? {};
  const c = config.columns ?? {};
  const l = config.columnLabels ?? {};
  const f = config.footer  ?? {};

  /* Sample lines chosen to mirror the real invoice — bilingual
   * Khmer / English cells with USD unit prices, so the operator
   * sees exactly what a printed row will look like. */
  const SAMPLE_LINES = [
    { name: 'Americano',   spec: 'អាមេរីកាណូ',        qty: 1, unit: 1.50 },
    { name: 'Macha Latte', spec: 'ម៉ាឆាឡាតេ',        qty: 1, unit: 1.50 },
    { name: 'Cappuccino',  spec: 'កាហ្វេកាពូជីណូ',  qty: 2, unit: 2.00 },
  ];
  const subtotal = SAMPLE_LINES.reduce((s, x) => s + x.qty * x.unit, 0);
  const accent   = h.accentColor ?? '#2563eb';

  const logoShape = h.logoShape ?? 'rectangle';
  /** Base size scales the logo box. Circle/Square use it for both
   *  dimensions; Rectangle treats it as HEIGHT and derives width
   *  from the 90:40 landscape aspect used by today's print output. */
  const size = Math.min(120, Math.max(24, h.logoSize ?? 60));
  const logoDims =
    logoShape === 'circle'   ? { width: size, height: size, borderRadius: 9999 }
    : logoShape === 'square' ? { width: size, height: size, borderRadius: 4 }
    :                          { width: Math.round(size * 90 / 40), height: size, borderRadius: 4 };

  const th: React.CSSProperties = {
    borderTop: '1px solid #000', borderLeft: '1px solid #000',
    padding: '3px 4px', fontWeight: 600, textAlign: 'center', color: accent,
    fontSize: 10, lineHeight: 1.2,
  };
  const td: React.CSSProperties = {
    borderTop: '1px solid #000', borderLeft: '1px solid #000',
    padding: '3px 4px', fontSize: 10, lineHeight: 1.3,
  };

  const BiLbl = ({ kh, en }: { kh: string; en: string }) => (
    <span style={{ display: 'inline-block', lineHeight: 1.15 }}>
      <span style={{
        display: 'block', fontSize: 10,
        fontFamily: "'Battambang','Noto Sans Khmer',serif",
      }}>{kh}</span>
      <span style={{ display: 'block', fontSize: 9, color: accent }}>{en}</span>
    </span>
  );

  return (
    <div
      className="border rounded-md bg-white overflow-hidden"
      style={{
        padding: '20px 24px', color: '#000', fontSize: 11,
        fontFamily: "'Battambang','Noto Sans Khmer',system-ui,sans-serif",
      }}
    >
      {/* Company header — three fixed slots so:
       *    · left  slot reserves space (no overlap with the centered
       *            company block even at max logo size)
       *    · centre slot always renders the company info
       *    · right slot reserves symmetric space
       *  Logo drops into whichever slot the operator picked. When
       *  logoPosition === 'middle' the logo sits ABOVE the company
       *  block inside the centre slot (that's the only way to keep
       *  the text truly centred on the page). */}
      {(() => {
        const logoPos = h.logoPosition ?? 'left';
        // Reserve the wider of "logo width + gutter" and 60px so
        // small logos don't leave the middle awkwardly narrow, but a
        // 120px circle still gets the room it needs.
        const slot = h.showLogo ? Math.max(60, logoDims.width + 16) : 0;
        const LogoBox = () => (
          <div
            style={{
              ...logoDims,
              background: 'rgba(0,0,0,0.05)', border: '1px dashed #bbb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#666', fontWeight: 700, letterSpacing: 1, fontSize: 9,
            }}
          >
            LOGO
          </div>
        );
        const CompanyBlock = () => !h.showCompanyBlock ? null : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 18, fontWeight: 400, lineHeight: 1.15,
              // v-print-company-title-muol-light — prefer the lighter
              // Khmer OS Muol Light for the company name so the header
              // reads elegant instead of dominant. Google's 'Moul'
              // stays as the web fallback for machines without the
              // system font (still the same script style, just heavier).
              fontFamily: "'Khmer OS Muol Light','Moul','Battambang','Noto Sans Khmer',serif",
            }}>ហាងគំរូ</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Store-Demo</div>
            <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.4 }}>
              #C168 (Tela Office Building 2nd Floor), Russian Federation Blvd, Phnom Penh
            </div>
            <div style={{
              marginTop: 2, fontSize: 10, display: 'inline-flex',
              alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            }}>
              <span>(+855) 23 900 530</span>
              <span>
                <BiLbl kh="លេខអត្តសញ្ញាណកម្ម អតប" en="VAT TIN" />
                <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>L001-105018384</span>
              </span>
            </div>
          </div>
        );
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `${slot}px 1fr ${slot}px`,
            alignItems: 'center',
            gap: 12,
            minHeight: Math.max(50, logoDims.height + 4),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
              {h.showLogo && logoPos === 'left' && <LogoBox />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {h.showLogo && logoPos === 'middle' && <LogoBox />}
              <CompanyBlock />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {h.showLogo && logoPos === 'right' && <LogoBox />}
            </div>
          </div>
        );
      })()}

      {/* Bilingual title with side rules — same as the print. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 18, fontWeight: 400,
            fontFamily: "'Moul','Battambang','Noto Sans Khmer',serif",
          }}>វិក្កយបត្រ</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{(h.title || 'INVOICE').toUpperCase()}</div>
        </div>
        <div style={{ flex: 1, borderTop: '1px solid #000' }} />
      </div>

      {/* Bilingual customer / invoice meta grid. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24, rowGap: 4, fontSize: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ minWidth: 120 }}><BiLbl kh="ឈ្មោះក្រុមហ៊ុន ឬ អតិថិជន" en="Company / Customer" /></div>
          <div style={{ fontWeight: 600 }}>Enterprise Corp.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ minWidth: 100 }}><BiLbl kh="លេខរៀងវិក្កយបត្រ" en="Invoice N°" /></div>
          <div style={{ fontFamily: 'monospace' }}>INV-2026-001</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ minWidth: 120 }}><BiLbl kh="អាសយដ្ឋាន" en="Address" /></div>
          <div>Chamkarmon, Phnom Penh</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ minWidth: 100 }}><BiLbl kh="កាលបរិច្ឆេទ" en="Issue Date" /></div>
          <div>20-07-2026</div>
        </div>
      </div>

      {/* Items table — bilingual headers, honours column toggles /
          labels from the template config. */}
      <table style={{
        width: '100%', borderCollapse: 'collapse', borderSpacing: 0,
        borderBottom: '1px solid #000', borderRight: '1px solid #000',
        fontSize: 10,
      }}>
        <thead>
          <tr>
            <th style={th}><BiLbl kh="ល.រ." en="N°" /></th>
            {c.item      && <th style={{ ...th, textAlign: 'left' }}><BiLbl kh="បរិយាយមុខទំនិញ ឬ សេវាកម្ម" en={l.item ?? 'Description'} /></th>}
            {c.uom       && <th style={th}><BiLbl kh="ឯកតា" en={l.uom ?? 'UOM'} /></th>}
            {c.quantity  && <th style={th}><BiLbl kh="បរិមាណ" en={l.quantity ?? 'Quantity'} /></th>}
            {c.unitPrice && <th style={{ ...th, textAlign: 'right' }}><BiLbl kh="ថ្លៃឯកតា" en={l.unitPrice ?? 'Unit Price'} /></th>}
            {c.total     && <th style={{ ...th, textAlign: 'right' }}><BiLbl kh="ថ្លៃទំនិញ" en={l.total ?? 'Amount'} /></th>}
          </tr>
        </thead>
        <tbody>
          {SAMPLE_LINES.map((row, i) => (
            <tr key={i}>
              <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
              {c.item && (
                <td style={td}>
                  {/* Two-line description: name on line 1, spec on
                      line 2 (smaller + muted). Matches the real
                      invoice print output. */}
                  <div>{row.name}</div>
                  <div style={{ fontSize: 9, color: '#555' }}>{row.spec}</div>
                </td>
              )}
              {c.uom       && <td style={{ ...td, textAlign: 'center' }}>ea</td>}
              {c.quantity  && <td style={{ ...td, textAlign: 'center' }}>{row.qty}</td>}
              {c.unitPrice && <td style={{ ...td, textAlign: 'right' }}>${row.unit.toFixed(2)}</td>}
              {c.total     && <td style={{ ...td, textAlign: 'right' }}>${(row.qty * row.unit).toFixed(2)}</td>}
            </tr>
          ))}
          {(() => {
            const dataCols =
              (c.item ? 1 : 0) + (c.uom ? 1 : 0) +
              (c.quantity ? 1 : 0) + (c.unitPrice ? 1 : 0);
            const totalsSpan = 1 + Math.max(dataCols, 1);
            return (
              <>
                <tr>
                  <td colSpan={totalsSpan} style={{ ...td, textAlign: 'right' }}>សរុប (USD) / Sub Total (USD)</td>
                  {c.total && <td style={{ ...td, textAlign: 'right' }}>${subtotal.toFixed(2)}</td>}
                </tr>
                <tr>
                  <td colSpan={totalsSpan} style={{ ...td, textAlign: 'right', fontWeight: 700 }}>សរុបរួម (USD) / Grand Total (USD)</td>
                  {c.total && <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>${subtotal.toFixed(2)}</td>}
                </tr>
                <tr>
                  <td colSpan={totalsSpan} style={{ ...td, textAlign: 'right', fontWeight: 700 }}>សរុបរួម (KHR) / Grand Total (KHR)</td>
                  {c.total && <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>៛ {(subtotal * 4050).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>}
                </tr>
              </>
            );
          })()}
        </tbody>
      </table>

      {/* Notes + exchange rate — two-column layout so the KHQR
          cards sit top-right ALIGNED with the "Notes" label instead
          of stacking below the Payment method line. */}
      <div style={{
        marginTop: 10, fontSize: 10, lineHeight: 1.5,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>សម្គាល់ / Notes</div>
          <div>អត្រាប្តូរប្រាក់ / Exchange rate : 4050.0000</div>
          {f.showBanking && (
            <div style={{ marginTop: 6, color: '#555' }}>** គណនីសម្រាប់បង់ប្រាក់ / Payment method</div>
          )}
          {f.showThankYou && (
            <div style={{ marginTop: 6, fontWeight: 600 }}>{f.thankYouText ?? 'Thank you for your business!'}</div>
          )}
          {f.showTerms && (
            <div style={{ marginTop: 6, fontStyle: 'italic', color: '#666' }}>Terms &amp; Conditions apply.</div>
          )}
        </div>
        {/* KHQR column — sits at the top of the Notes row, right side.
            Two placeholder cards; real cards come from bank settings
            on the actual print. */}
        {f.showBanking && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
            {[0, 1].map(i => (
              <div
                key={i}
                style={{
                  width: 68, textAlign: 'center', display: 'flex',
                  flexDirection: 'column', alignItems: 'center', gap: 3,
                }}
              >
                <div style={{ fontSize: 8, fontWeight: 600, color: '#1e3a8a' }}>Bank {i + 1}</div>
                <div
                  style={{
                    width: '100%', aspectRatio: '1 / 1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#999', fontSize: 8, border: '1px dashed #ccc', borderRadius: 6,
                  }}
                >
                  KHQR
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#666' }}>0000-0000</div>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#333', textTransform: 'uppercase' }}>Account</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bilingual signature lines — column count collapses when
          one side is hidden so the remaining block stays anchored
          to the full width. */}
      {(() => {
        const showCust = f.showCustomerSignature !== false;
        const showSell = f.showSellerSignature   !== false;
        if (!showCust && !showSell) return null;
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: (showCust && showSell) ? '1fr 1fr' : '1fr',
            gap: 48, marginTop: 70, fontSize: 10, textAlign: 'center',
          }}>
            {showCust && (
              <div style={{ borderTop: '1px solid #000', paddingTop: 6 }}>
                <div>ហត្ថលេខា និងឈ្មោះអ្នកទិញ</div>
                <div style={{ fontSize: 9, color: '#555' }}>Customer&apos;s Signature &amp; Name</div>
              </div>
            )}
            {showSell && (
              <div style={{ borderTop: '1px solid #000', paddingTop: 6 }}>
                <div>ហត្ថលេខា និងឈ្មោះអ្នកលក់</div>
                <div style={{ fontSize: 9, color: '#555' }}>Seller&apos;s Signature &amp; Name</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Thermal-receipt preview — narrow strip layout for POS printers.
 * Mirrors the PDF a customer would tear off a real thermal printer:
 *   · Centered header (title, SHOP NAME, cashier line)
 *   · Meta rows (Customer / Receipt No / Date)
 *   · Two-column line items (Item / Amount) with a small qty×price
 *     sub-line under each
 *   · Totals block (Total Due, Paid, Method)
 *   · PAID stamp + thank-you footer
 * Everything scales with `paperSize` so 58mm ends up narrower than
 * 80mm; no bilingual columns, no signature blocks — those don't
 * belong on a thermal print.
 */
function ThermalReceiptPreview({ config, paperSize }: { config: TemplateConfig; paperSize: PaperSize }) {
  const h = config.header ?? {};
  const c = config.columns ?? {};
  const f = config.footer  ?? {};
  const accent = h.accentColor ?? '#dc2626';

  // Width matches the physical paper (approx px = mm * 3). We render
  // the strip on a light gray canvas so the operator can see the
  // paper edges — thermal receipts are white-on-white against a
  // white dialog, so without a gray backdrop the strip vanishes.
  const paperWidth = PAPER_SIZE_META[paperSize].widthPx;

  const SAMPLE_LINES = [
    { code: 'PR-003', name: 'Macha Latte',        qty: 2, unit: 1.50 },
    { code: 'SNK-01', name: 'Chocolate Croissant', qty: 2, unit: 2.00 },
    { code: 'PR-001', name: 'Cappuccino',         qty: 2, unit: 1.50 },
  ];
  const subtotal = SAMPLE_LINES.reduce((s, x) => s + x.qty * x.unit, 0);
  const khr = Math.round(subtotal * 4100);

  return (
    <div
      className="border rounded-md bg-gray-100 p-4 flex justify-center"
      style={{ fontFamily: "'Battambang','Noto Sans Khmer',system-ui,sans-serif" }}
    >
      <div
        className="bg-white shadow-sm"
        style={{
          width: paperWidth, maxWidth: '100%',
          padding: paperSize === '58mm' ? '10px 8px' : '14px 12px',
          fontSize: paperSize === '58mm' ? 10 : 11,
          color: '#000',
        }}
      >
        {/* Header — logo (if enabled) centered at the very top,
            then title, shop name, cashier. Thermal receipts always
            center the logo regardless of logoPosition: the paper's
            too narrow for left/right slots. logoSize is clamped so
            an 80px+ logo on a 58mm roll doesn't blow the layout. */}
        {h.showLogo && (() => {
          const shape   = h.logoShape ?? 'rectangle';
          const rawSize = Math.min(120, Math.max(24, h.logoSize ?? 40));
          const maxLogo = paperSize === '58mm' ? 60 : 80;
          const size    = Math.min(rawSize, maxLogo);
          const dims =
            shape === 'circle'   ? { width: size, height: size, borderRadius: 9999 }
            : shape === 'square' ? { width: size, height: size, borderRadius: 4 }
            :                      { width: Math.round(size * 90 / 40), height: size, borderRadius: 4 };
          return (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <div
                style={{
                  ...dims,
                  background: 'rgba(0,0,0,0.05)', border: '1px dashed #bbb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#666', fontWeight: 700, letterSpacing: 1, fontSize: 9,
                }}
              >
                LOGO
              </div>
            </div>
          );
        })()}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13 }}>{h.title || 'Receipt'}</div>
          {h.showCompanyBlock !== false && (
            <>
              <div style={{ fontWeight: 700, marginTop: 2 }}>SHOP NAME</div>
              <div style={{ color: '#555', fontSize: 10 }}>Cashier: Chheng Udam</div>
            </>
          )}
        </div>
        <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

        {/* Amount + date banner */}
        <div style={{ color: accent, fontWeight: 700, fontSize: 20 }}>${subtotal.toFixed(2)}</div>
        <div style={{ color: '#555', fontSize: 10 }}>Date 07/20/2026 · 01:54 PM</div>

        {/* Meta lines */}
        <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.55 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer</span><span>—</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Receipt No</span><span>#002</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date</span><span>07/20/2026 · 01:54 PM</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #000', margin: '8px 0 4px' }} />

        {/* Items — Item / Amount two-column, with qty×price under each */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10 }}>
          <span>Item</span><span>Amount</span>
        </div>
        <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }} />
        {SAMPLE_LINES.map((row, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.item !== false ? `${row.code} ${row.name}` : row.name}</span>
              <span>${(row.qty * row.unit).toFixed(2)}</span>
            </div>
            {c.quantity !== false && c.unitPrice !== false && (
              <div style={{ color: '#666', fontSize: 9 }}>{row.qty} × ${row.unit.toFixed(2)}</div>
            )}
          </div>
        ))}

        <div style={{ borderTop: '1px solid #000', margin: '8px 0' }} />

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total Due</span><span>${subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginTop: 3 }}>
          <span>Paid Amount</span><span>${subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginTop: 2 }}>
          <span>Total KHR (@ 4,100)</span><span>៛ {khr.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', marginTop: 2 }}>
          <span>Method</span><span>CASH</span>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: accent, fontWeight: 700 }}>07/20/2026</span>
          <span
            style={{
              color: accent, fontWeight: 700, letterSpacing: 3, fontSize: 12,
              border: `1.5px solid ${accent}`, padding: '2px 8px',
              transform: 'rotate(-6deg)', display: 'inline-block',
            }}
          >
            PAID
          </span>
        </div>

        {f.showThankYou !== false && (
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10 }}>
            <div>{f.thankYouText ?? 'Thank you!'}</div>
            <div style={{ color: '#666', marginTop: 2 }}>#002</div>
          </div>
        )}
      </div>
    </div>
  );
}
