"use client";

import { Badge } from "@repo/ui/components";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { get, useFormContext, useWatch } from "react-hook-form";
import {
  scooterCreateFormSchema,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

export function ScooterSectionComplete({
  fields,
}: {
  fields: readonly string[];
}) {
  const t = useTranslations("scooters");
  const {
    control,
    formState: { errors },
  } = useFormContext<ScooterEditorValues>();
  const values = useWatch({ control });
  const result = scooterCreateFormSchema.safeParse(values);
  const hasSectionIssues =
    !result.success &&
    result.error.issues.some((issue) =>
      fields.some(
        (field) =>
          issue.path.join(".") === field ||
          field.startsWith(`${issue.path.join(".")}.`),
      ),
    );
  const complete =
    fields.every((field) => {
      const value = get(values, field);
      return (
        value != null && String(value).trim() !== "" && !get(errors, field)
      );
    }) && !hasSectionIssues;
  if (!complete) {
    if (!hasSectionIssues) return null;
    return (
      <Badge variant="warning">
        <CircleAlertIcon aria-hidden="true" />
        {t("creation.missingData")}
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CheckIcon aria-hidden="true" />
      {t("creation.complete")}
    </Badge>
  );
}
