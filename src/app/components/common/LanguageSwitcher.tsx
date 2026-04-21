import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { LANG_LABELS, Lang } from '../../i18n/translations';

/**
 * Compact globe button that opens a language picker. Place anywhere in the
 * header; the choice is global via I18nContext and persists to localStorage.
 */
export function LanguageSwitcher({ variant = 'ghost', compact = false }: { variant?: 'ghost' | 'outline'; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const current = LANG_LABELS[lang];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={compact ? 'icon' : 'sm'} className={compact ? 'h-9 w-9' : 'h-9 gap-1.5'}>
          <Globe className="h-4 w-4" />
          {!compact && (
            <span className="text-xs">
              <span className="mr-1">{current.flag}</span>
              {current.native}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t('header.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(LANG_LABELS) as Lang[]).map((code) => {
          const info = LANG_LABELS[code];
          const active = code === lang;
          return (
            <DropdownMenuItem
              key={code}
              onClick={() => setLang(code)}
              className={active ? 'bg-blue-50 text-blue-700' : ''}
            >
              <span className="mr-2">{info.flag}</span>
              <span className="flex-1">
                <span className="block text-sm">{info.native}</span>
                <span className="block text-[11px] text-gray-500">{info.english}</span>
              </span>
              {active && <Check className="h-3.5 w-3.5 text-blue-700" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
