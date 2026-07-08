import { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  ArrowLeft, ArrowRight, Check, FileText, Send, Sparkles, Loader2,
  UserRound, LayoutGrid, Target, Info,
  // Icons for the Select Apps tile grid — one per module, matched to
  // what {@code config/nav.ts} uses on the in-app sidebar so a customer
  // sees the same iconography from the survey to the running product.
  Users, Clock, TimerIcon, AlertCircle, Megaphone,
  DollarSign, Calculator, TrendingUp, Minus,
  UserCheck, ReceiptText, ShoppingCart,
  FileMinus,
  Package, History, ClipboardEdit,
  ArrowLeftRight, Banknote,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import {
  submitPublicSurvey, SubmitSurveyRequest, SurveyPriority,
} from '../../api/platformSurveys';

/**
 * Public landing-page form used by prospects to submit a project
 * inquiry. Hits {@code POST /api/v1/public/surveys} — no auth, no
 * layout chrome (App.tsx routes to this page BEFORE the auth check).
 *
 * <p>Split into a 3-step wizard: <strong>Contact → Select Apps →
 * Purpose</strong>. State lives at the wizard root so a user can
 * step Back / Next without losing any typed input; only the actively
 * displayed slide changes. Submit fires only on the last step.</p>
 */
interface Props {
  onBack?: () => void;
}

/**
 * App catalog rendered on the "Select Apps" step. Mirrors the module
 * groups from {@code config/nav.ts} so a prospect picks from the
 * exact set of modules the Super Admin can toggle on for their
 * tenant post-signup. Each entry carries:
 *   - {@code code}  — permission-module key ({@code role_permissions.module})
 *   - {@code label} — customer-facing name
 *   - {@code icon}  — Lucide icon shared with the in-app sidebar
 *
 * The section grouping matches the sidebar's collapsible parents so
 * the visual mental model of "HR / Sales / Purchase / Stock / Cash
 * Flow / Reports" is consistent from the marketing page onwards.
 */
/** Per-app pastel palette matching the in-app AppLauncher (see
 *  {@code utils/appColors.ts}) so the survey tiles read as the SAME
 *  apps a customer sees in the running product. Class strings are
 *  literal so Tailwind's JIT purge keeps every utility. */
type AppTone = { bg: string; text: string; ring: string };
const T_BLUE:    AppTone = { bg: 'bg-blue-100',    text: 'text-blue-700',    ring: 'ring-blue-300'    };
const T_SKY:     AppTone = { bg: 'bg-sky-100',     text: 'text-sky-700',     ring: 'ring-sky-300'     };
const T_CYAN:    AppTone = { bg: 'bg-cyan-100',    text: 'text-cyan-700',    ring: 'ring-cyan-300'    };
const T_INDIGO:  AppTone = { bg: 'bg-indigo-100',  text: 'text-indigo-700',  ring: 'ring-indigo-300'  };
const T_VIOLET:  AppTone = { bg: 'bg-violet-100',  text: 'text-violet-700',  ring: 'ring-violet-300'  };
const T_PURPLE:  AppTone = { bg: 'bg-purple-100',  text: 'text-purple-700',  ring: 'ring-purple-300'  };
const T_TEAL:    AppTone = { bg: 'bg-teal-100',    text: 'text-teal-700',    ring: 'ring-teal-300'    };
const T_EMERALD: AppTone = { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-300' };
const T_AMBER:   AppTone = { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-300'   };
const T_ORANGE:  AppTone = { bg: 'bg-orange-100',  text: 'text-orange-700',  ring: 'ring-orange-300'  };
const T_ROSE:    AppTone = { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-300'    };
const T_PINK:    AppTone = { bg: 'bg-pink-100',    text: 'text-pink-700',    ring: 'ring-pink-300'    };
const T_SLATE:   AppTone = { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-300'   };

const APP_GROUPS: {
  section: string;
  hint?: string;
  apps: { code: string; label: string; icon: LucideIcon; tone: AppTone }[];
}[] = [
  {
    section: 'HR Administration',
    hint: 'Everything on the People side — employee master data, attendance capture, overtime, leave requests, exceptions, and internal announcements. Cambodia labour-law rules (NSSF, TOS deductions, seniority accruals) apply automatically once Payroll is enabled.',
    apps: [
      { code: 'employees',     label: 'Employees',      icon: Users,       tone: T_SKY     },
      { code: 'attendance',    label: 'Attendance',     icon: Clock,       tone: T_CYAN    },
      { code: 'overtime',      label: 'Overtime',       icon: TimerIcon,   tone: T_AMBER   },
      { code: 'all-leave',     label: 'Leave',          icon: AlertCircle, tone: T_EMERALD },
      { code: 'exception',     label: 'Exceptions',     icon: AlertCircle, tone: T_ROSE    },
      { code: 'announcements', label: 'Announcements',  icon: Megaphone,   tone: T_ORANGE  },
    ],
  },
  {
    section: 'Payroll Management',
    hint: 'Salary runs, tax, NSSF, seniority indemnity.',
    apps: [
      { code: 'payroll',            label: 'Payroll',           icon: DollarSign, tone: T_INDIGO },
      { code: 'benefit-calculator', label: 'Benefit Calculator',icon: Calculator, tone: T_VIOLET },
      { code: 'increase',           label: 'Salary Increase',   icon: TrendingUp, tone: T_TEAL   },
      { code: 'deduction',          label: 'Deductions',        icon: Minus,      tone: T_PINK   },
    ],
  },
  {
    section: 'Sale',
    hint: 'Customer-facing revenue side — POS through invoicing.',
    apps: [
      { code: 'customer',   label: 'Customers',   icon: UserCheck,    tone: T_BLUE    },
      { code: 'quotation',  label: 'Quotations',  icon: FileText,     tone: T_EMERALD },
      { code: 'invoice',    label: 'Invoices',    icon: ReceiptText,  tone: T_EMERALD },
      { code: 'pos',        label: 'POS',         icon: ShoppingCart, tone: T_TEAL    },
      { code: 'voucher',    label: 'Vouchers',    icon: FileText,     tone: T_SLATE   },
    ],
  },
  {
    section: 'Purchase',
    hint: 'Supplier bills + WHT expenses.',
    apps: [
      { code: 'vendor',   label: 'Vendors',  icon: UserCheck, tone: T_PURPLE },
      { code: 'bill',     label: 'Bills',    icon: FileMinus, tone: T_ORANGE },
      { code: 'receipt',  label: 'Expenses', icon: FileText,  tone: T_TEAL   },
    ],
  },
  {
    section: 'Stock / Inventory',
    hint: 'Catalog, movements, and adjustments across warehouses.',
    apps: [
      { code: 'stock',      label: 'Items',             icon: Package,       tone: T_INDIGO },
      { code: 'movement',   label: 'Stock Movements',   icon: History,       tone: T_BLUE   },
      { code: 'adjustment', label: 'Stock Adjustments', icon: ClipboardEdit, tone: T_AMBER  },
    ],
  },
  {
    section: 'Cash Flow',
    hint: 'One ledger of every cash in / out event.',
    apps: [
      { code: 'transaction',  label: 'Transactions', icon: ArrowLeftRight, tone: T_TEAL  },
      { code: 'cashadvance',  label: 'Cash Advances', icon: Banknote,      tone: T_AMBER },
    ],
  },
  {
    section: 'Reports & Insights',
    hint: 'Cross-module reporting; each can be gated on its own role.',
    apps: [
      { code: 'attendance-report', label: 'Attendance Report', icon: Clock,      tone: T_CYAN    },
      { code: 'payroll-report',    label: 'Payroll Report',    icon: DollarSign, tone: T_INDIGO  },
      { code: 'compliance',        label: 'Compliance Report', icon: FileText,   tone: T_ROSE    },
      { code: 'profit-loss',       label: 'Profit & Loss',     icon: BarChart3,  tone: T_VIOLET  },
    ],
  },
];

const BUDGET_BANDS: string[] = [
  '$1k - $5k',
  '$5k - $15k',
  '$15k - $50k',
  '$50k+',
];

const PRIORITIES: { key: SurveyPriority; label: string }[] = [
  { key: 'low',    label: 'Low — exploring, no rush' },
  { key: 'normal', label: 'Normal — pilot in the next quarter' },
  { key: 'high',   label: 'High — need it soon' },
  { key: 'urgent', label: 'Urgent — replacing something broken' },
];

/** Ordered wizard steps — the array's index doubles as the step
 *  number so we can drive the progress bar + Back/Next label logic
 *  from a single source of truth. */
const STEPS = [
  { key: 'contact', label: 'Contact',     icon: UserRound  },
  { key: 'apps',    label: 'Select Apps', icon: LayoutGrid },
  { key: 'purpose', label: 'Purpose',     icon: Target     },
] as const;
type StepKey = typeof STEPS[number]['key'];

export function RequirementSurveyForm({ onBack }: Props) {
  const [step, setStep] = useState<number>(0); // index into STEPS

  // Form state lives at the wizard root so Back / Next don't nuke
  // any typed input on the "hidden" slides.
  const [companyName, setCompanyName]       = useState('');
  const [contactPerson, setContactPerson]   = useState('');
  const [email, setEmail]                   = useState('');
  const [phone, setPhone]                   = useState('');
  const [industry, setIndustry]             = useState('');
  const [companySize, setCompanySize]       = useState('');
  const [country, setCountry]               = useState('');
  const [projectType, setProjectType]       = useState('');
  const [selectedApps, setSelectedApps]     = useState<Set<string>>(new Set());
  const [priority, setPriority]             = useState<SurveyPriority>('normal');
  const [budgetRange, setBudgetRange]       = useState('');
  const [expectedImplDate, setExpectedDate] = useState('');
  const [currentSystem, setCurrentSystem]   = useState('');
  const [businessRequirement, setBizReq]    = useState('');
  const [additionalNotes, setNotes]         = useState('');

  const [submitting, setSubmitting]         = useState(false);
  const [submittedNo, setSubmittedNo]       = useState<string | null>(null);

  const toggleApp = (code: string) => {
    setSelectedApps(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  /** Per-step validation. Returns null when the step is OK, otherwise
   *  a toast-ready error message. Keeps the wizard's "Next" enabled
   *  but surfaces a helpful message if the operator tries to advance
   *  with missing required fields (rather than silently blocking). */
  const validateStep = (key: StepKey): string | null => {
    if (key === 'contact') {
      if (!contactPerson.trim()) return 'Full name is required.';
      if (!companyName.trim())   return 'Company name is required.';
      if (!email.trim())         return 'Email is required.';
      // Basic RFC-ish email shape check so we catch typos early.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Email format looks off — please double-check.';
    }
    // Apps + Purpose steps have no hard-required fields.
    return null;
  };

  const goNext = () => {
    const err = validateStep(STEPS[step].key);
    if (err) { toast.error(err); return; }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
    // Reset scroll so the operator lands at the top of the next
    // slide rather than mid-way down from a long form.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => {
    setStep(s => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    // Re-validate every step in case the user navigated backward from
    // the last slide and blanked out a required field.
    for (const s of STEPS) {
      const err = validateStep(s.key);
      if (err) {
        toast.error(err);
        setStep(STEPS.findIndex(x => x.key === s.key));
        return;
      }
    }
    setSubmitting(true);
    try {
      const req: SubmitSurveyRequest = {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        industry: industry.trim() || undefined,
        companySize: companySize.trim() || undefined,
        country: country.trim() || undefined,
        projectType: projectType.trim() || undefined,
        selectedApps: Array.from(selectedApps),
        priority,
        budgetRange: budgetRange || undefined,
        expectedImplDate: expectedImplDate || undefined,
        currentSystem: currentSystem.trim() || undefined,
        businessRequirement: businessRequirement.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
      };
      const created = await submitPublicSurvey(req);
      setSubmittedNo(created.surveyNo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Thank-you card (unchanged) ────────────────────────────────
  if (submittedNo) {
    return (
      <div className="landing-typography min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-7 w-7 text-emerald-700" />
            </div>
            <h1 className="text-2xl font-semibold">Thanks — we've received your request</h1>
            <p className="text-sm text-gray-600">
              Our sales team will reach out within one business day. Please quote this
              reference number in any follow-up:
            </p>
            <div className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2 tabular-nums font-mono text-sm">
              <FileText className="h-4 w-4" /> {submittedNo}
            </div>
            {onBack && (
              <div>
                <Button variant="outline" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to landing
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = STEPS[step];
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="landing-typography min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="mb-3 -ml-2 text-blue-700">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to home
          </Button>
        )}
        <h1 className="text-2xl font-semibold text-blue-800 mb-1">Requirement Survey</h1>
        <p className="text-xs text-gray-500 mb-4">
          Step {step + 1} of {STEPS.length} · {currentStep.label}
        </p>

        {/* Stepper — clickable pills for the completed / current step,
            greyed-out for future ones. Also acts as the progress
            indicator (filled bar under each step). */}
        <div className="mb-6">
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done   = i <  step;
              const active = i === step;
              const clickable = i < step || i === step; // never let the user skip ahead
              return (
                <li key={s.key} className="flex-1">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && setStep(i)}
                    className={`w-full flex items-center gap-2 rounded-md px-3 py-2 border text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-800 font-medium'
                        : done
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                          : 'bg-white border-gray-200 text-gray-400'
                    }`}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      active ? 'bg-blue-600 text-white'
                        : done ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {/* Progress bar under each pill — filled portion
                      lights blue up to and including the active step. */}
                  <div className="mt-1.5 h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full ${
                      i <= step ? 'bg-blue-600' : 'bg-transparent'
                    }`} />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Intro banner — mirrors the landing-page style so the form
            feels like part of the marketing flow, not a bare admin form. */}
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 mb-6 flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-blue-900">Let's build together</p>
            <p className="text-sm text-blue-800">
              Provide some details about your project needs to help us understand the scope.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">

            {/* ── Slide 1 · Contact ────────────────────────────── */}
            {currentStep.key === 'contact' && (
              <Section title="Contact">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Full name" required>
                    <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Your name" autoFocus />
                  </Field>
                  <Field label="Company name" required>
                    <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company / Organisation" />
                  </Field>
                  <Field label="Email" required>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                  </Field>
                  <Field label="Phone">
                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+855 …" />
                  </Field>
                  <Field label="Industry">
                    <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Manufacturing, Retail, …" />
                  </Field>
                  <Field label="Company size">
                    <Select value={companySize} onValueChange={setCompanySize}>
                      <SelectTrigger><SelectValue placeholder="Choose a range" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1 – 10</SelectItem>
                        <SelectItem value="11-50">11 – 50</SelectItem>
                        <SelectItem value="51-200">51 – 200</SelectItem>
                        <SelectItem value="201-500">201 – 500</SelectItem>
                        <SelectItem value="501-2000">501 – 2,000</SelectItem>
                        <SelectItem value="2000+">2,000+</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Country">
                    <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Cambodia" />
                  </Field>
                </div>
              </Section>
            )}

            {/* ── Slide 2 · Select Apps ────────────────────────── */}
            {currentStep.key === 'apps' && (
              <Section title="Select Apps">
                <p className="text-xs text-gray-500 mb-3 -mt-1">
                  Pick everything you think you'll need. We'll refine the scope with you on the call —
                  it's fine to leave some blank if you're not sure.
                </p>

                {/* Quick-actions strip — Select all / Clear. Handy when
                    the prospect wants "everything" and doesn't want to
                    tap through 30 tiles. */}
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="text-gray-500">
                    {selectedApps.size > 0
                      ? `${selectedApps.size} app${selectedApps.size !== 1 ? 's' : ''} selected`
                      : 'None selected yet'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        const all = new Set<string>();
                        for (const g of APP_GROUPS) for (const a of g.apps) all.add(a.code);
                        setSelectedApps(all);
                      }}
                    >
                      Select all
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700 hover:underline"
                      onClick={() => setSelectedApps(new Set())}
                      disabled={selectedApps.size === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  {APP_GROUPS.map(group => {
                    const groupSelected = group.apps.filter(a => selectedApps.has(a.code)).length;
                    return (
                      <div key={group.section}>
                        {/* Group header with per-section select-all
                            control — useful when a customer says "I
                            want the whole Sale stack" — one tap wins.
                            The section hint moves into an Info-icon
                            tooltip inline with the title, so the
                            header stays a single compact line. */}
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold inline-flex items-center gap-1.5">
                            {group.section}
                            {group.hint && (
                              <TooltipProvider delayDuration={120}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help normal-case">
                                      <Info className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed normal-case">
                                    {group.hint}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {groupSelected > 0 && (
                              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 h-4 min-w-[16px] px-1 text-[10px] font-medium normal-case">
                                {groupSelected}
                              </span>
                            )}
                          </p>
                          <button
                            type="button"
                            className="text-[11px] text-blue-600 hover:underline"
                            onClick={() => {
                              setSelectedApps(prev => {
                                const next = new Set(prev);
                                const allOn = group.apps.every(a => next.has(a.code));
                                for (const a of group.apps) {
                                  if (allOn) next.delete(a.code);
                                  else next.add(a.code);
                                }
                                return next;
                              });
                            }}
                          >
                            {group.apps.every(a => selectedApps.has(a.code)) ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>

                        {/* Icon-tile grid — matches the in-app
                            AppLauncher aesthetic: a big pastel icon
                            square sits above a centered label, one
                            distinct color per app (see the T_* tone
                            constants above). Selection state is
                            conveyed by a ring around the tile plus a
                            check chip on the icon square, rather than
                            flipping every tile to blue and losing the
                            per-app color coding. */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                          {group.apps.map(app => {
                            const active = selectedApps.has(app.code);
                            const Icon = app.icon;
                            return (
                              <button
                                type="button"
                                key={app.code}
                                onClick={() => toggleApp(app.code)}
                                aria-pressed={active}
                                title={app.label}
                                className={`relative flex flex-col items-center gap-2 rounded-xl p-3 transition-all
                                  ${active
                                    ? `bg-white ring-2 ${app.tone.ring} shadow-sm`
                                    : 'bg-white hover:bg-slate-50'}
                                `}
                              >
                                <span className={`relative inline-flex h-12 w-12 items-center justify-center rounded-xl ${app.tone.bg} ${app.tone.text}`}>
                                  <Icon className="h-6 w-6" />
                                  {active && (
                                    <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-white">
                                      <Check className="h-2.5 w-2.5" />
                                    </span>
                                  )}
                                </span>
                                <span className={`text-xs text-center leading-tight ${active ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                                  {app.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Slide 3 · Purpose (project details) ──────────── */}
            {currentStep.key === 'purpose' && (
              <div className="space-y-5">
                <Section title="Project Type">
                  <Select value={projectType} onValueChange={setProjectType}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_deployment">New deployment</SelectItem>
                      <SelectItem value="migration">Migrating from another system</SelectItem>
                      <SelectItem value="expansion">Expanding existing usage</SelectItem>
                      <SelectItem value="consulting">Consulting / advisory</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Section>

                <Section title="Detailed Requirements">
                  <Textarea
                    rows={6}
                    value={businessRequirement}
                    onChange={e => setBizReq(e.target.value)}
                    placeholder="Describe the core features, objectives, and any specific technical needs…"
                  />
                </Section>

                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Priority">
                    <Select value={priority} onValueChange={(v) => setPriority(v as SurveyPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Expected implementation">
                    <Input type="date" value={expectedImplDate} onChange={e => setExpectedDate(e.target.value)} />
                  </Field>
                </div>

                <Section title="Budget Range">
                  <div className="grid grid-cols-2 gap-2">
                    {BUDGET_BANDS.map(band => {
                      const active = budgetRange === band;
                      return (
                        <button
                          type="button"
                          key={band}
                          onClick={() => setBudgetRange(active ? '' : band)}
                          className={`rounded-md border py-2.5 text-sm transition-colors
                            ${active
                              ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'}
                          `}
                        >
                          {band}
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Field label="Current system (if any)">
                  <Input value={currentSystem} onChange={e => setCurrentSystem(e.target.value)} placeholder="Excel, QuickBooks, Odoo, …" />
                </Field>

                <Field label="Additional notes">
                  <Textarea
                    rows={3}
                    value={additionalNotes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Anything else we should know?"
                  />
                </Field>
              </div>
            )}

            {/* Navigation footer — Back on the left, Next / Submit on
                the right. Back is disabled on the first slide (there's
                nowhere to go); Submit replaces Next on the last slide. */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={goBack}
                disabled={isFirst || submitting}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
              {isLast ? (
                <Button
                  onClick={submit}
                  disabled={submitting}
                  className="h-11 px-6 text-sm"
                >
                  {submitting
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
                    : <><Send className="h-4 w-4 mr-2" /> Submit Requirement</>}
                </Button>
              ) : (
                <Button
                  onClick={goNext}
                  disabled={submitting}
                  className="h-11 px-6 text-sm"
                >
                  Next <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Small helper that keeps the section headings visually consistent. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-900 mb-2">{title}</p>
      {children}
    </div>
  );
}

/** Labelled field wrapper — required asterisk when applicable. */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
