import * as React from "react";
import { tokens } from "@repo/theme";

const MOBILE_BREAKPOINT = tokens.breakpoints.md;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );
    const updateIsMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    mediaQuery.addEventListener("change", updateIsMobile);
    updateIsMobile();

    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  return Boolean(isMobile);
}
