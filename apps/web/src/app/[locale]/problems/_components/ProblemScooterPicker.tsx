"use client";

import { Field, FieldLabel } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { ScooterSelect } from "@/components/ScooterSelect";

export function ProblemScooterPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("workspace");
  return (
    <Field>
      <FieldLabel>{t("problems.scooter")}</FieldLabel>
      <ScooterSelect
        value={value}
        onValueChange={onChange}
        required
        disabled={disabled}
      />
    </Field>
  );
}
