"use client";
import { v1 } from "@repo/api-shared";
import { FormSection } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { FormField } from "@/components/form/FormField";
import {
  FormDateField,
  FormInput,
  FormSelect,
} from "@/components/form/controls";
import type { ScooterEditorValues } from "./scooter-editor-schema";

export function CivMetadataFields({ disabled }: { disabled: boolean }) {
  const t = useTranslations("scooters");
  const { control } = useFormContext<ScooterEditorValues>();
  const version = useWatch({ control, name: "civVersion" });
  return (
    <FormSection title={t("sections.civDocument")}>
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
      <FormField
        name="civNumber"
        label={t("fields.civNumber")}
        disabled={disabled}
      >
        <FormInput placeholder={t("placeholders.civNumber")} />
      </FormField>
      <FormField
        name="civIssuedAt"
        label={t("fields.civIssuedAt")}
        disabled={disabled}
      >
        <FormDateField />
      </FormField>
      <FormField
        name="civIssuingAuthority"
        label={t("fields.civIssuingAuthority")}
        disabled={disabled}
      >
        <FormInput placeholder={t("placeholders.civIssuingAuthority")} />
      </FormField>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {t(
          version === "unknown" ? "civ.unknownVersionHint" : "civ.versionHint",
        )}
      </p>
    </FormSection>
  );
}
