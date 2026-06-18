import { v1 } from "@repo/api-shared";
import { redirect } from "next/navigation";

import { webApi } from "../../../lib/api";
import { activeSessionsFromApi, meFromApi } from "../../../lib/auth-server";
import { AccountSettings } from "./AccountSettings";

export default async function AccountSettingsPage() {
  const [user, sessions, enabledMethods] = await Promise.all([
    meFromApi(),
    activeSessionsFromApi(),
    webApi.fetch(
      v1.auth.ROUTES.enabledMethods,
      v1.auth.enabledAuthMethodsSchema,
      { cache: "no-store" },
    ),
  ]);

  if (!user || !sessions) {
    redirect("/sign-in");
  }

  return (
    <AccountSettings
      initialUser={user}
      initialSessions={sessions}
      enabledMethods={enabledMethods.methods}
    />
  );
}
