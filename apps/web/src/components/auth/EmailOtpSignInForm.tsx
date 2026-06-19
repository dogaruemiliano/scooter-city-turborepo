"use client";

import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { webApi } from "../../lib/api";
import { formatAuthError } from "./auth-errors";

export interface EmailOtpSignInFormProps {
  onChallenge: (challenge: v1.auth.OtpChallengeMetadata, email: string) => void;
}

export function EmailOtpSignInForm({ onChallenge }: EmailOtpSignInFormProps) {
  const t = useTranslations("auth.signIn.emailOtp");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const challenge = await webApi.fetch(
        v1.auth.ROUTES.emailOtp.request,
        v1.auth.emailOtpChallengeSchema,
        { method: "POST", json: { email } },
      );
      onChallenge(challenge, email);
    } catch (requestError) {
      setError(formatAuthError(requestError, t("sendCodeError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={requestCode} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("emailLabel")}</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
          disabled={busy}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !email}
        className="rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-foreground"
      >
        {busy ? t("sendingCode") : t("sendCode")}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
