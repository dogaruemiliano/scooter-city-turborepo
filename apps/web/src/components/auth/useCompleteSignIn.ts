"use client";

import { v1 } from "@repo/api-shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { getLocaleFromPathname, localizePath } from "../../i18n/paths";
import { webApi } from "../../lib/api";
import { toSessionIdentity } from "../../lib/auth-types";
import { safeNextPath } from "../../lib/safe-next-path";
import { useSession } from "./SessionProvider";

export function useCompleteSignIn(): () => Promise<void> {
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const destination = safeNextPath(
    useSearchParams().get("next"),
    localizePath("/", locale),
  );
  const { setUser } = useSession();

  return useCallback(async () => {
    const user = await webApi.fetch(
      v1.auth.ROUTES.me,
      v1.auth.sessionUserSchema,
    );
    setUser(toSessionIdentity(user));
    router.replace(destination);
    router.refresh();
  }, [destination, router, setUser]);
}
