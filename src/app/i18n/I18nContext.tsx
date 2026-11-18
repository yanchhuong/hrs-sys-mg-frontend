import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Lang, LANG_STORAGE_KEY, currentLang, translate } from './translations';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

// The key and the first-paint choice live in translations.ts now, so
// api/client.ts can read the same language without importing React.
const STORAGE_KEY = LANG_STORAGE_KEY;
const loadInitial = currentLang;

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadInitial);

  useEffect(() => {
    document.documentElement.lang = lang;
    // Give Khmer a slightly looser line-height for readability.
    if (lang === 'km') document.documentElement.classList.add('lang-km');
    else document.documentElement.classList.remove('lang-km');
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    t: (key: string, fallback?: string) => translate(key, lang, fallback),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fall back gracefully when consumed outside a provider (e.g. tests).
    return {
      lang: 'en',
      setLang: () => {},
      t: (key, fallback) => translate(key, 'en', fallback),
    };
  }
  return ctx;
}
