import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Employee } from '../../types/hrms';
import { useProfileImage } from '../../hooks/useProfileImage';

interface Props {
  employee: Pick<Employee, 'name' | 'profileImage' | 'apiId'> | undefined | null;
  /** Sizing / shape for the avatar box, e.g. "h-9 w-9" or "h-7 w-7 rounded-full". */
  className?: string;
  /** Tone for the initial shown when there is no photo. */
  fallbackClassName?: string;
  /** Applied to the <img> — pass the same rounding as `className`. */
  imageClassName?: string;
  title?: string;
}

/**
 * Employee avatar: their uploaded photo when one exists, their first
 * initial otherwise.
 *
 * A component rather than a helper because the photo arrives through
 * {@link useProfileImage}, and several call sites (the org-chart card
 * and tree row) build their avatar inside plain render helpers where a
 * hook cannot be called.
 *
 * Shape is left entirely to the caller so this drops into the square
 * table cells and the round org-chart nodes without either having to
 * fight a default.
 */
export function EmployeeAvatar({
  employee, className, fallbackClassName, imageClassName, title,
}: Props): JSX.Element {
  const photo = useProfileImage(employee?.apiId, employee?.profileImage);
  return (
    <Avatar className={className} title={title}>
      <AvatarImage src={photo} className={`object-cover ${imageClassName ?? ''}`} />
      <AvatarFallback className={fallbackClassName}>
        {(employee?.name || '?').slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
