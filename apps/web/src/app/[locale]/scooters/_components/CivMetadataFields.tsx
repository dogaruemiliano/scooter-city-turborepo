"use client";
import { v1 } from "@repo/api-shared";
import { FormSection } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { get, useFormContext, useWatch } from "react-hook-form";
import { useContext, useState } from "react";
import {
  FormField,
  FormFieldWarningsContext,
} from "@/components/form/FormField";
import {
  FormDateField,
  FormInput,
  FormSelect,
} from "@/components/form/controls";
import type { ScooterEditorValues } from "./scooter-editor-schema";

const metadataFields = [
  "civNumber",
  "civIssuedAt",
  "civIssuingAuthority",
] as const;

export function CivMetadataFields({
  disabled,
  compact = false,
  number,
}: {
  disabled: boolean;
  compact?: boolean;
  number?: number;
}) {
  const t = useTranslations("scooters");
  const {
    control,
    getValues,
    formState: { errors },
  } = useFormContext<ScooterEditorValues>();
  const warnings = useContext(FormFieldWarningsContext);
  const [initiallyVisible] = useState(
    () =>
      new Set<string>(
        metadataFields.filter((field) => getValues(field) || warnings[field]),
      ),
  );
  const hidden = compact
    ? metadataFields.filter((field) => !initiallyVisible.has(field))
    : [];
  function renderField(field: (typeof metadataFields)[number]) {
    return (
      <FormField
        key={field}
        name={field}
        label={t(`fields.${field}`)}
        disabled={disabled}
        labelSuffix={field === "civIssuedAt" ? "day" : undefined}
      >
        {field === "civIssuedAt" ? (
          <FormDateField maxDate={v1.common.dateOnlyToday()} />
        ) : (
          <FormInput placeholder={t(`placeholders.${field}`)} />
        )}
      </FormField>
    );
  }
  const version = useWatch({ control, name: "civVersion" });
  return (
    <FormSection title={t("sections.civDocument")} number={number}>
      <FormField
        name="civVersion"
        label={t("fields.civVersion")}
        disabled={disabled}
      >
        <FormSelect
          options={v1.vehicleCiv.CIV_VERSIONS.map((value) => ({
            value,
            label: value === "unknown" ? t("civ.unknownVersion") : value,
          }))}
        />
      </FormField>
      {metadataFields
        .filter((field) => !hidden.includes(field))
        .map(renderField)}
      {hidden.length ? (
        <details
          className="sm:col-span-2"
          open={
            hidden.some((field) => warnings[field] || get(errors, field)) ||
            undefined
          }
        >
          <summary className="cursor-pointer py-3 text-sm font-medium">
            {t("wizard.otherFields")}
          </summary>
          <div className="grid gap-4 pt-4 sm:grid-cols-2">
            {hidden.map(renderField)}
          </div>
        </details>
      ) : null}
      {!compact ? (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {t(
            version === "unknown"
              ? "civ.unknownVersionHint"
              : "civ.versionHint",
          )}
        </p>
      ) : null}
    </FormSection>
  );
}
