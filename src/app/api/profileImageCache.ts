import { fetchProfileImageBlobUrl } from './documents';

/**
 * Process-wide cache of employee profile-image blob URLs.
 *
 * <h3>Why a cache rather than a fetch per component</h3>
 * The image lives behind {@code /api/v1/employees/:id/profile-image},
 * which requires a Bearer token — so `<img src>` can't load it directly
 * and every avatar has to fetch the bytes and wrap them in an object
 * URL. Without sharing, one roster screen would issue a request per
 * avatar per mount: the 232-person list, the org chart and the details
 * drawer would each refetch the same faces, and re-renders would do it
 * again. Keyed by the backend UUID, one fetch serves every avatar on
 * screen and survives navigation between tabs.
 *
 * <h3>Invalidation</h3>
 * {@link invalidateProfileImage} drops the entry and notifies every
 * mounted avatar, so a fresh upload lands in the list, the org chart
 * and the details strip at once rather than only where it was uploaded.
 *
 * <h3>Why {@link markProfileImageUploaded} exists</h3>
 * Callers skip the fetch when {@code employee.profileImage} is empty,
 * because that field carries the storage path and an empty value means
 * "never uploaded" — without that guard every photo-less row logs a 404.
 * But the upload endpoint returns no body, so right after a first
 * upload the in-memory employee still has an empty path and the guard
 * would suppress the very image we just stored. Recording the id here
 * lets the guard pass without writing a fake path onto the employee
 * object — which matters because the edit form spreads the employee
 * straight into the update payload, so a sentinel would be saved.
 */

/** In-flight or settled fetches, keyed by backend employee UUID. */
const entries = new Map<string, Promise<string | null>>();

/** Ids known to have an image because we just uploaded one. */
const uploaded = new Set<string>();

/** Mounted avatars, woken on invalidation. */
const listeners = new Set<() => void>();

/**
 * Bumped on every invalidation. Hooks depend on it so that dropping an
 * entry re-runs their effect even though the employee id is unchanged.
 */
let epoch = 0;

export function getEpoch(): number {
  return epoch;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True when an upload in this session stored an image for the id. */
export function wasUploaded(apiId: string): boolean {
  return uploaded.has(apiId);
}

export function markProfileImageUploaded(apiId: string): void {
  uploaded.add(apiId);
}

/**
 * Blob URL for the employee's photo, or null when there is none.
 * Concurrent callers share one request; the resolved URL is reused.
 */
export function getProfileImageUrl(apiId: string): Promise<string | null> {
  let pending = entries.get(apiId);
  if (!pending) {
    // A failed fetch resolves to null rather than rejecting, so one
    // network blip doesn't leave a rejected promise cached for the
    // rest of the session. The entry is dropped so a later mount retries.
    pending = fetchProfileImageBlobUrl(apiId).catch(() => {
      entries.delete(apiId);
      return null;
    });
    entries.set(apiId, pending);
  }
  return pending;
}

/**
 * Forget the cached image for an employee and wake every mounted avatar.
 *
 * The old object URL is revoked on a delay rather than immediately:
 * subscribers are still rendering it at the moment of invalidation, and
 * revoking under them would blank the avatar until the replacement
 * arrives. By the time the timer fires they have all swapped to the new
 * blob.
 */
export function invalidateProfileImage(apiId: string): void {
  const stale = entries.get(apiId);
  entries.delete(apiId);
  if (stale) {
    void stale.then(url => {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }
  epoch += 1;
  listeners.forEach(fn => fn());
}
