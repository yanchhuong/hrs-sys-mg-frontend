import { UserRound } from 'lucide-react';

interface Props {
  /** Display name of the user who created the document. */
  createdBy?: string | null;
  /** Display name of the user who last saved the document. */
  updatedBy?: string | null;
  /** Table-row variant: "by X · edited by Y", no icon. */
  compact?: boolean;
  className?: string;
}

/**
 * Quiet "Created by … · Edited by …" line shown under a document's issue
 * date on Invoices / Bills / Receipts / Quotations / Vouchers (list rows
 * use `compact`, detail dialogs the full wording). Renders nothing when
 * neither name is known; the modifier is hidden when it equals the creator.
 */
export function DocAuditLine({ createdBy, updatedBy, compact, className }: Props) {
  const creator = createdBy?.trim() || '';
  const modifier = updatedBy?.trim() || '';
  if (!creator && !modifier) return null;
  const showModifier = !!modifier && modifier !== creator;

  // Full sentence — always used for the hover title.
  const full = creator
    ? `Created by ${creator}${showModifier ? ` · Edited by ${modifier}` : ''}`
    : `Edited by ${modifier}`;
  const text = !compact
    ? full
    : creator
      ? `by ${creator}${showModifier ? ` · edited by ${modifier}` : ''}`
      : `edited by ${modifier}`;

  return (
    <div
      className={`flex items-center gap-1 min-w-0 text-[11px] leading-tight text-gray-500 ${className ?? ''}`}
      title={full}
    >
      {!compact && <UserRound className="h-3 w-3 shrink-0" />}
      <span className="truncate">{text}</span>
    </div>
  );
}
