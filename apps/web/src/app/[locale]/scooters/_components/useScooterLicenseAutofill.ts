"use client";

import { v1 } from "@repo/api-shared";
import { useCallback, useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { DocumentImportResult } from "./scooter-document-import";
import type { ScooterEditorValues } from "./scooter-editor-schema";

/** Only the documented 25 km/h value supplies the requested default. */
export function documentedLicenseSuggestion(
  maxSpeedKmh: string,
): "none" | undefined {
  return v1.vehicleCiv.parseCivNumber(maxSpeedKmh) === 25 ? "none" : undefined;
}

export function useScooterLicenseAutofill(editing: boolean) {
  const { control, setValue, clearErrors } =
    useFormContext<ScooterEditorValues>();
  const maxSpeedKmh = useWatch({ control, name: "maxSpeedKmh" });
  const registrationType = useWatch({ control, name: "registrationType" });
  const requiredLicenseCategory = useWatch({
    control,
    name: "requiredLicenseCategory",
  });
  const autoFilled = useRef(false);

  useEffect(() => {
    if (editing) return;

    // Unregistered scooters already have their own API-required "none" default.
    if (registrationType === "unregistered") {
      autoFilled.current = false;
      return;
    }

    const suggestion =
      registrationType === "local"
        ? "none"
        : documentedLicenseSuggestion(maxSpeedKmh);
    if (suggestion && !requiredLicenseCategory) {
      autoFilled.current = true;
      clearErrors("requiredLicenseCategory");
      setValue("requiredLicenseCategory", suggestion, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else if (!suggestion && autoFilled.current) {
      autoFilled.current = false;
      if (requiredLicenseCategory === "none") {
        setValue("requiredLicenseCategory", "", {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    } else if (requiredLicenseCategory && requiredLicenseCategory !== "none") {
      autoFilled.current = false;
    }
  }, [
    editing,
    registrationType,
    maxSpeedKmh,
    requiredLicenseCategory,
    clearErrors,
    setValue,
  ]);

  const onImport = useCallback(
    (result: Extract<DocumentImportResult, { ok: true }>) => {
      if (editing) return;
      if (result.autoFilledLicenseCategory) {
        autoFilled.current = true;
      } else if (
        Object.prototype.hasOwnProperty.call(
          result.values,
          "requiredLicenseCategory",
        )
      ) {
        autoFilled.current = false;
      }
    },
    [editing],
  );

  const onManualLicenseChange = useCallback(() => {
    autoFilled.current = false;
  }, []);

  return { onImport, onManualLicenseChange };
}
