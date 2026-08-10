"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import {
  useFormContext,
  useFormState,
  type FieldErrors,
} from "react-hook-form";

export interface FormSummaryProps {
  /** Heading for the alert, e.g. "Person not created". */
  title: string;
  /** Server-side or transport failure to show instead of the field count. */
  message?: string | null;
  className?: string;
}

/**
 * Form-level failure notice. Field messages stay under their inputs; this only
 * says how many need attention, so long forms do not repeat every message.
 */
export function FormSummary({ className, message, title }: FormSummaryProps) {
  const t = useTranslations("shared.validation");
  const { control } = useFormContext();
  const { errors, isSubmitted } = useFormState({ control });
  const count = countFieldErrors(errors);

  if (!message && (!isSubmitted || count === 0)) {
    return null;
  }

  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message ?? t("summary", { count })}</AlertDescription>
    </Alert>
  );
}

/** Counts leaf errors, so a nested document field counts as one field. */
function countFieldErrors(errors: FieldErrors): number {
  let count = 0;

  for (const value of Object.values(errors)) {
    if (!value || typeof value !== "object") continue;

    if (typeof (value as { message?: unknown }).message === "string") {
      count += 1;
      continue;
    }

    count += countFieldErrors(value as FieldErrors);
  }

  return count;
}
