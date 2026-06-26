"use client";

import { v1 } from "@repo/api-shared";
import { Button, Input, Label } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";

import { webApi } from "../../lib/api";
import { formatAuthError } from "./auth-errors";

export interface EmailOtpSignInFormProps {
  onChallenge: (challenge: v1.auth.OtpChallengeMetadata, email: string) => void;
}

export function EmailOtpSignInForm({ onChallenge }: EmailOtpSignInFormProps) {
  const t = useTranslations("auth.signIn.emailOtp");
  const emailInputId = useId();
  const emailErrorId = `${emailInputId}-error`;
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const input = v1.auth.requestEmailOtpInputSchema.safeParse({ email });
    if (!input.success) {
      setEmailError(t("emailInvalid"));
      emailInputRef.current?.focus();
      return;
    }

    setEmailError(null);
    setBusy(true);

    try {
      const challenge = await webApi.fetch(
        v1.auth.ROUTES.emailOtp.request,
        v1.auth.emailOtpChallengeSchema,
        { method: "POST", json: input.data },
      );
      onChallenge(challenge, input.data.email);
    } catch (requestError) {
      setError(formatAuthError(requestError, t("sendCodeError")));
    } finally {
      setBusy(false);
    }
  }

  function updateEmail(nextEmail: string) {
    setEmail(nextEmail);
    if (
      emailError &&
      v1.auth.requestEmailOtpInputSchema.safeParse({ email: nextEmail }).success
    ) {
      setEmailError(null);
    }
  }

  function validateEmailOnBlur() {
    if (!email) return;

    const input = v1.auth.requestEmailOtpInputSchema.safeParse({ email });
    setEmailError(input.success ? null : t("emailInvalid"));
  }

  return (
    <form noValidate onSubmit={requestCode} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={emailInputId}>{t("emailLabel")}</Label>
        <Input
          ref={emailInputRef}
          id={emailInputId}
          type="email"
          required
          autoComplete="email"
          aria-describedby={emailError ? emailErrorId : undefined}
          aria-invalid={emailError ? true : undefined}
          value={email}
          onBlur={validateEmailOnBlur}
          onChange={(event) => updateEmail(event.target.value)}
          disabled={busy}
        />
        {emailError ? (
          <p
            id={emailErrorId}
            role="alert"
            className="text-sm text-destructive"
          >
            {emailError}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? t("sendingCode") : t("sendCode")}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
