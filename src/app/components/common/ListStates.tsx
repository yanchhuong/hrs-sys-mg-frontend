/**
 * The empty / error states under a list or table, shared so every page
 * behaves like Invoices:
 *
 *   loading, no rows yet → the caller renders TableRowsSkeleton / TableBodySkeletonRows
 *   load failed          → <ListError message onRetry/>   (icon + text + Retry)
 *   nothing to show      → <ListEmpty noun filtered/>     ("No X yet." / "No X match your filters.")
 *
 * Both come in a block form and a table-row form (`colSpan`), so they
 * drop into a Card body or a <TableBody> without extra markup.
 */
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { TableCell, TableRow } from '../ui/table';

function Wrap({ colSpan, children }: { colSpan?: number; children: React.ReactNode }) {
  if (colSpan) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="py-8 text-center">{children}</TableCell>
      </TableRow>
    );
  }
  return <div className="py-8 text-center">{children}</div>;
}

/** "No invoices yet." — or, when a search/filter is active, "No invoices match your filters." */
export function ListEmpty({ noun, filtered, colSpan, children }: {
  /** Plural noun, e.g. "invoices". */
  noun: string;
  /** True when any search, filter or date range is narrowing the list. */
  filtered?: boolean;
  colSpan?: number;
  /** Optional extra content (e.g. a "Create the first one" button). */
  children?: React.ReactNode;
}) {
  return (
    <Wrap colSpan={colSpan}>
      <p className="text-sm text-gray-500">
        {filtered ? `No ${noun} match your filters.` : `No ${noun} yet.`}
      </p>
      {children}
    </Wrap>
  );
}

/** A load failure with a Retry button — never a silent empty list. */
export function ListError({ message, onRetry, colSpan }: {
  message?: string;
  onRetry?: () => void;
  colSpan?: number;
}) {
  return (
    <Wrap colSpan={colSpan}>
      <div className="inline-flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>{message || 'Could not load this list.'}</span>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    </Wrap>
  );
}
