/**
 * Payout type for one employee (V383): the company default (Payroll
 * Settings) or an override — once / twice a month, weekly or daily.
 * '' = follow the company default.
 */
import { useEffect, useState } from 'react';
import * as settingsApi from '../../api/accountingSettings';
import { PAY_FREQUENCIES, payFrequencyLabel, type PayFrequency } from '../../utils/payFrequency';

/** The company default, read once per mount. */
export function useCompanyPayFrequency(): PayFrequency {
  const [f, setF] = useState<PayFrequency>('monthly');
  useEffect(() => {
    let live = true;
    settingsApi.get('payroll')
      .then(s => { if (live && s.payFrequency) setF(s.payFrequency); })
      .catch(() => { /* default stays */ });
    return () => { live = false; };
  }, []);
  return f;
}

export function PayFrequencySelect({ value, onChange, company, id }: {
  value: PayFrequency | '' | null | undefined;
  onChange: (v: PayFrequency | '') => void;
  company: PayFrequency;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={e => onChange(e.target.value as PayFrequency | '')}
      className="w-full px-3 py-2 border rounded-md text-sm h-9 bg-white"
      aria-label="Payout type"
    >
      <option value="">Company default ({payFrequencyLabel(company)})</option>
      {PAY_FREQUENCIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}

/** Read-only text: own setting, or "Company default (…)". */
export const payFrequencyText = (own: string | null | undefined, company: PayFrequency) =>
  own ? payFrequencyLabel(own) : `Company default (${payFrequencyLabel(company)})`;
