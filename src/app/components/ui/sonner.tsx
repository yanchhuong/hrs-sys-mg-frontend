"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

/**
 * App-wide toast theming.
 *
 * `richColors` flips Sonner into its semantic-color mode so:
 *   • toast.success → green
 *   • toast.error   → red
 *   • toast.warning → amber / orange (used for client-side validation)
 *   • toast.info    → blue
 *
 * Anywhere in the app, use `notify` from `utils/notify` for the canonical
 * helpers, or keep calling `toast.success` / `toast.error` / `toast.warning`
 * directly — both render with the same colors.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      richColors
      closeButton
      position="top-right"
      duration={4000}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
