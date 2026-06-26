"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme/runtime";
import { Button } from "@repo/ui/components";
import { OTPField } from "@repo/ui/components/otp-field";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

import { webApi } from "../../lib/api";
import { formatSecondsAsMinutesAndSeconds } from "../../utils/format-seconds";
import { formatAuthError } from "./auth-errors";

const SECOND_MS = tokens.motion.duration.countdownTick;

export interface OtpChallengeFormProps {
  challenge: v1.auth.OtpChallengeMetadata;
  description?: string;
  verifyRoute: string;
  onChallengeChange: (challenge: v1.auth.OtpChallengeMetadata) => void;
  onVerified: () => Promise<void>;
  onRequestAnother: () => Promise<void>;
  onCancel: () => void;
}

export function OtpChallengeForm({
  challenge,
  description,
  verifyRoute,
  onChallengeChange,
  onVerified,
  onRequestAnother,
  onCancel,
}: OtpChallengeFormProps) {
  const t = useTranslations("auth.otp");
  const tSharedActions = useTranslations("shared.actions");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState(
    () => Date.now() + challenge.expiresInSec * SECOND_MS,
  );
  const [resendAt, setResendAt] = useState(
    () => Date.now() + challenge.resendAfterSec * SECOND_MS,
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
    if (expired) return;

    setError(null);
    setBusy(true);

    try {
      await webApi.fetch(verifyRoute, v1.auth.tokenPairSchema, {
        method: "POST",
        json: { challengeId: challenge.challengeId, code },
      });
      await onVerified();
    } catch (verificationError) {
      setError(
        formatAuthError(verificationError, t("errors.invalidOrExpired")),
      );
    } finally {
      setBusy(false);
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
          json: { challengeId: challenge.challengeId },
        },
      );
      const currentTime = Date.now();
      setNow(currentTime);
      setExpiresAt(currentTime + nextChallenge.expiresInSec * SECOND_MS);
      setResendAt(currentTime + nextChallenge.resendAfterSec * SECOND_MS);
      onChallengeChange(nextChallenge);
    } catch (resendError) {
      setError(formatAuthError(resendError, t("errors.resendFailed")));
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
      setError(formatAuthError(requestError, t("errors.requestAnotherFailed")));
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
    <form onSubmit={verifyCode} className="flex flex-col gap-5">
      {description ? (
        <p className="text-center text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3 text-center">
        <label htmlFor="otp-code" className="text-sm font-semibold">
          {t("codeLabel")}
        </label>
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
          inputClassName="size-12 text-xl font-semibold"
        />

        {expired ? (
          <p role="status" className="text-sm font-medium text-destructive">
            {t("expired")}
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("expiresIn", { time: formattedExpiration })}
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {expired ? (
        <Button
          type="button"
          onClick={requestAnotherCode}
          disabled={busy}
          size="lg"
          className="w-full"
        >
          {busy ? t("requestingAnotherCode") : t("requestAnotherCode")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={busy || code.length !== 6}
            size="lg"
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

      <Button
        type="button"
        variant="link"
        onClick={onCancel}
        className="self-center"
        disabled={busy}
      >
        {tSharedActions("cancel")}
      </Button>
    </form>
  );
}

function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / SECOND_MS));
}
