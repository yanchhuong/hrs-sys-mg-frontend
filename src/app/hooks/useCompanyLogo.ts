/**
 * v-footer-logo-tint — the tenant's logo, for components that need the
 * image itself rather than the whole company record.
 *
 * The template editor's preview is the caller this exists for. It is
 * rendered from five places across four components, none of which load
 * company settings, and threading a prop through all of them to colour
 * one band is not worth it.
 *
 * The fetch is cached in a module-level promise, so the five previews
 * on the templates screen share one request and later mounts resolve
 * without a round trip. Nothing invalidates it: a logo changed in
 * Settings shows up on the next full page load, which is fine for a
 * preview's accent colour.
 */
import { useEffect, useState } from 'react';
import * as settingsApi from '../api/settings';

// One cached company record shared by both hooks below, so the previews
// that want the logo and the ones that want address / phone (the
// thermal receipt) still make a single request.
let cached: Promise<settingsApi.CompanyInfo | null> | null = null;

function loadCompany(): Promise<settingsApi.CompanyInfo | null> {
  // Soft-fail: a preview without company details is a preview, not an error.
  cached ??= settingsApi.getCompanyInfo().catch(() => null);
  return cached;
}

/** The whole company record (name, address, phone, logo…) — null until
 *  loaded or when the fetch failed. */
export function useCompanyInfo(): settingsApi.CompanyInfo | null {
  const [info, setInfo] = useState<settingsApi.CompanyInfo | null>(null);
  useEffect(() => {
    let live = true;
    void loadCompany().then(c => { if (live) setInfo(c); });
    return () => { live = false; };
  }, []);
  return info;
}

export function useCompanyLogo(): string | null {
  return useCompanyInfo()?.logoUrl ?? null;
}
