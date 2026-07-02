/**
 * Standalone Cambodia labour-law learning page (V170+).
 *
 * The four Cambodia-specific sections previously lived inside the
 * main landing page. They're still the SEO / education backbone but
 * the marketing page benefits from a shorter, tighter enterprise
 * pitch, so we route them out to /cambodia and link from the top nav.
 *
 * <p>The section components themselves are imported verbatim from
 * {@code LandingPage.tsx} — no code duplication. Only the page
 * chrome (header + footer + intro) lives here.</p>
 */
import { useEffect } from 'react';
import { Button } from './ui/button';
import { useI18n } from '../i18n/I18nContext';
import { Building2, ArrowLeft, Languages } from 'lucide-react';
import {
  Lang, CambodiaSection, WorkingRule, BenefitFormulas, BenefitCalculatorsShowcase,
} from './LandingPage';

/** Same Container tokens as LandingPage — kept local so this page can
 *  render without dragging every helper out of LandingPage as an export. */
function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function CambodiaLearnPage() {
  const i18n = useI18n();
  const lang: Lang = (['en', 'km', 'zh'] as const).includes(i18n.lang as Lang)
    ? (i18n.lang as Lang)
    : 'en';
  const setLang = (next: Lang) => i18n.setLang(next);

  useEffect(() => {
    // Scroll to top on mount — landing-page anchor state shouldn't
    // leak across the full-page navigation.
    window.scrollTo(0, 0);
  }, []);

  const label = {
    back:    { en: 'Back to home',       km: 'ត្រឡប់ទៅទំព័រដើម',      zh: '返回首页' } as const,
    title:   { en: 'Cambodia — Labour Law Guide',
               km: 'កម្ពុជា — ការណែនាំច្បាប់ការងារ',
               zh: '柬埔寨 — 劳动法指南' } as const,
    lede:    { en: 'How the platform mirrors Cambodian NSSF, Tax on Salary, Seniority Indemnity, and Annual Leave rules — with worked examples and live calculators.',
               km: 'របៀបដែលវេទិកានេះឆ្លុះបញ្ចាំងច្បាប់ ប.ស.ស ពន្ធលើប្រាក់ខែ សំណងអតីតភាព និងច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំរបស់កម្ពុជា — ជាមួយឧទាហរណ៍ដំណើរការ និងម៉ាស៊ីនគណនាផ្ទាល់។',
               zh: '平台如何映射柬埔寨的 NSSF、薪资税、工龄补偿和年假规则 — 附有可运行示例和实时计算器。' } as const,
  };
  const t = (m: { en: string; km: string; zh: string }) => m[lang] ?? m.en;

  return (
    <div className="landing-typography min-h-screen bg-white text-slate-900 antialiased">
      {/* Lightweight header — mirrors the LandingNav design but strips
          out the Sign In / Get Started CTAs. This page is read-only
          content; the primary action is "go back to the marketing page". */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <Container className="flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="text-base font-semibold tracking-tight">Smart-HRMS</span>
          </a>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'km' : lang === 'km' ? 'zh' : 'en')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              aria-label="Toggle language"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === 'en' ? 'ខ្មែរ' : lang === 'km' ? '中文' : 'EN'}
            </button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/"><ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> {t(label.back)}</a>
            </Button>
          </div>
        </Container>
      </header>

      {/* Page intro — sets context before the deep-dive sections start. */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-blue-50/40 to-white py-14">
        <Container className="text-center">
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(label.title)}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            {t(label.lede)}
          </p>
        </Container>
      </section>

      {/* Reuse the existing section components verbatim — the copy,
          formulas, calculators, and per-section i18n stay in one
          source (LandingPage.tsx's T tree) so this page never falls
          out of sync. */}
      <CambodiaSection lang={lang} />
      <WorkingRule lang={lang} />
      <BenefitFormulas lang={lang} />
      <BenefitCalculatorsShowcase lang={lang} />

      {/* Bottom back-to-home strip — a soft CTA to bring visitors back
          to the marketing funnel after they've scrolled through. */}
      <section className="border-t border-slate-200 bg-slate-50 py-12">
        <Container className="text-center">
          <Button asChild size="lg" variant="outline">
            <a href="/"><ArrowLeft className="h-4 w-4 mr-2" /> {t(label.back)}</a>
          </Button>
        </Container>
      </section>
    </div>
  );
}
