import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { myCompanies, switchCompany, type TelegramCompany } from '../../api/telegramAuth';
import { CompanyLogo } from './CompanyPicker';

/**
 * v-telegram-companies — spec §12.6: the header's company switcher. Shown
 * only when the signed-in user's Telegram opens two or more companies;
 * picking one opens a session there and reloads the app into it.
 */
export function CompanySwitcher() {
  const [companies, setCompanies] = useState<TelegramCompany[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void myCompanies().then(list => { if (live) setCompanies(list); });
    return () => { live = false; };
  }, []);

  if (companies.length < 2) return null;
  const current = companies.find(c => c.current) ?? companies[0];

  const open = async (c: TelegramCompany) => {
    if (c.current || busy) return;
    setBusy(c.tenantId);
    try {
      await switchCompany(c.tenantId);
      window.location.replace('/');
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error && e.message ? e.message : `Couldn't open ${c.name}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 max-w-[220px]" aria-label="Switch company">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5 text-blue-600" />}
          <span className="hidden md:inline truncate">{current.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-gray-500 font-normal">Switch company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map(c => (
          <DropdownMenuItem key={c.tenantId} onSelect={() => void open(c)} disabled={!!busy} className="gap-2.5">
            <CompanyLogo company={c} size={28} />
            <span className="flex-1 min-w-0 truncate">{c.name}</span>
            {c.current && <Check className="h-4 w-4 text-blue-600" />}
            {busy === c.tenantId && <Loader2 className="h-4 w-4 animate-spin" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
