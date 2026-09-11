"use client";

import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import type { NationalIdFormat } from "./types";

export function NationalIdFormatSelect({
  value,
  disabled,
  onChange,
}: {
  value: NationalIdFormat;
  disabled: boolean;
  onChange: (value: NationalIdFormat) => void;
}) {
  const t = useTranslations("persons");
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-sm font-medium">
        {t("nationalIdFormat.label")}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {(["classic", "electronic"] as const).map((format) => (
          <Button
            key={format}
            type="button"
            variant={value === format ? "secondary" : "outline"}
            aria-pressed={value === format}
            disabled={disabled}
            onClick={() => onChange(format)}
            className="h-auto whitespace-normal py-3"
          >
            {t(`nationalIdFormat.${format}`)}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {t(`nationalIdFormat.${value}Help`)}
      </p>
    </fieldset>
  );
}
