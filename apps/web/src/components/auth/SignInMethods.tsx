"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { localeHeaderName } from "@repo/i18n";
import { Button } from "@repo/ui/components";
import { ArrowLeftIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { webApi } from "../../lib/api";
import { EmailOtpSignInForm } from "./EmailOtpSignInForm";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { OtpChallengeForm } from "./OtpChallengeForm";
import { useCompleteSignIn } from "./useCompleteSignIn";
import { formatAuthError, type AuthErrorState } from "./auth-errors";

type ActiveChallenge =
  | {
      kind: "email";
      challenge: v1.auth.OtpChallengeMetadata;
      email: string;
    }
  | {
      kind: "google";
      challenge: v1.auth.OtpChallengeMetadata;
      idToken: string;
    };

export interface SignInMethodsProps {
  enabledMethods: readonly v1.auth.AuthMethodId[];
  googleClientId?: string;
}

export function SignInMethods({
  enabledMethods,
  googleClientId,
}: SignInMethodsProps) {
  const tSignIn = useTranslations("auth.signIn");
  const tOtp = useTranslations("auth.otp");
  const tGoogle = useTranslations("auth.google");
  const locale = useLocale();
  const completeSignIn = useCompleteSignIn();
  const [activeChallenge, setActiveChallenge] =
    useState<ActiveChallenge | null>(null);
  const challengeHistoryEntry = useRef(false);
  const [methodError, setMethodError] = useState<
    AuthErrorState | "failed" | "expired" | null
  >(null);

  useEffect(() => {
    function handleBrowserBack() {
      challengeHistoryEntry.current = false;
      setActiveChallenge(null);
      setMethodError(null);
    }
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  const beginChallenge = useCallback((challenge: ActiveChallenge) => {
    // Store only the navigation step, never OTP metadata or credentials.
    window.history.pushState(null, "", window.location.href);
    challengeHistoryEntry.current = true;
    setActiveChallenge(challenge);
  }, []);

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setMethodError(null);
      const result = await exchangeGoogleIdToken(idToken, locale);

      if (isChallenge(result)) {
        beginChallenge({
          kind: "google",
          challenge: result,
          idToken,
        });
        return;
      }

      await completeSignIn();
    },
    [beginChallenge, completeSignIn, locale],
  );

  const handleGoogleError = useCallback((error?: unknown) => {
    setMethodError(
      error === undefined
        ? "failed"
        : {
            cause: error,
            unauthorizedMessage: "auth.google.failed",
          },
    );
  }, []);

  const handleCancelChallenge = useCallback(() => {
    if (challengeHistoryEntry.current) {
      challengeHistoryEntry.current = false;
      window.history.back();
    }
    setActiveChallenge(null);
    setMethodError(null);
  }, []);

  if (activeChallenge) {
    const verifyRoute =
      activeChallenge.kind === "email"
        ? v1.auth.ROUTES.emailOtp.verify
        : v1.auth.ROUTES.oauthEmailVerification.verify;
    const subtitle =
      activeChallenge.kind === "email"
        ? tOtp.rich("subtitleEmail", {
            email: activeChallenge.email,
            emailRow: (chunks) => (
              <span className="mt-1 flex flex-wrap items-baseline justify-center gap-x-1">
                {chunks}
              </span>
            ),
            strong: (chunks) => (
              <strong className="font-bold text-foreground">{chunks}</strong>
            ),
          })
        : tOtp("subtitleProvider");

    return (
      <div className="flex flex-col gap-2">
        <header className="flex flex-col gap-4">
          <div data-slot="otp-title-row" className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tOtp("backToMethods")}
              onClick={handleCancelChallenge}
              className="absolute top-4 left-4 shrink-0 rounded-full p-2 sm:top-6 sm:left-6 md:static"
            >
              <ArrowLeftIcon />
            </Button>
            <h1 className="min-w-0 flex-1 text-center text-2xl font-semibold">
              {tOtp("title")}
            </h1>
            <span
              aria-hidden="true"
              className="hidden size-10 shrink-0 md:block"
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {subtitle}
          </p>
        </header>

        <OtpChallengeForm
          key={activeChallenge.challenge.challengeId}
          challenge={activeChallenge.challenge}
          verifyRoute={verifyRoute}
          onChallengeChange={(challenge) =>
            setActiveChallenge((current) =>
              current ? { ...current, challenge } : current,
            )
          }
          onVerified={completeSignIn}
          onRequestAnother={async () => {
            if (activeChallenge.kind === "email") {
              const challenge = await webApi.fetch(
                v1.auth.ROUTES.emailOtp.request,
                v1.auth.emailOtpChallengeSchema,
                {
                  method: "POST",
                  headers: { [localeHeaderName]: locale },
                  json: { email: activeChallenge.email },
                },
              );
              setActiveChallenge({ ...activeChallenge, challenge });
              return;
            }

            try {
              const result = await exchangeGoogleIdToken(
                activeChallenge.idToken,
                locale,
              );
              if (isChallenge(result)) {
                setActiveChallenge({ ...activeChallenge, challenge: result });
                return;
              }
              await completeSignIn();
            } catch (error) {
              if (error instanceof ApiError && error.status === 401) {
                setActiveChallenge(null);
                setMethodError("expired");
                return;
              }
              throw error;
            }
          }}
        />
      </div>
    );
  }

  const emailOtpEnabled = enabledMethods.includes("emailOtp");
  const googleAvailable =
    enabledMethods.includes("google") && Boolean(googleClientId);

  return (
    <div className="flex flex-col gap-2">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">{tSignIn("title")}</h1>
        {emailOtpEnabled && googleAvailable ? (
          <p className="text-sm text-muted-foreground">{tSignIn("subtitle")}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-6">
        {emailOtpEnabled ? (
          <EmailOtpSignInForm
            onChallenge={(challenge, email) => {
              setMethodError(null);
              beginChallenge({ kind: "email", challenge, email });
            }}
          />
        ) : null}

        {googleAvailable && googleClientId ? (
          <div className="flex flex-col gap-2">
            {emailOtpEnabled ? (
              <div className="text-center text-xs uppercase text-muted-foreground">
                {tSignIn("separator")}
              </div>
            ) : null}
            <GoogleSignInButton
              clientId={googleClientId}
              onCredential={handleGoogleCredential}
              onError={handleGoogleError}
            />
          </div>
        ) : null}

        {!emailOtpEnabled && !googleAvailable ? (
          <p className="text-sm text-muted-foreground">
            {tSignIn("unavailable")}
          </p>
        ) : null}

        {methodError ? (
          <p role="alert" className="text-sm text-destructive">
            {typeof methodError === "string"
              ? tGoogle(methodError)
              : formatAuthError(
                  methodError.cause,
                  locale,
                  methodError.unauthorizedMessage,
                )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function exchangeGoogleIdToken(
  idToken: string,
  locale: string,
): Promise<v1.auth.OAuthSignInResult> {
  return webApi.fetch(v1.auth.ROUTES.google, v1.auth.oauthSignInResultSchema, {
    method: "POST",
    headers: { [localeHeaderName]: locale },
    json: { idToken },
  });
}

function isChallenge(
  result: v1.auth.OAuthSignInResult,
): result is v1.auth.OAuthEmailVerificationRequired {
  return "status" in result && result.status === "verification_required";
}
