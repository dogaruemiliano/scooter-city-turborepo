"use client";

import { configureAuthAdapter } from "@repo/api-shared";
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
