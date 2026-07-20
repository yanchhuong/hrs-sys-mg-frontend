import { apiJson, apiVoid } from './client';

/* ================================================================
 * v-invoice-template-mvp — per-tenant invoice / receipt templates.
 * Config is opaque to the BE; the FE owns the shape below.
 * ================================================================ */

export type TemplateKind = 'invoice' | 'receipt';

/** Config shape the editor writes + the print path reads. Kept
 *  additive on purpose — a new field with a sensible default lets
 *  older rows keep working without a migration.  */
export type LogoPosition = 'left' | 'middle' | 'right';
export type LogoShape    = 'circle' | 'square' | 'rectangle';

export interface TemplateConfig {
  header?: {
    /** Print the tenant logo (company_info.logo_url) at the top. */
    showLogo?: boolean;
    /** Horizontal placement of the logo inside the header bar.
     *  Doc title + company block move around it. Default: left. */
    logoPosition?: LogoPosition;
    /** Frame shape for the logo:
     *   - circle    → 1:1 aspect, full-round border-radius
     *   - square    → 1:1 aspect, small border-radius
     *   - rectangle → landscape (wider than tall), small radius
     *  Default: rectangle (matches the current print behaviour). */
    logoShape?: LogoShape;
    /** Print company name / address / tax id block. */
    showCompanyBlock?: boolean;
    /** Overrides for the printed doc title (default: 'Invoice'). */
    title?: string;
    /** Optional accent colour (hex) for header bar / dividers. */
    accentColor?: string;
    /** Header strip background — dark theme when set. */
    headerBackgroundColor?: string;
    /** Text colour when a dark background is used. */
    headerTextColor?: string;
  };
  columns?: {
    item?: boolean;
    specification?: boolean;
    uom?: boolean;
    quantity?: boolean;
    unitPrice?: boolean;
    total?: boolean;
  };
  columnLabels?: {
    item?: string;
    specification?: string;
    uom?: string;
    quantity?: string;
    unitPrice?: string;
    total?: string;
  };
  footer?: {
    /** Payment / bank account block. */
    showBanking?: boolean;
    /** T&C block from the doc. */
    showTerms?: boolean;
    /** "Thank you for your business" line. */
    showThankYou?: boolean;
    thankYouText?: string;
  };
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  isDefault: boolean;
  config: TemplateConfig;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInvoiceTemplate {
  name: string;
  kind: TemplateKind;
  isDefault?: boolean;
  config?: TemplateConfig;
}

/** Sensible starting config so a fresh template renders like the
 *  current hard-coded default. */
export function defaultTemplateConfig(): TemplateConfig {
  return {
    header: {
      showLogo: true,
      logoPosition: 'left',
      logoShape: 'rectangle',
      showCompanyBlock: true,
      title: 'Invoice',
      accentColor: '#2563eb',
      headerBackgroundColor: '#0f172a',
      headerTextColor: '#ffffff',
    },
    columns: {
      item: true,
      specification: true,
      uom: true,
      quantity: true,
      unitPrice: true,
      total: true,
    },
    columnLabels: {
      item: 'Item',
      specification: 'Specification',
      uom: 'UOM',
      quantity: 'Qty',
      unitPrice: 'Unit Price',
      total: 'Total',
    },
    footer: {
      showBanking: true,
      showTerms: true,
      showThankYou: true,
      thankYouText: 'Thank you for your business!',
    },
  };
}

export const invoiceTemplates = {
  list: (kind?: TemplateKind) =>
    apiJson<InvoiceTemplate[]>('/api/v1/invoice-templates', {
      query: kind ? { kind } : {},
    }),
  get: (id: string) => apiJson<InvoiceTemplate>(`/api/v1/invoice-templates/${id}`),
  /** Active default per kind — 404 when the tenant hasn't set one. */
  getDefault: (kind: TemplateKind) =>
    apiJson<InvoiceTemplate>('/api/v1/invoice-templates/default', { query: { kind } }),
  create: (req: UpsertInvoiceTemplate) =>
    apiJson<InvoiceTemplate>('/api/v1/invoice-templates', { method: 'POST', json: req }),
  update: (id: string, req: UpsertInvoiceTemplate) =>
    apiJson<InvoiceTemplate>(`/api/v1/invoice-templates/${id}`, { method: 'PATCH', json: req }),
  remove: (id: string) =>
    apiVoid(`/api/v1/invoice-templates/${id}`, { method: 'DELETE' }),
};
