import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Read the current viewport width synchronously on the first render.
 * Previously the hook initialised at `undefined` and let useEffect
 * settle the value post-mount — that meant every consumer flashed
 * the desktop layout for one paint before flipping to mobile, and
 * on components that mount into a portal (Popover / Dialog
 * branching on `isMobile`) the wrong variant appeared briefly and
 * left the panel positioned as if it were desktop. Reading
 * `window.innerWidth` inside useState's initialiser gives every
 * consumer the correct value on the FIRST render.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
