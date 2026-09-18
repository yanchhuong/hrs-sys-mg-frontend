import { useEffect, useState } from 'react';
import { USE_MOCKS } from '../api/client';
import {
  getEpoch, getProfileImageUrl, subscribe, wasUploaded,
} from '../api/profileImageCache';

/**
 * Resolve an employee's profile photo to something `<img src>` can load.
 *
 * Returns undefined while loading, when the employee has no photo, or
 * when the fetch fails — callers keep their initials/icon fallback for
 * all three, so the avatar never collapses.
 *
 * In mock mode {@code profileImage} is already a data URL and is passed
 * straight through. In live mode it is a storage path that the browser
 * cannot load, so it is used only as the "has a photo at all" flag and
 * the bytes come from the authenticated endpoint via the shared cache.
 *
 * @param apiId       backend employee UUID (`employee.apiId`)
 * @param profileImage the employee's stored image path, or data URL in mocks
 */
export function useProfileImage(
  apiId: string | undefined,
  profileImage: string | null | undefined,
): string | undefined {
  const [src, setSrc] = useState<string | undefined>(
    USE_MOCKS ? (profileImage ?? undefined) : undefined,
  );
  // Re-runs the effect when an upload elsewhere invalidates the cache.
  const [epoch, setEpoch] = useState(getEpoch);

  useEffect(() => subscribe(() => setEpoch(getEpoch())), []);

  useEffect(() => {
    if (USE_MOCKS) {
      setSrc(profileImage ?? undefined);
      return;
    }
    // No id, or nothing stored and nothing uploaded this session: skip the
    // request entirely. `profileImage` carries the storage path, so empty
    // means the employee has never uploaded one and a fetch would only
    // produce a 404 per rendered row.
    if (!apiId || (!profileImage && !wasUploaded(apiId))) {
      setSrc(undefined);
      return;
    }
    let cancelled = false;
    getProfileImageUrl(apiId)
      .then(url => { if (!cancelled) setSrc(url ?? undefined); })
      .catch(() => { if (!cancelled) setSrc(undefined); });
    return () => { cancelled = true; };
    // The object URL is owned by the cache and shared with other mounted
    // avatars, so it is deliberately NOT revoked on unmount here.
  }, [apiId, profileImage, epoch]);

  return src;
}
