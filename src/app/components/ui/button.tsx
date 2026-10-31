import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  // cursor-pointer: browsers default <button> to `cursor: default` (arrow).
  // Force pointer for the whole app so every actionable button reads as
  // clickable on hover. `disabled:pointer-events-none` already suppresses
  // hover styles when disabled, so the arrow returns for those.
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * Click lock shared by <Button> and <PlainButton>. When onClick returns a
 * promise (an async handler, or `() => save()`), the button disables
 * itself until that promise settles, so a double-click can't run the
 * action twice (e.g. two overlapping permission saves). Sync handlers are
 * untouched. A handler written as `() => void save()` returns nothing, so
 * it can't be locked — return the promise instead.
 */
function usePendingClick(onClick?: React.MouseEventHandler<HTMLButtonElement>) {
  const [pending, setPending] = React.useState(false);
  // The ref blocks a second click that lands before React re-renders
  // the button as disabled.
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy.current) { e.preventDefault(); return; }
    const result: unknown = onClick?.(e);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      busy.current = true;
      setPending(true);
      const done = () => {
        busy.current = false;
        if (mounted.current) setPending(false);
      };
      // Re-throw so a failed action still reports like it did before.
      (result as PromiseLike<unknown>).then(done, (err) => { done(); throw err; });
    }
  }, [onClick]);

  return { pending, onClick: onClick ? handleClick : undefined };
}

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, onClick, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  const click = usePendingClick(onClick);

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || click.pending}
      aria-busy={click.pending || undefined}
      onClick={click.onClick}
      {...props}
    />
  );
});

Button.displayName = "Button";

/**
 * Unstyled <button> with the same click lock, for custom-styled buttons
 * that can't take buttonVariants. Dims + shows a wait cursor while
 * pending, since custom classes often don't style :disabled.
 */
const PlainButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className, onClick, disabled, ...props }, ref) => {
    const click = usePendingClick(onClick);
    return (
      <button
        ref={ref}
        className={cn(className, click.pending && "opacity-60 cursor-wait")}
        disabled={disabled || click.pending}
        aria-busy={click.pending || undefined}
        onClick={click.onClick}
        {...props}
      />
    );
  },
);

PlainButton.displayName = "PlainButton";

export { Button, PlainButton, buttonVariants };
