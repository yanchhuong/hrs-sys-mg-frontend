import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ImageDropZone } from '../common/ImageDropZone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Settings as SettingsIcon, Save, 
  AlertTriangle, 
  RefreshCw, KeyRound, Coins, Loader2, Info,
  Handshake, FileText, Building2, Search, Send,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as hrBotApi from '../../api/hrTelegramBots';
import { HrTelegramGroupCard } from '../common/HrTelegramGroupCard';
import { PayWaySettingsDialog } from '../common/PayWaySettingsDialog';
import * as currencyApi from '../../api/currencySettings';
import * as paywayApi from '../../api/payway';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';
import * as settingsApi from '../../api/settings';
import { DATE_FORMAT_PRESETS, useDateFormat } from '../../context/DateFormatContext';
import { USE_MOCKS } from '../../api/client';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { tenantAgencyRequests } from '../../api/tenantAgencyRequests';
import * as TenantAgencyApi from '../../api/tenantAgencyRequests';
import { PageTitleTooltip } from './agency/PageTitleTooltip';

/**
 * Team activity bot — the company Telegram group the HR bot posts to.
 *
 * Thin host for the shared card: it only supplies the tenant's HR bot,
 * which the card needs because the group's link code is redeemed by
 * that bot and the card disables itself until one is registered.
 * `active` drives the card's poll, and a tab that is mounted is a tab
 * being looked at, so it is simply true here.
 */
function TeamBotCard() {
  const [bot, setBot] = useState<hrBotApi.HrTelegramBot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void hrBotApi.getBot()
      .then(b => { if (!cancelled) setBot(b); })
      .catch(() => { /* no bot registered, or no permission — the card says so */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the HR bot…
      </div>
    );
  }
  return <HrTelegramGroupCard bot={bot} active />;
}

export function Settings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.settings.title')}</h1>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="payway">
            <KeyRound className="mr-2 h-4 w-4" />
            PayWay (ABA) Integration
          </TabsTrigger>
          <TabsTrigger value="agency">
            <Handshake className="mr-2 h-4 w-4" />
            Agency
          </TabsTrigger>
          <TabsTrigger value="teambot">
            <Send className="mr-2 h-4 w-4" />
            Team Activity Bot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agency" className="space-y-6">
          <AgencyRequestTab />
        </TabsContent>

        <TabsContent value="company" className="space-y-6">
          <CompanyInformationCard />
          {/* Currency settings, previously a tab of their own. They
              belong with the company profile: same question, and this
              is the copy that actually drives invoices, POS and
              quotations. Admin-only, as the tab was. */}
          {isAdmin && <CurrencySettingsCard />}
          {/* Cloud Connection — hidden temporarily. Re-enable by
              uncommenting the line below when the sync surface is
              ready to ship. */}
          {/* {isAdmin && <CloudConnectionCard />} */}
        </TabsContent>

        <TabsContent value="payway" className="space-y-6">
          {isAdmin && <PayWayIntegrationCard />}
        </TabsContent>

        {/* Admin-only, like Currency and PayWay: it decides what the
            whole company sees in a shared chat. */}
        <TabsContent value="teambot" className="space-y-6">
          {isAdmin && <TeamBotCard />}
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------
interface CompanyInfo {
  name: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  currency?: string;
  /** date-fns pattern that drives every visible date across the app
   *  (V60). Picked from the preset dropdown below. */
  dateFormat?: string;
  /** Day-of-month payroll lands (V71). Drives the 5% Severance
   *  maturity gate so the first installment matches the 3rd salary. */
  payDayOfMonth?: number;
}

const COMPANY_INFO_KEY = 'hrms:companyInfo';
const defaultCompanyInfo: CompanyInfo = {
  name: 'My Company Inc.',
  legalName: '',
  taxId: '',
  address: '',
  phone: '+855-23-000-0000',
  email: 'hr@company.com',
  website: '',
  logoUrl: '',
  currency: 'USD',
  dateFormat: 'MMM dd, yyyy',
  payDayOfMonth: 25,
};

function loadCompanyInfo(): CompanyInfo {
  try {
    const raw = localStorage.getItem(COMPANY_INFO_KEY);
    return raw ? { ...defaultCompanyInfo, ...(JSON.parse(raw) as Partial<CompanyInfo>) } : defaultCompanyInfo;
  } catch {
    return defaultCompanyInfo;
  }
}

function CompanyInformationCard() {
  const [info, setInfo] = useState<CompanyInfo>(
    USE_MOCKS ? loadCompanyInfo() : { name: '', currency: 'USD', dateFormat: 'MMM dd, yyyy', payDayOfMonth: 25 },
  );
  const { refresh: refreshDateFormat } = useDateFormat();
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (USE_MOCKS) return;
    (async () => {
      setLoading(true);
      try {
        const remote = await settingsApi.getCompanyInfo();
        setInfo({
          name: remote.name,
          legalName: remote.legalName ?? '',
          taxId: remote.taxId ?? '',
          address: remote.address ?? '',
          phone: remote.phone ?? '',
          email: remote.email ?? '',
          website: remote.website ?? '',
          logoUrl: remote.logoUrl ?? '',
          currency: remote.currency ?? 'USD',
          dateFormat: remote.dateFormat ?? 'MMM dd, yyyy',
          payDayOfMonth: remote.payDayOfMonth ?? 25,
        });
        setDirty(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load company info');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = (p: Partial<CompanyInfo>) => { setInfo({ ...info, ...p }); setDirty(true); };

  const handleSave = async () => {
    if (!info.name.trim()) { toast.error('Company name is required'); return; }
    if (info.email && !/^\S+@\S+\.\S+$/.test(info.email)) { toast.error('Invalid email'); return; }
    if (USE_MOCKS) {
      localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(info));
      setDirty(false);
      toast.success('Company information saved');
      return;
    }
    try {
      await settingsApi.updateCompanyInfo(info);
      setDirty(false);
      toast.success('Company information saved');
      // Push the new pattern into the app-wide DateFormat provider so
      // every other open view re-renders with the picked format without
      // a hard refresh.
      void refreshDateFormat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save company info');
    }
  };

  const handleDiscard = async () => {
    if (USE_MOCKS) {
      setInfo(loadCompanyInfo());
      setDirty(false);
      return;
    }
    setLoading(true);
    try {
      const remote = await settingsApi.getCompanyInfo();
      setInfo({
        name: remote.name,
        legalName: remote.legalName ?? '',
        taxId: remote.taxId ?? '',
        address: remote.address ?? '',
        phone: remote.phone ?? '',
        email: remote.email ?? '',
        website: remote.website ?? '',
        logoUrl: remote.logoUrl ?? '',
        currency: remote.currency ?? 'USD',
        dateFormat: remote.dateFormat ?? 'MMM dd, yyyy',
        payDayOfMonth: remote.payDayOfMonth ?? 25,
      });
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reload company info');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {loading && (
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Loading company info…
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Logo first — matches the printed order (logo at the top of
              invoices / quotations / POS receipts), and gives the
              operator a visual anchor for the identity block that
              follows. */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ci-logo">Company logo</Label>
            {/* Drag-drop / click-to-browse. Stores the image as a
                base64 data URL directly in the settings row — same
                convention as the POS receipt logo (V138). Downstream
                surfaces (invoice / quotation / POS receipt) already
                render `company.logoUrl` as a plain <img src>, so a
                data URL works everywhere without a follow-up upload
                round-trip. */}
            <ImageDropZone
              value={info.logoUrl}
              onChange={(v) => patch({ logoUrl: v ?? '' })}
              hint="PNG / JPG / SVG · prints at the top of invoices, quotations, and POS receipts"
              height={120}
              disabled={loading}
            />
            {/* Fallback text input for operators who prefer pasting
                a CDN link instead of uploading. Blanks itself out
                when the field holds a data URL. */}
            <Input
              id="ci-logo"
              type="url"
              value={info.logoUrl?.startsWith('data:') ? '' : (info.logoUrl ?? '')}
              onChange={(e) => patch({ logoUrl: e.target.value })}
              placeholder="…or paste a public URL like https://cdn.example.com/logo.png"
              disabled={loading}
              className="text-sm"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ci-name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ci-name"
              value={info.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="My Company Inc."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-legal">Legal Name</Label>
            <Input
              id="ci-legal"
              value={info.legalName ?? ''}
              onChange={(e) => patch({ legalName: e.target.value })}
              placeholder="Registered legal entity"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-phone">Phone</Label>
            <Input
              id="ci-phone"
              value={info.phone ?? ''}
              onChange={(e) => patch({ phone: e.target.value })}
              placeholder="+855-23-000-0000"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-email">Email</Label>
            <Input
              id="ci-email"
              type="email"
              value={info.email ?? ''}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="hr@company.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-tax">Tax ID</Label>
            <Input
              id="ci-tax"
              value={info.taxId ?? ''}
              onChange={(e) => patch({ taxId: e.target.value })}
              placeholder="Taxpayer Identification Number"
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Printed on tax reports (TOS, annual summary).</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-website">Website</Label>
            <Input
              id="ci-website"
              type="url"
              value={info.website ?? ''}
              onChange={(e) => patch({ website: e.target.value })}
              placeholder="https://example.com"
              disabled={loading}
            />
          </div>

          {/* Currency was a free-text field here. It is CompanyInfo's
              own column, which nothing reads for behaviour, and it sat
              a tab away from the real setting; the two could disagree
              and the disagreement meant nothing. The Currency Settings
              card below the company card owns this now. The stored
              value still goes up with every save: info carries it and
              the server requires the field. */}

          <div className="space-y-2">
            <Label htmlFor="ci-date-format" className="inline-flex items-center gap-1.5">
              Date Format
              {/* Help copy moved into a tooltip so the field stays a
                  compact single row. */}
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                    Applies to every visible date across Attendance, Overtime, Leave, Payroll, Reports, etc. Date inputs and exports keep ISO (yyyy-MM-dd).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select
              value={info.dateFormat ?? 'MMM dd, yyyy'}
              onValueChange={(v) => patch({ dateFormat: v })}
              disabled={loading}
            >
              <SelectTrigger id="ci-date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_PRESETS.map(p => (
                  <SelectItem key={p.pattern} value={p.pattern}>
                    <span className="font-medium">{p.label}</span>
                    <span className="ml-2 text-xs text-gray-500 tabular-nums">{p.pattern}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* V71 — Pay Day of Month drives the 5% Severance maturity gate.
              MatureDate = 3rd Pay Day at-or-after the FDC contract's
              startDate so severance ships with the 3rd salary cycle. */}
          <div className="space-y-2">
            <Label htmlFor="ci-pay-day" className="inline-flex items-center gap-1.5">
              Pay Day (day of month)
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                    Day-of-month payroll is paid (1–31). Drives the 5% Severance maturity gate — the 1st installment matures with the <strong>3rd Pay Day</strong> at-or-after the FDC contract's start date.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="ci-pay-day"
              type="number"
              min={1}
              max={31}
              value={info.payDayOfMonth ?? 25}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) patch({ payDayOfMonth: Math.max(1, Math.min(31, n)) });
              }}
              disabled={loading}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ci-address">Address</Label>
            <Textarea
              id="ci-address"
              value={info.address ?? ''}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder={'Street, District, City, Country\nMulti-line supported — Enter breaks a line.'}
              disabled={loading}
              rows={3}
              className="min-h-[80px] resize-y"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {dirty && <span className="text-xs text-amber-700 mr-auto">Unsaved changes</span>}
          <Button variant="outline" onClick={handleDiscard} disabled={!dirty || loading}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!dirty || loading}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}




/* ====================================================================
 *  Currency settings card (V166). Drives the currency dropdown on
 *  every Invoice / POS / Quotation / Voucher form. Shows a status
 *  chip reflecting the active pair so the admin can confirm the
 *  setup at a glance without opening the dialog.
 * =================================================================== */

function CurrencySettingsCard() {
  const [data, setData] = useState<currencyApi.CurrencySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [primary, setPrimary] = useState<currencyApi.AllowedCurrency>('USD');
  /** Empty string in the picker = "None" (single-currency tenant). */
  const [secondary, setSecondary] = useState<'' | currencyApi.AllowedCurrency>('KHR');
  const [rate, setRate] = useState<string>('4100');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    currencyApi.get()
      .then(s => {
        if (cancelled) return;
        setData(s);
        setPrimary(s.primaryCurrency);
        setSecondary(s.secondaryCurrency ?? '');
        setRate(s.secondaryRate != null ? String(s.secondaryRate) : '');
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load currency settings'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Auto-clear secondary if it collides with the new primary so the
  // UI never visually shows USD/USD before the server rejects it.
  useEffect(() => {
    if (secondary && secondary === primary) {
      setSecondary('');
      setRate('');
    }
  }, [primary, secondary]);

  const pair = data
    ? data.secondaryCurrency
      ? `${data.primaryCurrency} + ${data.secondaryCurrency}`
      : `${data.primaryCurrency} only`
    : 'USD + KHR';

  const secondaryOptions = currencyApi.ALLOWED_CURRENCIES.filter(c => c !== primary);

  const submit = async () => {
    if (saving) return;
    const sec = secondary === '' ? null : secondary;
    const parsedRate = rate.trim() === '' ? null : Number(rate);
    if (sec && (parsedRate === null || !Number.isFinite(parsedRate) || parsedRate <= 0)) {
      toast.error('Enter a positive conversion rate, or remove the secondary currency.');
      return;
    }
    setSaving(true);
    try {
      const next = await currencyApi.save({
        primaryCurrency: primary,
        secondaryCurrency: sec,
        secondaryRate: sec ? parsedRate : null,
      });
      setData(next);
      toast.success('Currency settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save currency settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-600" />
              Currency
            </CardTitle>
            <CardDescription className="mt-1">
              Pick the currencies this tenant transacts in. Drives every Invoice / POS / Quotation /
              Voucher form and totals on receipts. It is Max two currencies.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
            {pair}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Primary currency</Label>
                <Select value={primary} onValueChange={v => setPrimary(v as currencyApi.AllowedCurrency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyApi.ALLOWED_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Secondary (optional)</Label>
                <Select
                  value={secondary === '' ? '__none' : secondary}
                  onValueChange={v => {
                    const next = v === '__none' ? '' : v as currencyApi.AllowedCurrency;
                    setSecondary(next);
                    // Picking "None" makes the rate meaningless — clear
                    // it inline so the guard on Save can't misfire
                    // against a stale value.
                    if (!next) setRate('');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None — single currency</SelectItem>
                    {secondaryOptions.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {secondary && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">
                  Conversion rate ({primary} → {secondary})
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  placeholder={primary === 'USD' && secondary === 'KHR' ? '4100' : 'e.g. 1300'}
                  disabled={saving}
                />
                <p className="text-[11px] text-gray-500">
                  1 {primary} = <span className="tabular-nums font-medium">{rate || '—'}</span> {secondary}.
                  Used for the second total line on POS receipts and the Grand Total ({secondary}) row on invoices.
                </p>
              </div>
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
              Changing the pair affects new documents only — existing Invoice / POS / Quotation /
              Voucher rows keep the currency and exchange rate they were saved with.
            </div>

            <div className="flex justify-end">
              <Button onClick={submit} disabled={saving || loading}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ====================================================================
 *  PayWay (ABA) integration card (V144). Single Configure button
 *  opens the per-tenant credentials dialog; a small status chip
 *  reflects whether the integration is enabled + which environment.
 * =================================================================== */

function PayWayIntegrationCard() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<paywayApi.PayWayCredentials | null>(null);

  // Load on mount so the status chip reflects reality without
  // opening the dialog first.
  useEffect(() => {
    let cancelled = false;
    paywayApi.getCredentials()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { /* non-fatal: card renders the "not configured" state */ });
    return () => { cancelled = true; };
  }, []);

  const chip = !data?.configured
    ? { label: 'Not configured', cls: 'border-gray-300 text-gray-600 bg-gray-50' }
    : !data.enabled
    ? { label: 'Disabled',       cls: 'border-amber-300 text-amber-700 bg-amber-50' }
    : data.environment === 'live'
    ? { label: 'Live',           cls: 'border-emerald-300 text-emerald-700 bg-emerald-50' }
    :                            { label: 'Sandbox',        cls: 'border-blue-300 text-blue-700 bg-blue-50' };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              PayWay (ABA) Integration
            </CardTitle>
            <CardDescription className="mt-1">
              Real-time card / KHQR payments via PayWay. Once enabled, POS checkout
              + Invoice "Pay" surface a PayWay option that takes the customer through
              ABA's hosted checkout (or shows a KHQR on the customer display).
            </CardDescription>
          </div>
          <Badge variant="outline" className={chip.cls}>{chip.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-gray-500 space-y-0.5">
            {data?.configured ? (
              <>
                <div>Merchant: <span className="tabular-nums text-gray-700">{data.merchantId}</span></div>
                {data.apiKeyPreview && (
                  <div>API key: <span className="tabular-nums text-gray-700">{data.apiKeyPreview}</span></div>
                )}
              </>
            ) : (
              <div>No credentials saved. Click Configure to add your sandbox keys.</div>
            )}
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            {data?.configured ? 'Configure' : 'Set up'}
          </Button>
        </div>
      </CardContent>
      <PayWaySettingsDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={setData}
      />
    </Card>
  );
}

/* ================================================================
 * v-tenant-request-agency — Settings ▸ Agency tab.
 * ================================================================ */

function AgencyRequestTab() {
  const [directory, setDirectory] = useState<TenantAgencyApi.AgencyDirectoryItem[]>([]);
  const [myRequests, setMyRequests] = useState<TenantAgencyApi.MyRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<TenantAgencyApi.AgencyDirectoryItem | null>(null);
  const [disconnecting, setDisconnecting] = useState<TenantAgencyApi.MyRequestDto | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([
        tenantAgencyRequests.directory(),
        tenantAgencyRequests.my(),
      ]);
      setDirectory(d);
      setMyRequests(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load agencies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = directory.filter(a => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.name.toLowerCase().includes(q)
        || a.slug.toLowerCase().includes(q)
        || (a.contactEmail ?? '').toLowerCase().includes(q);
  });

  // Newest engagement row per agency — the BE returns myRequests
  // sorted DESC by createdAt, so the FIRST match per agencyId is
  // the current status. Used to tag each directory row with its
  // actual state (Active / Pending / Declined / Disengaged)
  // instead of a generic "Requested / engaged" pill.
  const latestByAgency = new Map<string, TenantAgencyApi.MyRequestDto>();
  for (const r of myRequests) {
    if (!latestByAgency.has(r.agencyId)) latestByAgency.set(r.agencyId, r);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b pb-4 space-y-3">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-blue-600" />
            Request an accounting / tax agency
            <PageTitleTooltip label="About agency requests">
              Browse registered agencies below, read their <b>Terms &amp;
              Agreement</b>, then send a request. Once the agency accepts,
              they can begin reading your books (Invoices / Bills /
              Expenses) and preparing your tax filings.
            </PageTitleTooltip>
          </CardTitle>
          <div className="flex items-center gap-2 sm:justify-end sm:flex-wrap overflow-x-auto sm:overflow-visible">
            <div className="relative flex-1 sm:flex-initial min-w-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agencies…"
                className="pl-8 h-9 w-full sm:w-64 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && directory.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading agencies…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-6">
              {directory.length === 0
                ? 'No agencies are registered on the platform yet.'
                : 'No agencies match this filter.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(a => (
                <li key={a.id} className="px-6 py-3 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{a.name}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {[a.contactEmail, a.contactPhone, a.country].filter(Boolean).join(' · ')
                        || a.slug}
                    </div>
                    {a.termsAndConditions ? (
                      <div className="mt-1 text-[11px] text-emerald-700 inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Terms &amp; Agreement published
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-amber-700 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        No Terms &amp; Agreement published — request will only carry the platform default.
                      </div>
                    )}
                  </div>
                  {(() => {
                    const my = latestByAgency.get(a.id);
                    // Live engagement (pending/active) OR a prior
                    // declined/disengaged history — surface the
                    // status pill; no Request button.
                    if (my) {
                      return (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <RequestStatusBadge status={my.status} />
                          <span className="text-[10px] text-gray-500">
                            Sent {new Date(my.createdAt).toLocaleDateString()}
                            {my.initiatedBy !== 'tenant' && (
                              <> · by {my.initiatedBy === 'super_admin' ? 'Super Admin' : 'Agency'}</>
                            )}
                          </span>
                          {my.status === 'declined' && my.declineReason && (
                            <span className="text-[10px] text-rose-600 max-w-[220px] text-right">
                              {my.declineReason}
                            </span>
                          )}
                          {my.status === 'active' && (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-[11px] px-2 border-rose-200 text-rose-700 hover:bg-rose-50"
                              onClick={() => setDisconnecting(my)}
                            >
                              Request disconnect
                            </Button>
                          )}
                          {my.status === 'disconnect_pending' && (
                            <span className="text-[10px] text-amber-700 max-w-[220px] text-right">
                              Awaiting agency to accept disconnect. Their workspace is read-only until then.
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <Button size="sm" className="shrink-0" onClick={() => setPicked(a)}>
                        Read terms &amp; Request
                      </Button>
                    );
                  })()}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RequestAgencyDialog
        agency={picked}
        onClose={() => setPicked(null)}
        onSubmitted={() => { setPicked(null); void load(); }}
      />

      <DisconnectAgencyDialog
        request={disconnecting}
        onClose={() => setDisconnecting(null)}
        onSubmitted={() => { setDisconnecting(null); void load(); }}
      />
    </div>
  );
}

/**
 * v-tenant-request-disconnect — confirm-and-reason dialog. On
 * submit the engagement flips to disconnect_pending. Until the
 * agency Partner accepts, the tenant retains full write access
 * on their OWN data plane; only the agency's write endpoints
 * against this Company are frozen.
 */
function DisconnectAgencyDialog({
  request, onClose, onSubmitted,
}: {
  request: TenantAgencyApi.MyRequestDto | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const open = !!request;

  useEffect(() => { if (request) setReason(''); }, [request]);

  const submit = async () => {
    if (!request) return;
    setSaving(true);
    try {
      await tenantAgencyRequests.requestDisconnect(request.id, reason.trim() || undefined);
      toast.success('Disconnect requested — the agency will accept from their Clients page.');
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit disconnect');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Request disconnect — {request?.agencyName}
          </DialogTitle>
          <DialogDescription>
            You are asking the agency to end this engagement. Once submitted,
            the agency's workspace for your Company becomes <b>read-only</b>
            (view only — no new cases, tasks, tax declarations, or comments)
            until a Partner accepts the disconnect. After they accept, the
            agency can no longer read your data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Closing the business, switching agencies, contract expiry…"
            className="text-sm"
            maxLength={2000}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={submit} disabled={saving}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Request disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestStatusBadge({ status }: { status: TenantAgencyApi.EngagementStatus }) {
  const cls: Record<TenantAgencyApi.EngagementStatus, string> = {
    pending:             'border-amber-200 bg-amber-50 text-amber-700',
    active:              'border-emerald-200 bg-emerald-50 text-emerald-700',
    declined:            'border-rose-200 bg-rose-50 text-rose-700',
    disengaged:          'border-slate-200 bg-slate-50 text-slate-600',
    disconnect_pending:  'border-amber-300 bg-amber-100 text-amber-800',
  };
  const label: Record<TenantAgencyApi.EngagementStatus, string> = {
    pending: 'Pending', active: 'Active', declined: 'Declined',
    disengaged: 'Disengaged',
    disconnect_pending: 'Disconnect pending',
  };
  return (
    <Badge variant="outline" className={`text-[10px] shrink-0 ${cls[status]}`}>
      {label[status]}
    </Badge>
  );
}

function RequestAgencyDialog({
  agency, onClose, onSubmitted,
}: {
  agency: TenantAgencyApi.AgencyDirectoryItem | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const open = !!agency;

  useEffect(() => {
    if (!agency) return;
    setAgreed(false);
    setNote('');
    // If the agency has no T&C published we can't require a scroll,
    // so treat that case as "bottom reached" up front.
    setScrolledToBottom(!agency.termsAndConditions);
  }, [agency]);

  const submit = async () => {
    if (!agency) return;
    setSaving(true);
    try {
      await tenantAgencyRequests.request({
        agencyId: agency.id,
        acceptedTerms: true,
        note: note.trim() || undefined,
      });
      toast.success('Request sent — the agency will decide from their Clients page.');
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-blue-600" />
            Terms &amp; Agreement — {agency?.name}
          </DialogTitle>
          <DialogDescription>
            Read the full agreement before submitting. Once accepted, the
            agency will be able to see your Invoices, Bills, and Expenses
            once they approve your request.
          </DialogDescription>
        </DialogHeader>

        <div
          className="max-h-72 overflow-y-auto border rounded-md p-3 text-xs leading-relaxed whitespace-pre-wrap bg-gray-50"
          onScroll={e => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
              setScrolledToBottom(true);
            }
          }}
        >
          {agency?.termsAndConditions ?? (
            <span className="italic text-gray-500">
              This agency has not published a Terms &amp; Agreement yet.
              Your request will proceed under the platform's standard
              engagement terms; the agency may attach their own terms
              before accepting.
            </span>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <Label className="text-xs">Optional note to the agency</Label>
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything you want them to know upfront?"
            className="text-sm"
            maxLength={2000}
            rows={3}
          />
          <label className="flex items-center gap-2 text-xs mt-1 cursor-pointer">
            <Checkbox
              checked={agreed}
              onCheckedChange={v => setAgreed(!!v)}
              disabled={!scrolledToBottom}
            />
            <span>
              I have read and agree to the <b>Terms &amp; Agreement</b> above.
              {!scrolledToBottom && agency?.termsAndConditions && (
                <span className="text-gray-500 ml-1">(scroll to the end to enable)</span>
              )}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !agreed}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

