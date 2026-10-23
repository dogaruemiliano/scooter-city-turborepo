"use client";

import { v1 } from "@repo/api-shared";
import { localeHeaderName } from "@repo/i18n";
import { tokens } from "@repo/theme/runtime";
import { Button, Label } from "@repo/ui/components";
import { OTPField } from "@repo/ui/components/otp-field";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

import { webApi } from "../../lib/api";
import { formatSecondsAsMinutesAndSeconds } from "../../utils/format-seconds";
import { formatAuthError, type AuthErrorState } from "./auth-errors";

const SECOND_MS = tokens.motion.duration.countdownTick;

export interface OtpChallengeFormProps {
  challenge: v1.auth.OtpChallengeMetadata;
  description?: string;
  verifyRoute: string;
  onChallengeChange: (challenge: v1.auth.OtpChallengeMetadata) => void;
  onVerified: () => Promise<void>;
  onRequestAnother: () => Promise<void>;
}

export function OtpChallengeForm({
  challenge,
  description,
  verifyRoute,
  onChallengeChange,
  onVerified,
  onRequestAnother,
}: OtpChallengeFormProps) {
  const t = useTranslations("auth.otp");
  const locale = useLocale();
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState(
    () => now + challenge.expiresInSec * SECOND_MS,
  );
  const [resendAt, setResendAt] = useState(
    () => now + challenge.resendAfterSec * SECOND_MS,
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      tokens.motion.duration.countdownTick,
    );
    return () => window.clearInterval(timer);
  }, []);

  const expiresInSec = remainingSeconds(expiresAt, now);
  const resendAfterSec = remainingSeconds(resendAt, now);
  const expired = expiresInSec === 0;
  const formattedExpiration = formatSecondsAsMinutesAndSeconds(expiresInSec);

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (busy || expired) return;

    setError(null);
    setBusy(true);

    let verified = false;
    let completed = false;
    try {
      await webApi.fetch(verifyRoute, v1.auth.tokenPairSchema, {
        method: "POST",
        headers: { [localeHeaderName]: locale },
        json: { challengeId: challenge.challengeId, code },
      });
      verified = true;
      await onVerified();
      completed = true;
    } catch (verificationError) {
      setError({
        cause: verificationError,
        unauthorizedMessage: verified
          ? "auth.errors.sessionExpired"
          : "auth.otp.errors.invalidOrExpired",
      });
    } finally {
      // Successful completion starts navigation; keep feedback until unmount.
      if (!completed) setBusy(false);
    }
  }

  async function resendCode() {
    if (expired || resendAfterSec > 0) return;

    setError(null);
    setBusy(true);

    try {
      const nextChallenge = await webApi.fetch(
        v1.auth.ROUTES.otp.resend,
        v1.auth.otpChallengeMetadataSchema,
        {
          method: "POST",
          headers: { [localeHeaderName]: locale },
          json: { challengeId: challenge.challengeId },
        },
      );
      const currentTime = Date.now();
      setNow(currentTime);
      setExpiresAt(currentTime + nextChallenge.expiresInSec * SECOND_MS);
      setResendAt(currentTime + nextChallenge.resendAfterSec * SECOND_MS);
      onChallengeChange(nextChallenge);
    } catch (resendError) {
      setError({
        cause: resendError,
        unauthorizedMessage: "auth.otp.errors.invalidOrExpired",
      });
    } finally {
      setBusy(false);
    }
  }

  async function requestAnotherCode() {
    setError(null);
    setBusy(true);

    try {
      await onRequestAnother();
      setCode("");
    } catch (requestError) {
      setError({ cause: requestError });
    } finally {
      setBusy(false);
    }
  }

  function handleCodeChange(nextCode: string) {
    setCode(nextCode);
    if (error) {
      setError(null);
    }
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-4">
      {description ? (
        <p className="text-center text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-1 text-center">
        <Label htmlFor="otp-code">{t("codeLabel")}</Label>
        <OTPField
          id="otp-code"
          name="code"
          required
          value={code}
          onValueChange={handleCodeChange}
          disabled={busy || expired}
          autoFocus
          invalid={Boolean(error)}
          className="justify-center gap-2"
          inputClassName="text-xl font-semibold"
        />

        {expired ? (
          <p
            role="status"
            className="mt-2 text-sm font-medium text-destructive"
          >
            {t("expired")}
          </p>
        ) : (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {t("expiresIn", { time: formattedExpiration })}
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {formatAuthError(error.cause, locale, error.unauthorizedMessage)}
        </p>
      ) : null}

      {expired ? (
        <Button
          type="button"
          onClick={requestAnotherCode}
          disabled={busy}
          className="w-full"
        >
          {busy ? t("requestingAnotherCode") : t("requestAnotherCode")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full"
          >
            {busy ? t("verifying") : t("verify")}
          </Button>
          <Button
            variant="link"
            onClick={resendCode}
            disabled={busy || resendAfterSec > 0}
            className="self-center"
          >
            {resendAfterSec > 0
              ? t("resendIn", {
                  time: formatSecondsAsMinutesAndSeconds(resendAfterSec),
                })
              : t("resendCode")}
          </Button>
        </div>
      )}
    </form>
  );
}

function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / SECOND_MS));
}
