import { useEffect, useState } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { ApiError, resolveAssetUrl } from '../../api/client';
import {
  companiesForSelection, leaveTelegramNote, selectCompany, telegramErrorMessage, type TelegramCompany,
} from '../../api/telegramAuth';

/** Company initials, for a company without a logo. */
export function companyInitials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export function CompanyLogo({ company, size = 40 }: { company: Pick<TelegramCompany, 'name' | 'logoUrl'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? resolveAssetUrl(company.logoUrl) : null;
  return src ? (
    <img src={src} alt="" onError={() => setFailed(true)} className="rounded-lg object-cover bg-white border shrink-0"
      style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-lg bg-blue-50 text-blue-700 font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {companyInitials(company.name)}
    </span>
  );
}

/**
 * v-telegram-companies — spec §12.5: Telegram confirmed a person with
 * accounts in two or more companies; they choose which to open. "Last
 * used" is preselected. The choice is trusted only within the selection
 * the server issued (5 minutes, once).
 */
export function CompanyPicker({ selection }: { selection: string }) {
  const [companies, setCompanies] = useState<TelegramCompany[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expired = (code = 'selection_expired') => {
    leaveTelegramNote({ kind: 'login_error', code });
    window.location.replace('/');
  };

  useEffect(() => {
    let live = true;
    companiesForSelection(selection)
      .then(list => {
        if (!live) return;
        if (list.length === 0) return expired('company_inactive');
        setCompanies(list);
        setChosen((list.find(c => c.lastUsed) ?? list[0]).userId);
      })
      .catch(() => { if (live) expired(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const go = async () => {
    if (!chosen) return;
    setBusy(true);
    setError('');
    try {
      await selectCompany(selection, chosen);
      window.location.replace('/');
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.status === 401) return expired(/^[a-z_]+$/.test(e.message) ? e.message : 'selection_expired');
      setError(e instanceof Error && e.message ? e.message : telegramErrorMessage('telegram_error'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-blue-600 text-white flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Choose a company</h1>
          <p className="mt-1 text-sm text-gray-500">Your Telegram opens more than one.</p>
        </div>

        {companies === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Companies">
            {companies.map(c => {
              const on = c.userId === chosen;
              return (
                <button key={c.userId} type="button" role="radio" aria-checked={on} onClick={() => setChosen(c.userId)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    on ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <CompanyLogo company={c} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate">{c.name}</span>
                    {c.lastUsed && <span className="block text-xs text-blue-700 mt-0.5">Last used</span>}
                  </span>
                  <span className={`h-5 w-5 rounded-full border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="button" onClick={() => void go()} disabled={!chosen || busy || companies === null}
          className="w-full h-11 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue
        </button>
      </div>
    </div>
  );
}
