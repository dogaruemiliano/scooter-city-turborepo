"use client";

import { useTranslations } from "next-intl";
import type { SaveButtonProps } from "@repo/ui/components/save-button";

type FormAction =
  | "save"
  | "create"
  | "report"
  | "complete"
  | "comment"
  | "assign"
  | "recordExpense"
  | "recordMoney"
  | "confirm"
  | "review"
  | "invite"
  | "sendCode"
  | "verify"
  | "apply"
  | "delete"
  | "update";
type Submission = { pending: boolean; error?: unknown; success?: boolean };

/** Shared copy and state adapter. Requests and validation remain in the form. */
export function useFormAction() {
  const t = useTranslations("shared.formActions");
  return (
    action: FormAction,
    submission: Submission,
    idleLabel?: string,
  ): Pick<
    SaveButtonProps,
    "state" | "idleLabel" | "pendingLabel" | "successLabel"
  > => ({
    state: submission.pending
      ? "pending"
      : submission.error
        ? "error"
        : submission.success
          ? "success"
          : "idle",
    idleLabel: idleLabel ?? t(`${action}.idle`),
    pendingLabel: t(`${action}.pending`),
    successLabel: t(`${action}.success`),
  });
}
