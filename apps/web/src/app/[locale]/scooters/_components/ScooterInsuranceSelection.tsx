"use client";

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useId } from "react";

export function ScooterInsuranceSelection({
  options,
  value,
  required,
  disabled,
  onChange,
}: {
  options: { id: string; fileName: string; pages: number[] }[];
  value: string | null | undefined;
  required: boolean;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("scooters.workspace");
  const id = useId();
  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card p-4">
      <Label htmlFor={id}>{t("currentInsurance")}</Label>
      <Select
        value={value === null ? "none" : (value ?? "")}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-describedby={`${id}-hint`}
          aria-invalid={required}
        >
          <SelectValue placeholder={t("chooseInsurance")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("noCurrentInsurance")}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.fileName}
              {option.pages.length
                ? ` · ${t("pages", { pages: option.pages.join(", ") })}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t("currentInsuranceHint")}
      </p>
      {required ? (
        <p role="alert" className="text-sm text-destructive">
          {t("chooseInsuranceRequired")}
        </p>
      ) : null}
    </section>
  );
}
