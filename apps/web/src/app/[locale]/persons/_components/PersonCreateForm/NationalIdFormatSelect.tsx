"use client";

import { Button } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import type { NationalIdFormat } from "./types";

export function NationalIdFormatSelect({
  value,
  disabled,
  onChange,
}: {
  value: NationalIdFormat | null;
  disabled: boolean;
  onChange: (value: NationalIdFormat) => void;
}) {
  const t = useTranslations("persons");
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">{t("nationalIdFormat.label")}</legend>
      <div className="grid grid-cols-2 gap-3">
        {(["electronic", "classic"] as const).map((format) => (
          <Button
            key={format}
            type="button"
            variant={value === format ? "secondary" : "outline"}
            aria-pressed={value === format}
            disabled={disabled}
            onClick={() => onChange(format)}
            className={`h-auto min-h-12 whitespace-normal px-3 py-2 md:h-auto ${value === format ? "" : "bg-card text-card-foreground"}`}
          >
            {t(`nationalIdFormat.${format}`)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
