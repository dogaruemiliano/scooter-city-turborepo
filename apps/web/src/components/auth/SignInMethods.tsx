"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { webApi } from "../../lib/api";
import { EmailOtpSignInForm } from "./EmailOtpSignInForm";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { OtpChallengeForm } from "./OtpChallengeForm";
import { useCompleteSignIn } from "./useCompleteSignIn";

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
  const completeSignIn = useCompleteSignIn();
  const [activeChallenge, setActiveChallenge] =
    useState<ActiveChallenge | null>(null);
  const [methodError, setMethodError] = useState<string | null>(null);

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setMethodError(null);
      const result = await exchangeGoogleIdToken(idToken);

      if (isChallenge(result)) {
        setActiveChallenge({
          kind: "google",
          challenge: result,
          idToken,
        });
        return;
      }

      await completeSignIn();
    },
    [completeSignIn],
  );

  const handleGoogleError = useCallback(() => {
    setMethodError(tGoogle("failed"));
  }, [tGoogle]);

  if (activeChallenge) {
    const verifyRoute =
      activeChallenge.kind === "email"
        ? v1.auth.ROUTES.emailOtp.verify
        : v1.auth.ROUTES.oauthEmailVerification.verify;
    const description =
      activeChallenge.kind === "email"
        ? tOtp("codeSentTo", { email: activeChallenge.email })
        : tOtp("emailVerificationRequired");

    return (
      <OtpChallengeForm
        key={activeChallenge.challenge.challengeId}
        challenge={activeChallenge.challenge}
        description={description}
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
                json: { email: activeChallenge.email },
              },
            );
            setActiveChallenge({ ...activeChallenge, challenge });
            return;
          }

          try {
            const result = await exchangeGoogleIdToken(activeChallenge.idToken);
            if (isChallenge(result)) {
              setActiveChallenge({ ...activeChallenge, challenge: result });
              return;
            }
            await completeSignIn();
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              setActiveChallenge(null);
              setMethodError(tGoogle("expired"));
              return;
            }
            throw error;
          }
        }}
        onCancel={() => {
          setActiveChallenge(null);
          setMethodError(null);
        }}
      />
    );
  }

  const emailOtpEnabled = enabledMethods.includes("emailOtp");
  const googleAvailable =
    enabledMethods.includes("google") && Boolean(googleClientId);

  return (
    <div className="flex flex-col gap-6">
      {emailOtpEnabled ? (
        <EmailOtpSignInForm
          onChallenge={(challenge, email) => {
            setMethodError(null);
            setActiveChallenge({ kind: "email", challenge, email });
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
          {methodError}
        </p>
      ) : null}
    </div>
  );
}

async function exchangeGoogleIdToken(
  idToken: string,
): Promise<v1.auth.OAuthSignInResult> {
  return webApi.fetch(v1.auth.ROUTES.google, v1.auth.oauthSignInResultSchema, {
    method: "POST",
    json: { idToken },
  });
}

function isChallenge(
  result: v1.auth.OAuthSignInResult,
): result is v1.auth.OAuthEmailVerificationRequired {
  return "status" in result && result.status === "verification_required";
}
