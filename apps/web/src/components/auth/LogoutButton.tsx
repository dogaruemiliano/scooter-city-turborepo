"use client";

import { v1 } from "@repo/api-shared";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { z } from "zod";

import { useSession } from "./SessionProvider";
import {
  getLocalizedSignInPath,
  getLocaleFromPathname,
} from "../../i18n/paths";
import { webApi } from "../../lib/api";

export interface LogoutButtonProps {
  children?: ReactNode;
  className?: string;
}

export function useLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await webApi.fetch(v1.auth.ROUTES.logout, z.void(), { method: "POST" });
    } finally {
      setUser(null);
      router.refresh();
      router.push(getLocalizedSignInPath(getLocaleFromPathname(pathname)));
      setBusy(false);
    }
  }

  return { busy, logout };
}

export function LogoutButton({
  children = "Sign out",
  className,
}: LogoutButtonProps) {
  const { busy, logout } = useLogout();

  return (
    <Button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      variant="outline"
      size="sm"
      className={className}
    >
      {busy ? "Signing out…" : children}
    </Button>
  );
}
