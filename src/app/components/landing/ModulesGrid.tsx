import { Card, CardContent } from '../ui/card';
import { useI18n } from '../../i18n/I18nContext';
import type { Lang } from '../LandingPage';
import type { Tone, TriLang } from './moduleCategories';
import { LANDING_CATEGORIES } from './moduleCategories';

/** Tint palette for category banners, module-card icon chips, and
 *  accent text. Kept aligned with the `Tone` union in
 *  `moduleCategories.ts` — adding a new tone requires an entry in
 *  all three records below. */
const TONE_ICON_CLASSES: Record<Tone, string> = {
  blue:    'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50 text-amber-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  rose:    'bg-rose-50 text-rose-600',
  violet:  'bg-violet-50 text-violet-600',
  cyan:    'bg-cyan-50 text-cyan-600',
  slate:   'bg-slate-100 text-slate-600',
  teal:    'bg-teal-50 text-teal-600',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600',
};

const TONE_CATEGORY_CLASSES: Record<Tone, string> = {
  blue:    'border-blue-200 bg-blue-50/40',
  emerald: 'border-emerald-200 bg-emerald-50/40',
  amber:   'border-amber-200 bg-amber-50/40',
  indigo:  'border-indigo-200 bg-indigo-50/40',
  rose:    'border-rose-200 bg-rose-50/40',
  violet:  'border-violet-200 bg-violet-50/40',
  cyan:    'border-cyan-200 bg-cyan-50/40',
  slate:   'border-slate-200 bg-slate-50',
  teal:    'border-teal-200 bg-teal-50/40',
  fuchsia: 'border-fuchsia-200 bg-fuchsia-50/40',
};

const TONE_ACCENT_TEXT: Record<Tone, string> = {
  blue:    'text-blue-700',
  emerald: 'text-emerald-700',
  amber:   'text-amber-700',
  indigo:  'text-indigo-700',
  rose:    'text-rose-700',
  violet:  'text-violet-700',
  cyan:    'text-cyan-700',
  slate:   'text-slate-700',
  teal:    'text-teal-700',
  fuchsia: 'text-fuchsia-700',
};

function t(entry: TriLang, lang: Lang): string {
  return entry[lang] ?? entry.en;
}

/** Renders the landing-page module catalog from
 *  {@link LANDING_CATEGORIES}. Category-level layout is a tinted
 *  banner header (icon + title + one-line pitch) followed by a
 *  responsive grid of module cards.
 *
 *  Adding / editing categories or modules never touches this file —
 *  edit the config in `moduleCategories.ts` instead. */
export function ModulesGrid({ lang }: { lang?: Lang }) {
  const { lang: ctxLang } = useI18n();
  const activeLang: Lang = lang ?? (ctxLang as Lang);

  return (
    <section id="modules" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium tracking-wide uppercase text-slate-700">
            {activeLang === 'km' ? 'មុខងារ' : activeLang === 'zh' ? '模块' : 'Modules'}
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {activeLang === 'km'
              ? 'ប្រព័ន្ធតែមួយ សម្រាប់អាជីវកម្មដែលអ្នកគ្រប់គ្រង'
              : activeLang === 'zh'
              ? '一个平台，覆盖您经营的每种业务'
              : 'One platform, every business you run'}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            {activeLang === 'km'
              ? 'ប្រាំមួយប្រភេទអាជីវកម្ម + ធនធានវិភាគ និងវេទិកា — ទាំងអស់ក្នុងតែមួយ។'
              : activeLang === 'zh'
              ? '六大业务类别 + 报表分析 + 平台底座 — 一体化交付。'
              : 'Six business verticals plus horizontal reporting and platform glue — one code base, one database, one bilingual UI.'}
          </p>
        </div>

        {/* Category sections. Category-level tone drives banner tint,
            module-card icon chip, and accent text so the visual
            grouping stays consistent scrolling down the page. */}
        <div className="mt-14 space-y-12">
          {LANDING_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <div key={cat.key} id={`cat-${cat.key}`} className="scroll-mt-24">
                <div className={`rounded-2xl border ${TONE_CATEGORY_CLASSES[cat.tone]} px-5 py-4 sm:px-6 sm:py-5`}>
                  <div className="flex items-start gap-4">
                    <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONE_ICON_CLASSES[cat.tone]}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-xl font-bold ${TONE_ACCENT_TEXT[cat.tone]}`}>{t(cat.title, activeLang)}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(cat.desc, activeLang)}</p>
                    </div>
                    <span className="hidden sm:inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 border border-slate-200">
                      {cat.modules.length} {cat.modules.length === 1 ? 'app' : 'apps'}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.modules.map((m, i) => {
                    const MIcon = m.icon;
                    return (
                      <Card key={i} className="group border-slate-200/70 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                        <CardContent className="p-6">
                          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${TONE_ICON_CLASSES[cat.tone]}`}>
                            <MIcon className="h-5 w-5" />
                          </span>
                          <h4 className="mt-4 text-base font-semibold text-slate-900">{t(m.title, activeLang)}</h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(m.desc, activeLang)}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {cat.crossLink && (
                  <div className="mt-4 text-right">
                    <a
                      href={cat.crossLink.href}
                      className={`inline-flex items-center gap-1 text-sm font-medium ${TONE_ACCENT_TEXT[cat.tone]} hover:underline`}
                    >
                      {t(cat.crossLink.label, activeLang)}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
