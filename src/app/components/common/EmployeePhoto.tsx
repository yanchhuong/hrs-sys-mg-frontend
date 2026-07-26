import { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import { fetchProfileImageBlobUrl } from '../../api/documents';
import { USE_MOCKS } from '../../api/client';

/**
 * Render an employee's profile photo without leaking the auth JWT
 * into a query string. Backend serves the image at
 * {@code /api/v1/employees/:id/profile-image} behind a Bearer token —
 * `<img src>` can't send headers, so we fetch to a Blob, wrap it in
 * an object URL, and render that. Fallback (no image or 404) shows a
 * generic user icon so cards stay layout-stable.
 *
 * In mock mode `employee.profileImage` is already a data URL — we
 * short-circuit and use it directly.
 *
 * The blob URL is revoked on unmount or when the employee changes,
 * so switching between many cards doesn't leak memory.
 *
 * `version` lets callers force a refetch after an upload without
 * remounting the component — bump the number and the effect will
 * fetch the fresh image.
 */
interface Props {
  employeeApiId: string | undefined;
  /** Data URL fallback (mock mode). Ignored when apiId is set + live. */
  fallbackDataUrl?: string | null;
  /** Bump to force a fresh fetch after an upload. */
  version?: number | string;
  alt?: string;
  className?: string;
  /** Icon size for the fallback User glyph. */
  iconClassName?: string;
}

export function EmployeePhoto({
  employeeApiId, fallbackDataUrl, version, alt = '', className, iconClassName = 'h-6 w-6',
}: Props): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (USE_MOCKS) {
      setSrc(fallbackDataUrl || null);
      return;
    }
    if (!employeeApiId) { setSrc(null); return; }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchProfileImageBlobUrl(employeeApiId)
      .then(url => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employeeApiId, fallbackDataUrl, version]);

  if (src) {
    return <img src={src} alt={alt} className={className} draggable={false} />;
  }
  return (
    <div className={`${className ?? ''} bg-gray-100 flex items-center justify-center text-gray-400`}>
      <UserIcon className={iconClassName} />
    </div>
  );
}
