import { v1 } from "@repo/api-shared";
import { redirect } from "next/navigation";

import { SignInMethods } from "../../components/auth";
import { webApi } from "../../lib/api";
import { meOnServer } from "../../lib/auth-server";
import { safeNextPath } from "../../lib/safe-next-path";

interface SignInPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Sign-in landing. Lists every enabled auth method (gated by the API's
 * `/enabled-methods` endpoint, cached 1h via Next's data cache).
 *
 * If the user is already signed in, redirect to `next` (or `/`).
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { next } = await searchParams;
  const destination = safeNextPath(next);
  const existing = await meOnServer();
  if (existing) redirect(destination);

  const { methods } = await webApi.fetch(
    v1.auth.ROUTES.enabledMethods,
    v1.auth.enabledAuthMethodsSchema,
    { next: { revalidate: 3600 } },
  );

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <main className="flex w-full flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Choose a method to continue.
          </p>
        </header>

        <SignInMethods
          enabledMethods={methods}
          googleClientId={googleClientId}
        />
      </div>
    </main>
  );
}
