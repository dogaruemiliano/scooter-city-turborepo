"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { getUnprefixedPathname } from "@/i18n/paths";

const PreviousScooterPathnameContext = createContext<string | null>(null);

/** Persists across list, detail and form routes within the scooters section. */
export function ScooterNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = getUnprefixedPathname(usePathname());
  const [navigation, setNavigation] = useState<{
    current: string;
    previous: string | null;
  }>({ current: pathname, previous: null });

  if (navigation.current !== pathname) {
    setNavigation({ current: pathname, previous: navigation.current });
  }

  return (
    <PreviousScooterPathnameContext.Provider value={navigation.previous}>
      {children}
    </PreviousScooterPathnameContext.Provider>
  );
}

export function usePreviousScooterPathname() {
  return useContext(PreviousScooterPathnameContext);
}
