import { User as UserIcon } from 'lucide-react';
import { useProfileImage } from '../../hooks/useProfileImage';

/**
 * Render an employee's profile photo without leaking the auth JWT
 * into a query string. Backend serves the image at
 * {@code /api/v1/employees/:id/profile-image} behind a Bearer token —
 * `<img src>` can't send headers, so the bytes are fetched to a Blob
 * and wrapped in an object URL. Fallback (no image or 404) shows a
 * generic user icon so cards stay layout-stable.
 *
 * In mock mode `employee.profileImage` is already a data URL and is
 * used directly.
 *
 * The fetch, the object URL and its lifetime belong to
 * {@link useProfileImage}'s shared cache: every avatar for the same
 * employee — this photo, the roster table cell, the org-chart node —
 * resolves to one request, and an upload anywhere refreshes them all.
 * That is also why the URL is not revoked when this component
 * unmounts: other avatars may still be rendering it.
 */
interface Props {
  employeeApiId: string | undefined;
  /**
   * The employee's stored image. A data URL in mock mode (rendered
   * as-is); in live mode the storage path, which is used as the
   * "has a photo at all" flag so photo-less rows skip the request
   * instead of logging a 404 each.
   */
  fallbackDataUrl?: string | null;
  alt?: string;
  className?: string;
  /** Icon size for the fallback User glyph. */
  iconClassName?: string;
}

export function EmployeePhoto({
  employeeApiId, fallbackDataUrl, alt = '', className, iconClassName = 'h-6 w-6',
}: Props): JSX.Element {
  const src = useProfileImage(employeeApiId, fallbackDataUrl);

  if (src) {
    return <img src={src} alt={alt} className={className} draggable={false} />;
  }
  return (
    <div className={`${className ?? ''} bg-gray-100 flex items-center justify-center text-gray-400`}>
      <UserIcon className={iconClassName} />
    </div>
  );
}
