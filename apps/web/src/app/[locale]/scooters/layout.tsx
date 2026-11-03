import type { ReactNode } from "react";

import { ScooterNavigationProvider } from "./_components/ScooterNavigation";

export default function ScootersLayout({ children }: { children: ReactNode }) {
  return <ScooterNavigationProvider>{children}</ScooterNavigationProvider>;
}
