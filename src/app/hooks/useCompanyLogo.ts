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

let cached: Promise<string | null> | null = null;

function loadLogo(): Promise<string | null> {
  // Soft-fail: a preview without a logo is a preview, not an error.
  cached ??= settingsApi.getCompanyInfo()
    .then(info => info.logoUrl ?? null)
    .catch(() => null);
  return cached;
}

export function useCompanyLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadLogo().then(url => { if (live) setLogo(url); });
    return () => { live = false; };
  }, []);
  return logo;
}
