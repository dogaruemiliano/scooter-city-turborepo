"use client";

import { v1 } from "@repo/api-shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { webApi } from "../../lib/api";
import { safeNextPath } from "../../lib/safe-next-path";
import { useSession } from "./SessionProvider";

export function useCompleteSignIn(): () => Promise<void> {
  const router = useRouter();
  const destination = safeNextPath(useSearchParams().get("next"));
  const { setUser } = useSession();

  return useCallback(async () => {
    const user = await webApi.fetch(
      v1.auth.ROUTES.me,
      v1.auth.sessionUserSchema,
    );
    setUser(user);
    router.replace(destination);
    router.refresh();
  }, [destination, router, setUser]);
}
