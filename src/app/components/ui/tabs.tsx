"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "./utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      // Underline-style tab row — one horizontal rule, triggers sit
      // on it and each active one draws a 2px blue segment under
      // its label. Replaces the earlier pill/rounded look.
      //
      // v-mobile-no-horizontal-scroll — `max-w-full overflow-x-auto`
      // caps the tab strip at parent width and scrolls internally
      // when the trigger set is wider than the viewport (a 5-tab
      // strip on a 375px phone otherwise forced the whole page to
      // scroll sideways).
      className={cn(
        "flex items-center gap-1 border-b border-slate-200 max-w-full overflow-x-auto",
        // Hide the horizontal scrollbar chrome (Windows arrows,
        // WebKit thumb, Firefox track). The list still scrolls
        // sideways with wheel + swipe — we're only suppressing the
        // visible scrollbar that showed up as tiny ▲▼ arrows to
        // the right of the tab strip.
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      // Underline-only trigger: no pill background. Active state
      // paints a REAL CSS text-decoration underline (not a border
      // under the whole trigger box) so the line hugs the label
      // glyphs and doesn't extend into the icon slot or the
      // trigger's horizontal padding. `no-underline` on the base
      // + `underline` on data-[state=active] keeps siblings clean.
      // The `[&_svg]` selectors below strip any decoration that
      // would otherwise leak onto the icon on some browsers.
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 h-9 text-sm transition-colors",
        "text-gray-600 no-underline hover:text-gray-900",
        "data-[state=active]:text-blue-700 data-[state=active]:font-medium",
        "data-[state=active]:underline data-[state=active]:decoration-blue-500 data-[state=active]:decoration-2 data-[state=active]:underline-offset-8",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:no-underline [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
