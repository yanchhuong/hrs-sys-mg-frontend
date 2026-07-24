import { Skeleton } from '../ui/skeleton';
import { TableCell, TableRow } from '../ui/table';

/**
 * Content-shaped loading placeholders shared across list / grid pages.
 *
 * <p>Every page that used to render "Loading foo…" text now imports one
 * of these instead — the skeleton mirrors the real content geometry so
 * nothing shifts when data arrives. Pattern is: shadcn's {@code Skeleton}
 * primitive ({@code bg-accent animate-pulse rounded-md}) composed into
 * the same row / tile shape the page eventually renders.</p>
 *
 * <p>Keep each skeleton close to its callers' typical dimensions —
 * exact column widths don't matter, but the row height / tile aspect
 * should match so the fold position stays stable.</p>
 */

/** Table rows placeholder. Drop-in for pages that render a shadcn
 *  {@code <Table>} — pass the same number of columns as the real header
 *  so the visual weight lines up. Renders {@code rows} pseudo-rows. */
export function TableRowsSkeleton({
  rows = 8,
  columns = 6,
  hasThumbnail = false,
}: {
  rows?: number;
  /** Number of "cell" placeholders per row. Tune to the real header. */
  columns?: number;
  /** When true, the second cell renders a square (photo) instead of a
   *  bar — matches Items / Employees / Customers tables that show an
   *  avatar or thumbnail column. */
  hasThumbnail?: boolean;
}) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-3">
          {Array.from({ length: columns }).map((_, c) => {
            // Second cell renders as a photo square when the caller
            // opted in — otherwise every cell is a horizontal bar of
            // varying widths so the row reads like real tabular data
            // and not a rigid grid.
            if (hasThumbnail && c === 1) {
              return <Skeleton key={c} className="h-10 w-10 rounded-md shrink-0" />;
            }
            // Slight width variation across cells — mimics the natural
            // shape of a data row (short id, wide name, medium status).
            const widths = ['w-20', 'w-40', 'w-24', 'w-16', 'w-20', 'w-14', 'w-12'];
            const w = widths[c % widths.length];
            return <Skeleton key={c} className={`h-4 ${w} shrink-0`} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Skeleton rows that live INSIDE a shadcn {@code <TableBody>}. Use
 *  this variant when the caller renders its own {@code <Table>} +
 *  {@code <TableHeader>} above (so the header widths line up with the
 *  real columns) and just wants placeholder rows before the data
 *  arrives. Pass the SAME column count as the real header. */
export function TableBodySkeletonRows({
  rows = 6,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: columns }).map((_, c) => {
            const widths = ['w-20', 'w-40', 'w-24', 'w-16', 'w-20', 'w-14', 'w-12'];
            const w = widths[c % widths.length];
            return (
              <TableCell key={c}>
                <Skeleton className={`h-4 ${w}`} />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

/** Tile grid placeholder. Drop-in for pages that render a card grid
 *  (POS items, Shop menu, Warehouse tiles). Each tile is a square
 *  cover + name line + optional price line — matches the shape POS /
 *  Shop render for real items so the grid's fold stays put. */
export function TileGridSkeleton({
  tiles = 12,
  showPrice = true,
  className,
}: {
  tiles?: number;
  showPrice?: boolean;
  /** Override the grid columns when the caller's viewport uses a
   *  different responsive stepping than POS's 3/3/3/4/4. */
  className?: string;
}) {
  const gridCls =
    className
    ?? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3';
  return (
    <div className={gridCls}>
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-white overflow-hidden">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="p-2 space-y-2">
            <Skeleton className="h-3.5 w-4/5" />
            {showPrice && (
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-3 w-8" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat-cards placeholder. Drop-in for pages whose landing row is
 *  a strip of KPI tiles (Attendance summary, Dashboard, Payroll). */
export function StatCardsSkeleton({
  cards = 6,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  const gridCls =
    className
    ?? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3';
  return (
    <div className={gridCls}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="h-8 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Form section placeholder. Drop-in for settings dialogs / edit
 *  forms with several rows of labeled inputs. */
export function FormFieldsSkeleton({
  rows = 4,
}: {
  rows?: number;
}) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
