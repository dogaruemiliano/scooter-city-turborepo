"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PullToRefresh } from "@repo/ui/components/pull-to-refresh";

type RefreshOptions = {
  /** All request activity; the indicator opens only for an explicit refresh. */
  refreshing: boolean;
  disabled?: boolean;
  enabled?: boolean;
  /** Related data joins a page refresh without enabling it on other screens. */
  contributor?: boolean;
};
type Registration = RefreshOptions & { onRefresh: () => void };
const PageRefreshContext = createContext<
  ((registration: Registration) => () => void) | null
>(null);

/** Opt a screen (or one of its data sources) into the shell's mobile refresh. */
export function usePageRefresh(
  onRefresh: () => void,
  {
    refreshing,
    disabled = false,
    enabled = true,
    contributor = false,
  }: RefreshOptions,
) {
  const register = useContext(PageRefreshContext);
  const callback = useRef(onRefresh);
  useLayoutEffect(() => {
    callback.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    if (!enabled || !register) return;
    return register({
      onRefresh: () => callback.current(),
      refreshing,
      disabled,
      contributor,
    });
  }, [register, enabled, refreshing, disabled, contributor]);
}

/** Server data refreshes in a transition; unaffected client state is retained. */
export function useRoutePageRefresh(disabled = false) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  usePageRefresh(() => startTransition(() => router.refresh()), {
    refreshing,
    disabled,
  });
}

export function PageRefreshSurface({ children }: { children: ReactNode }) {
  const t = useTranslations("shared.pullToRefresh");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const register = useCallback((registration: Registration) => {
    setRegistrations((previous) => [...previous, registration]);
    return () =>
      setRegistrations((previous) =>
        previous.filter((entry) => entry !== registration),
      );
  }, []);
  return (
    <PageRefreshContext.Provider value={register}>
      <PullToRefresh
        data-slot="app-page-content"
        className="pb-[calc(var(--spacing-screen-bottom)+env(safe-area-inset-bottom))]"
        enabled={registrations.some((entry) => !entry.contributor)}
        refreshing={registrations.some((entry) => entry.refreshing)}
        disabled={registrations.some((entry) => entry.disabled)}
        onRefresh={() => {
          for (const entry of registrations) entry.onRefresh();
        }}
        labels={{
          pull: t("pull"),
          release: t("release"),
          refreshing: t("refreshing"),
          refresh: t("refresh"),
        }}
      >
        {children}
      </PullToRefresh>
    </PageRefreshContext.Provider>
  );
}
