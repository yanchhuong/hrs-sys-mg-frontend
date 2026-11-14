/**
 * PrintPaperChooser — Print, with the paper to print on and a "Set as
 * default". The web counterpart of hrs-pro-appl's PrintSheet + PrintButton:
 *
 *   [ 🖨 Print | A5 ▾ ]
 *
 * - Print prints the default paper straight away; with no default set it
 *   opens the chooser.
 * - ▾ always opens the chooser: the papers (Invoice A5 / A4, the receipt
 *   for a POS sale) and a "Set as default" checkbox. Ticked, the paper
 *   picked becomes the default for this kind of document and Print stops
 *   asking; not ticked, nothing is saved (an existing default is cleared).
 *   The box comes up checked when a default already exists.
 *
 * The default lives in this browser (localStorage), per kind of document:
 * which paper a counter prints on is a property of that counter's printer.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { useI18n } from '../../i18n/I18nContext';

export interface PaperOption {
  key: string;
  /** "Invoice A5" */
  label: string;
  /** "Half sheet, 148 × 210 mm" */
  hint: string;
  /** What the button shows once it's the default: "A5", "80mm". */
  short: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
}

const storageKey = (kind: string) => `hrms:printDefault:${kind}`;

function readDefault(kind: string): string | null {
  try { return localStorage.getItem(storageKey(kind)); } catch { return null; }
}

function writeDefault(kind: string, key: string | null) {
  try {
    if (key) localStorage.setItem(storageKey(kind), key);
    else localStorage.removeItem(storageKey(kind));
  } catch { /* private window — the chooser just asks again */ }
}

export function PrintPaperChooser({ kind, options, suggestedKey, disabled }: {
  /** 'invoice', 'bill' — each keeps its own default. */
  kind: string;
  options: PaperOption[];
  /** What this document would print as if nobody chose — badged "Suggested". */
  suggestedKey?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [def, setDef] = useState<string | null>(() => readDefault(kind));
  // A default that isn't offered here (the receipt, on an invoice that
  // isn't a POS sale) counts as none: Print asks.
  const current = options.find(o => o.key === def) ?? null;
  const [open, setOpen] = useState(false);
  const [asDefault, setAsDefault] = useState(false);
  useEffect(() => { if (open) setAsDefault(!!current); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const printWord = t('print.print', 'Print');
  const chooseTip = t('print.choose_paper', 'Choose paper size');

  const print = () => { if (current) void current.run(); else setOpen(true); };

  const pick = (o: PaperOption) => {
    const isNewDefault = asDefault && def !== o.key;
    const next = asDefault ? o.key : null;
    writeDefault(kind, next);
    setDef(next);
    setOpen(false);
    // Let the dialog close before the print dialog snapshots the page.
    window.setTimeout(() => { void o.run(); }, 200);
    if (isNewDefault) {
      toast.success(t('print.default_saved', 'Default saved'), {
        description: t('print.default_saved_hint', 'Print uses {paper} from now on. Use ▾ next to Print to change it.')
          .replace('{paper}', o.label),
      });
    }
  };

  // The default first, then the suggestion, then the rest.
  const rank = (o: PaperOption) => (o.key === def ? 2 : o.key === suggestedKey ? 1 : 0);
  const ordered = [...options].sort((a, b) => rank(b) - rank(a));

  return (
    <>
      <div className="inline-flex" role="group">
        <Button size="sm" variant="outline" className="rounded-r-none" onClick={print} disabled={disabled}
          title={current ? `${printWord} · ${current.label}` : printWord}>
          <Printer className="h-3.5 w-3.5 mr-1" /> {printWord}
        </Button>
        <Button size="sm" variant="outline" className="rounded-l-none border-l-0 px-2 gap-1" onClick={() => setOpen(true)}
          disabled={disabled} title={chooseTip} aria-label={current ? `${chooseTip}: ${current.short}` : chooseTip}>
          {current && <span className="text-xs font-semibold">{current.short}</span>}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{printWord}</DialogTitle>
            <DialogDescription>{t('print.choose_paper_hint', 'Choose the paper to print on.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ordered.map(o => {
              const inUse = o.key === def;
              const lead = inUse || (!current && o.key === suggestedKey);
              return (
                <button key={o.key} type="button" onClick={() => pick(o)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 ${lead ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${lead ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {o.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{o.label}</span>
                    <span className="block text-xs text-gray-500">{o.hint}</span>
                  </span>
                  {inUse
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" aria-label={t('print.is_default', 'Default')} />
                    : o.key === suggestedKey && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{t('print.suggested', 'Suggested')}</span>
                    )}
                </button>
              );
            })}
          </div>
          {/* Set as default — tick it, then pick: that paper prints
              straight away next time, no chooser. */}
          <label className="flex items-start gap-2.5 border-t pt-3 cursor-pointer select-none">
            <Checkbox checked={asDefault} onCheckedChange={v => setAsDefault(v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t('print.set_default', 'Set as default')}</span>
              <span className="block text-xs text-gray-500">{t('print.set_default_hint', 'Next time, print it without asking.')}</span>
            </span>
          </label>
        </DialogContent>
      </Dialog>
    </>
  );
}
