"use client";

import { useCallback } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components";
import { FormField, useFormFieldControl } from "@/components/form/FormField";
import { useRemote } from "@/components/WorkspaceForm";
import { webApi } from "@/lib/api";
import type { ScooterEditorValues } from "./scooter-editor-schema";

export function ScooterFleetNumberField({
  brands,
  disabled,
  editing = false,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
  disabled: boolean;
  editing?: boolean;
}) {
  const t = useTranslations("scooters");
  const { control } = useFormContext<ScooterEditorValues>();
  const brandId = useWatch({ control, name: "brandId" });
  const brand = brands.find((item) => item.id === brandId);
  const suggestion = useRemote(
    useCallback(
      () =>
        editing
          ? Promise.resolve({ fleetNumber: null })
          : webApi.fetch(
              v1.scooters.ROUTES.nextFleetNumber,
              v1.scooters.nextScooterFleetNumberSchema,
              { cache: "no-store" },
            ),
      [editing],
    ),
  );
  return (
    <FormField
      name="fleetNumber"
      label={t("fields.fleetNumber")}
      disabled={disabled}
    >
      <FleetNumberControl
        brandCode={brand?.code}
        suggested={suggestion.data?.fleetNumber}
      />
    </FormField>
  );
}

function FleetNumberControl({
  brandCode,
  suggested,
}: {
  brandCode?: string;
  suggested?: number | null;
}) {
  const { controlProps } = useFormFieldControl();
  const { control } = useFormContext<ScooterEditorValues>();
  const t = useTranslations("scooters");
  return (
    <Controller
      control={control}
      name="fleetNumber"
      render={({ field }) => (
        <InputGroup>
          <InputGroupInput
            {...controlProps}
            {...field}
            // Display the suggestion without fixing the allocation until the user edits it.
            value={field.value ?? (suggested != null ? String(suggested) : "")}
            disabled={controlProps.disabled}
            inputMode="numeric"
            placeholder={t("numbering.automatic")}
          />
          {brandCode ? <InputGroupAddon>{brandCode}</InputGroupAddon> : null}
        </InputGroup>
      )}
    />
  );
}
