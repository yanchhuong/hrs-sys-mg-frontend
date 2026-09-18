"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "./utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentProps<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
});

DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  // Opt-in `hideClose` for dialogs that only need the footer's
  // explicit Cancel / Save affordance and shouldn't render the top-
  // right X (e.g. row-level Upload Image / Modifier Groups / Increase
  // Stock — the X visually overlapped long Khmer / Chinese titles).
  // Defaults to false so every existing dialog keeps its X.
  React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose = false, ...props }, ref) => {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          // v-dialog-responsive-scroll — added max-h + overflow so
          // long dialog bodies (Department form, PayWay settings,
          // Encounter editor, …) scroll internally on short viewports
          // instead of clipping below the fold. Dialogs that manage
          // their own scroll region (e.g. EmployeeSettingsDialog with
          // `flex flex-col` + inner overflow-y-auto) still work
          // because their own tighter max-height wins first.
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {!hideClose && (
          // v-dialog-close-frameless — ONE close affordance, drawn the same
          // way everywhere: a bare X, no frame.
          //
          // FRAMELESS. v-dialog-close-mobile had given this a
          // `bg-background rounded-full ring-1 ring-border` pill to fix an X
          // that drifted into the Print/Send/Void row on narrow viewports.
          // The pill fixed the collision but left the app with two
          // different-looking X's — a CIRCLE here, a RECTANGLE on dialogs
          // drawing their own outline Button. Dropped: bg-background, the
          // ring and the pill. Kept: h-8 w-8 (a 32 px touch target; the glyph
          // alone is 16 px) and z-50 (above overflowing header content).
          // rounded-md survives only so the hover tint is not a circle.
          // Trade-off: with no bg-background, content scrolling UNDER the
          // button shows through behind the glyph. Fix that on the offending
          // dialog with top padding — not by restoring the pill, which is
          // what broke consistency.
          //
          // POSITIONING: `absolute`, deliberately, and it must stay that way.
          //
          // A sticky variant was tried to stop the X scrolling away on
          // dialogs tall enough to scroll (DialogContent is BOTH the scroll
          // container and the positioning parent, so an absolute child
          // scrolls with the content). It has to be reverted: sticky offsets
          // are measured from the scrollport, so any wrapper that pins the
          // button correctly under this component's own `p-6` / `gap-4` is
          // wrong for the 55+ dialogs that pass `p-0 gap-0` — there the
          // button lands at -12px and is clipped off the top edge. `absolute
          // top-3 right-3` resolves against the padding box, so it is
          // padding-agnostic and correct for every caller.
          //
          // The scroll-away problem is real but is NOT fixable here. Fix it
          // per dialog, using the pattern ~55 dialogs in this app already
          // use: `flex flex-col` on DialogContent with an inner
          // `overflow-y-auto` body, so the FRAME stops scrolling and this
          // button stays pinned to it.
          // RED. The glyph carries the colour itself rather than leaning on
          // the old opacity-70 → 100 fade: at 70% a red reads washed-out
          // pink, so the states are expressed as red-600 → red-700 and the
          // hover tint moves from the neutral accent to red-50 to match.
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-3 right-3 z-50 inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // v-dialog-header-min-w-0 — DialogContent uses `grid`, which gives
      // its children an implicit `min-width: auto` (content-driven).
      // Without `min-w-0` on the header, a long title (e.g. Items page's
      // Increase Stock — {long name}) overflows past the modal's
      // max-width and the built-in `truncate` on the title's inner span
      // can never take effect. Also add `overflow-hidden` so anything
      // else placed in the header (e.g. a badge row) can't push the
      // header wider than the content column either.
      className={cn("flex flex-col gap-2 text-center sm:text-left min-w-0 overflow-hidden", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
