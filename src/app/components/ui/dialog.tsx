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
        {children}
        {!hideClose && (
          // v-dialog-close-mobile — the built-in X used to be
          // absolute+plain and drifted / overlapped adjacent action
          // buttons on narrow mobile viewports (see Invoice detail
          // screenshot: X ended up on the LEFT of Print/Send/Void).
          // Same top:4 right:4 anchor as before, but:
          //   • z-50 keeps it above any overflowing header content
          //   • bg-background rounded-full padded circle gives it a
          //     tap-target hit area + guarantees the icon is
          //     readable against any content behind it
          //   • ring-1 border-line so the pill reads as a control
          //     even on dark screenshots
          //   • h-8 w-8 makes it a proper 32 px touch target on
          //     phones (was ~16 px with no padding — below Apple
          //     HIG's 44 px suggestion but at least visible)
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-3 right-3 z-50 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background ring-1 ring-border opacity-80 transition hover:opacity-100 hover:bg-accent focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
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
