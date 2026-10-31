"use client";

import * as React from "react";

import { cn } from "./utils";
import { startDragPan } from "../../utils/dragPan";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const wrapRef = React.useRef<HTMLDivElement>(null);

  /**
   * v-table-header-drag-pan — hold-press on the header row and drag
   * left / right to pan a wide table without touching the scrollbar
   * (which is hidden until hover by the global CSS rule). Only fires
   * when the mousedown lands inside a `<th>` — body clicks stay
   * available for inline edits, action buttons, and row selection.
   *
   * The wrapper's `scrollLeft` is driven directly, so the pan works
   * with any browser's scroll behaviour and respects the existing
   * momentum scroll on touch devices (which use the native scroll
   * path, not this handler). Interactive elements inside a header
   * (sort chevrons, filter icons) opt out via a closest() check so
   * a header button click doesn't turn into a drag.
   */
  const onMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const th = target.closest('th');
    if (!th) return;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    const own = wrapRef.current;
    if (!own) return;
    // Inside a .list-table shell the shell is the scroller (both axes —
    // see styles/index.css), so pan that; elsewhere this wrapper.
    // The selector matches the CSS rule exactly, `:not` included: a
    // .list-table-flow shell is overflow:visible, so it can report
    // scrollWidth > clientWidth while its scrollLeft stays nailed to
    // 0, and panning it would do nothing at all.
    const shell = own.closest('.list-table:not(.list-table-flow)') as HTMLDivElement | null;
    const wrap = shell && shell.scrollWidth > shell.clientWidth + 1 ? shell : own;
    // Nothing to pan when the table already fits — skip and let the
    // click land normally so header clicks (sort etc) still work.
    if (wrap.scrollWidth <= wrap.clientWidth + 1) return;
    startDragPan(e, wrap);
  }, []);

  return (
    <div
      ref={wrapRef}
      data-slot="table-container"
      // Horizontal scrollbar chrome is hidden until hover by the
      // global .overflow-x-auto rule in styles/index.css. When the
      // table overflows, the header row also acts as a drag handle
      // — see onMouseDown above.
      className="relative w-full overflow-x-auto"
      onMouseDown={onMouseDown}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // v-table-header-bg — subtle gray band on every list table
      // header (Items, Members, Payment History, Vendors, Invoices,
      // …) so column labels sit visually apart from row data. The
      // `[&_tr:hover]:bg-transparent` override neutralises
      // TableRow's built-in hover:bg-muted/50 — the header should
      // not react to hover the way body rows do.
      className={cn(
        "bg-gray-50 [&_tr]:border-b [&_tr:hover]:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      // `cursor-grab` is a passive hint that the header is drag-pan
      // enabled (see the Table wrapper's onMouseDown). It shows on
      // every table; harmless on narrow tables where the wrapper's
      // scrollWidth check no-ops the drag.
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap cursor-grab select-none [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

/**
 * ListTable — the shell every list page's table sits in.
 *
 * A bordered box that scrolls its own rows with the column headers
 * pinned to the top, so they stay readable on a long list instead of
 * scrolling off with the page. See `.list-table` in styles/index.css
 * for the rules, including the sticky header, which is applied by
 * descendant selector so a call site cannot forget it.
 *
 * Use this for a list of records. A table inside a dialog, a
 * calculator breakdown, an invoice line-item editor or a print
 * layout is not a list — those keep a bare {@link Table}, since a
 * viewport-height scroll box makes no sense in a modal.
 *
 * `className` lands on the box, so a screen with taller chrome above
 * the table can pass its own height:
 * `<ListTable className="max-h-[60vh]">`. `tableClassName` lands on
 * the `<table>` instead — that is where cell-level utilities such as
 * `text-xs [&_td]:px-2` have to go to reach the rows.
 */
function ListTable({
  className,
  tableClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & { tableClassName?: string }) {
  return (
    <div className={cn("list-table", className)} {...props}>
      <Table className={tableClassName}>{children}</Table>
    </div>
  );
}

export {
  ListTable,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
