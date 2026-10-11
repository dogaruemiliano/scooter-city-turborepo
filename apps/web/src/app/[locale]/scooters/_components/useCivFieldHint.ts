"use client";
import { v1 } from "@repo/api-shared";
import { useFormContext, useWatch } from "react-hook-form";
import type { ScooterEditorValues } from "./scooter-editor-schema";

export function useCivFieldHint(field: string) {
  const { control } = useFormContext<ScooterEditorValues>();
  const version = useWatch({ control, name: "civVersion" });
  return v1.vehicleCiv.civFieldHint(
    (version || "unknown") as v1.vehicleCiv.CivVersion,
    field,
  );
}
