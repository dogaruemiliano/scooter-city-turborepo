"use client";

import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

export const PageTitleOverrideContext = createContext<Dispatch<
  SetStateAction<string | null>
> | null>(null);

export function PageTitleOverride({ title }: { title: string }) {
  const setPageTitleOverride = useContext(PageTitleOverrideContext);

  useEffect(() => {
    if (!setPageTitleOverride) {
      return;
    }

    setPageTitleOverride(title);
    return () => setPageTitleOverride(null);
  }, [setPageTitleOverride, title]);

  return null;
}
