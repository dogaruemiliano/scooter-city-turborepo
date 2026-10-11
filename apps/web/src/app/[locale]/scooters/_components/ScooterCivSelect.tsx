"use client";

import { v1 } from "@repo/api-shared";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { useCivFieldHint } from "./useCivFieldHint";
import { FormField } from "@/components/form/FormField";
import { FormSearchSelect } from "@/components/form/FormSearchSelect";
import { FormInput } from "@/components/form/controls";
import { type ScooterEditorValues } from "./scooter-editor-schema";

type CivField = keyof typeof v1.scooters.SCOOTER_CIV_OPTIONS;

export function ScooterCivSelect({
  name,
  disabled,
  powertrain,
}: {
  name: CivField;
  disabled: boolean;
  powertrain: string;
}) {
  const t = useTranslations("scooters");
  const labelHint = useCivFieldHint(name);
  const { control, clearErrors } = useFormContext<ScooterEditorValues>();
  const value = useWatch({ control, name });
  const values: readonly string[] = v1.scooters.SCOOTER_CIV_OPTIONS[name];
  const options = values
    .filter((option) => {
      // Keep a saved selection visible, even when a different powertrain is selected.
      if (name !== "fuelType" || !powertrain || option === value) return true;
      if (powertrain === "combustion") return !option.includes("electric");
      return option !== "electric";
    })
    .map((option) => ({
      value: option,
      label: t(`civOptions.${name}.${option}`),
    }));
  return (
    <>
      <FormField
        name={name}
        label={t(`fields.${name}`)}
        labelHint={labelHint}
        disabled={disabled}
      >
        <FormSearchSelect
          options={options}
          placeholder={t(`placeholders.${name}`)}
          searchPlaceholder={t("civ.search")}
          emptyMessage={t("civ.empty")}
          clearLabel={t("civ.clear")}
          toggleLabel={t("civ.toggle")}
          onSelectionChange={() => clearErrors(`${name}Other`)}
        />
      </FormField>
      {value === "other" ? (
        <FormField
          name={`${name}Other`}
          label={t(`fields.${name}Other`)}
          disabled={disabled}
          required
        >
          <FormInput placeholder={t("civ.exactValue")} />
        </FormField>
      ) : null}
    </>
  );
}
