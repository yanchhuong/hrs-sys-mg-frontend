import { useAuth } from '../context/AuthContext';
import { selfPhotoKey } from '../api/profileImageCache';
import { useProfileImage } from './useProfileImage';

/**
 * The signed-in user's profile photo, as an `<img src>`-ready URL, or
 * undefined (no photo / loading / failed — callers keep initials).
 *
 * A user linked to an employee shows the EMPLOYEE's photo, keyed by the
 * employee id — the same cache entry the Employee screens use, so an
 * upload on Profile or on the Employee screen updates both at once. A
 * user without an employee is keyed `me:<userId>`.
 *
 * Returns the cache key too, for the uploader to invalidate after a change.
 */
export function useMyProfileImage(): { src: string | undefined; key: string | undefined } {
  const { currentUser } = useAuth();
  const key = !currentUser ? undefined
    : currentUser.employeeId ? currentUser.employeeId
    : selfPhotoKey(currentUser.id);
  const src = useProfileImage(key, currentUser?.profileImage);
  return { src, key };
}
