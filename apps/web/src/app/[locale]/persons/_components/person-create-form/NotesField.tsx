"use client";

import { Textarea } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormLayout";

export function NotesField({
  formId,
  value,
  error,
  onChange,
}: {
  formId: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("persons");

  return (
    <FormField id={`${formId}-notes`} label={t("fields.notes")} error={error}>
      <Textarea
        id={`${formId}-notes`}
        aria-describedby={fieldErrorId(`${formId}-notes`, error)}
        aria-invalid={invalidAria(error)}
        name="notes"
        maxLength={2000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}
