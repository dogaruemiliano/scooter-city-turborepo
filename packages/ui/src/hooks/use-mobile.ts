import * as React from "react";
import { tokens } from "@repo/theme";

const MOBILE_BREAKPOINT = tokens.breakpoints.md;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const updateIsMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    mediaQuery.addEventListener("change", updateIsMobile);
    updateIsMobile();

    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, [breakpoint]);

  return Boolean(isMobile);
}
