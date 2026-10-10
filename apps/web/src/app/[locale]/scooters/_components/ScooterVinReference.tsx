"use client";

import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import type { ScooterEditorValues } from "./scooter-editor-schema";

/** Keep the comparison target beside every document ownership confirmation. */
export function ScooterVinReference({
  fallbackVin,
}: { fallbackVin?: string } = {}) {
  const t = useTranslations("scooters.documentImport");
  const { control } = useFormContext<ScooterEditorValues>();
  const currentVin = useWatch({ control, name: "vin" });
  const vin = (currentVin?.trim() || fallbackVin?.trim())?.toUpperCase();
  return (
    <p className="text-sm">
      {t("scooterVin")}
      {": "}
      <span className="font-mono font-medium select-all">
        {vin || t("vinUnavailable")}
      </span>
    </p>
  );
}
