"use client";

import { ApiError, configureAuthAdapter, v1 } from "@repo/api-shared";
import { isSignInPathname } from "@/i18n/paths";
import { usePathname } from "next/navigation";
import { webApi } from "@/lib/api";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { webAuthAdapter } from "../../lib/auth-adapter-web";
import type { SessionIdentity } from "../../lib/auth-types";

interface SessionContextValue {
  user: SessionIdentity | null;
  setUser: (user: SessionIdentity | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  /** Hydrated from RSC via `meOnServer()` so the first paint already has the user. */
  initialUser: SessionIdentity | null;
  children: ReactNode;
}

export function SessionProvider({
  initialUser,
  children,
}: SessionProviderProps) {
  const [user, setUser] = useState<SessionIdentity | null>(initialUser);
  const pathname = usePathname();

  useEffect(() => {
    if (isSignInPathname(pathname)) return;
    let cancelled = false;
    async function refreshCapabilities() {
      try {
        const current = await webApi.fetch(
          v1.auth.ROUTES.me,
          v1.auth.sessionUserSchema,
          { cache: "no-store" },
        );
        if (!cancelled) setUser(current);
      } catch (error) {
        if (
          !cancelled &&
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        )
          setUser(null);
      }
    }
    void refreshCapabilities();
    window.addEventListener("focus", refreshCapabilities);
    window.addEventListener("access-changed", refreshCapabilities);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshCapabilities);
      window.removeEventListener("access-changed", refreshCapabilities);
    };
  }, [pathname]);

  // Install the cookie-based auth adapter once for the lifetime of the
  // browser session. Any `webApi.fetch` from a Client Component will route
  // 401s through `webAuthAdapter.refresh` (singleflight-protected).
  useEffect(() => {
    configureAuthAdapter(webAuthAdapter);
    return () => configureAuthAdapter(null);
  }, []);

  const value = useMemo(() => ({ user, setUser }), [user]);
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}

/** Shared read-only controls can also render outside an authenticated shell. */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}
