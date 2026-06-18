"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme/runtime";
import { OTPField } from "@repo/ui/components/otp-field";
import { useEffect, useState, type FormEvent } from "react";

import { webApi } from "../../lib/api";
import { formatSecondsAsMinutesAndSeconds } from "../../utils/format-seconds";
import { formatAuthError } from "./auth-errors";

const SECOND_MS = tokens.motion.duration.countdownTick;

export interface OtpChallengeFormProps {
  challenge: v1.auth.OtpChallengeMetadata;
  description: string;
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
      setError(formatAuthError(verificationError, "Invalid or expired code."));
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
      setError(formatAuthError(resendError, "Could not resend code."));
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
      setError(
        formatAuthError(
          requestError,
          "Could not request another code. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-3 text-center">
      <p className="text-sm text-muted-foreground">{description}</p>

      {expired ? (
        <p role="status" className="text-sm text-destructive">
          This code has expired.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Code expires in {formattedExpiration}.
        </p>
      )}

      <div className="flex flex-col items-center gap-1">
        <label htmlFor="otp-code" className="text-sm font-medium">
          6-digit code
        </label>
        <OTPField
          id="otp-code"
          name="code"
          required
          value={code}
          onValueChange={setCode}
          disabled={busy || expired}
          autoFocus
        />
      </div>

      {expired ? (
        <button
          type="button"
          onClick={requestAnotherCode}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-foreground"
        >
          {busy ? "Requesting…" : "Request another code"}
        </button>
      ) : (
        <>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-foreground"
          >
            {busy ? "Verifying…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={resendCode}
            disabled={busy || resendAfterSec > 0}
            className="text-sm text-link underline hover:text-link-hover disabled:text-disabled-foreground"
          >
            {resendAfterSec > 0
              ? `Resend in ${formatSecondsAsMinutesAndSeconds(resendAfterSec)}`
              : "Resend code"}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-link underline hover:text-link-hover"
        disabled={busy}
      >
        Cancel
      </button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / SECOND_MS));
}
