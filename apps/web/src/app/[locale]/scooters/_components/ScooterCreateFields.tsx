"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import { Badge, Button, FormSection } from "@repo/ui/components";
import { FormField } from "@/components/form/FormField";
import { FormBooleanRow } from "@/components/form/FormBooleanRow";
import {
  FormDateField,
  FormInput,
  FormSegmentedRadioGroup,
} from "@/components/form/controls";
import {
  ScooterEditorFieldControl,
  ScooterInitialRegistrationFields,
  ScooterTechnicalFields,
} from "./ScooterEditorFields";
import { CivMetadataFields } from "./CivMetadataFields";
import { ScooterCreateInsuranceFields } from "./ScooterCreateInsuranceFields";
import type { ScooterEditorValues } from "./scooter-editor-schema";
import { OPERATIONAL_FIELDS } from "./scooter-wizard";
import { useEffect } from "react";
import { ScooterFleetNumberField } from "./ScooterFleetNumberField";
import { ScooterSectionComplete } from "./ScooterSectionComplete";

export function ScooterCreateFields({
  brands,
  editing = false,
  onBrandCreated,
  disabled,
  photos,
  hasCivEvidence = false,
}: {
  editing?: boolean;
  brands: v1.scooterBrands.ScooterBrand[];
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  disabled: boolean;
  photos?: ReactNode;
  hasCivEvidence?: boolean;
}) {
  const t = useTranslations("scooters");
  const {
    control,
    formState: { errors, submitCount, isSubmitting },
  } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  const registration = useWatch({ control, name: "registrationType" });
  const props = { brands, onBrandCreated, disabled, powertrain };
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  useEffect(() => {
    if (!submitCount || isSubmitting) return;
    const mainFields = new Set([
      "fleetNumber",
      "vin",
      "brandId",
      "model",
      "manufactureYear",
      "color",
      "powertrainType",
      "engineDisplacementCc",
      "fuelSystem",
      "registrationType",
      "civAvailability",
      "registrationNumber",
      "temporaryRegistrationExpiresAt",
      "requiredLicenseCategory",
      "insurancePolicies",
      ...OPERATIONAL_FIELDS,
    ]);
    const frame = requestAnimationFrame(() => {
      if (Object.keys(errors).some((name) => !mainFields.has(name)))
        setAdvancedOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [submitCount, isSubmitting, errors]);

  return (
    <div className="grid min-w-0 gap-10">
      <FormSection
        panel
        number={1}
        title={t("sections.identity")}
        status={
          <ScooterSectionComplete
            fields={["vin", "brandId", "model", "manufactureYear", "color"]}
          />
        }
      >
        <ScooterFleetNumberField
          brands={brands}
          disabled={disabled}
          editing={editing}
        />
        {(["vin", "brandId", "model", "manufactureYear", "color"] as const).map(
          (name) => (
            <ScooterEditorFieldControl key={name} name={name} {...props} />
          ),
        )}
      </FormSection>
      {photos}
      <FormSection
        panel
        number={photos ? 3 : 2}
        title={t("creation.propulsion")}
        status={
          <ScooterSectionComplete
            fields={
              powertrain === "electric" || powertrain === "unpowered"
                ? ["powertrainType"]
                : ["powertrainType", "engineDisplacementCc"]
            }
          />
        }
      >
        <div className="sm:col-span-2">
          <FormField
            name="powertrainType"
            label={t("fields.powertrainType")}
            required
            disabled={disabled}
          >
            <FormSegmentedRadioGroup
              optionClassName="min-h-11"
              options={v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((value) => ({
                value,
                label: t(`powertrainTypes.${value}`),
                tone: "neutral" as const,
              }))}
            />
          </FormField>
        </div>
        {powertrain !== "electric" && powertrain !== "unpowered" ? (
          <>
            <ScooterEditorFieldControl name="engineDisplacementCc" {...props} />
            <ScooterEditorFieldControl name="fuelSystem" {...props} />
          </>
        ) : null}
      </FormSection>
      <ScooterInitialRegistrationFields
        panel
        number={photos ? 4 : 3}
        status={
          <ScooterSectionComplete
            fields={
              registration === "unregistered"
                ? ["registrationType"]
                : [
                    "registrationType",
                    "registrationNumber",
                    "requiredLicenseCategory",
                    ...(registration === "temporary"
                      ? ["temporaryRegistrationExpiresAt"]
                      : []),
                  ]
            }
          />
        }
        disabled={disabled}
      >
        <div className="grid gap-2 sm:col-span-2">
          <FormField
            name="civAvailability"
            label={t("fields.civAvailability")}
            disabled={disabled}
          >
            <FormSegmentedRadioGroup
              options={(["unknown", "not_issued", "issued"] as const).map(
                (value) => ({
                  value,
                  label: t(`civ.availability.${value}`),
                  tone: "neutral" as const,
                  disabled: value === "not_issued" && hasCivEvidence,
                }),
              )}
            />
          </FormField>
          <p className="text-sm text-muted-foreground">
            {t(
              hasCivEvidence
                ? "civ.availabilityEvidence"
                : "civ.availabilityHint",
            )}
          </p>
        </div>
      </ScooterInitialRegistrationFields>
      <ScooterCreateInsuranceFields
        disabled={disabled}
        number={photos ? 5 : 4}
      />
      <FormSection
        panel
        number={photos ? 6 : 5}
        title={t("creation.conditionEquipment")}
        status={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("creation.optional")}</Badge>
            <ScooterSectionComplete fields={OPERATIONAL_FIELDS} />
          </div>
        }
      >
        <p className="text-sm text-muted-foreground sm:col-span-2">
          {t("creation.conditionHelp")}
        </p>
        {(
          [
            "odometerWorking",
            "currentMileageKm",
            "speedometerWorking",
            "actualMaxSpeedKmh",
            "hasGps",
          ] as const
        ).map((name) =>
          name === "currentMileageKm" || name === "actualMaxSpeedKmh" ? (
            <ScooterEditorFieldControl key={name} name={name} {...props} />
          ) : (
            <FormBooleanRow<ScooterEditorValues>
              key={name}
              name={name}
              label={t(`operational.rows.${name}`)}
              falseLabel={t(
                name === "hasGps"
                  ? "operational.withoutGps"
                  : "operational.defective",
              )}
              trueLabel={t(
                name === "hasGps"
                  ? "operational.withGps"
                  : "operational.functional",
              )}
              disabled={disabled}
              stacked
            />
          ),
        )}
        <ScooterEditorFieldControl name="notes" {...props} />
      </FormSection>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={advancedOpen}
        aria-controls={advancedId}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {t("creation.advancedDetails")}
      </Button>
      <div id={advancedId} hidden={!advancedOpen}>
        <div className="grid min-w-0 gap-8">
          <p className="text-sm text-muted-foreground">
            {t("creation.advancedHelp")}
          </p>
          {registration && registration !== "unregistered" ? (
            <FormSection title={t("creation.registrationDetails")}>
              <FormField
                name="registrationDate"
                label={t("fields.registrationDate")}
                labelSuffix="day"
                disabled={disabled}
              >
                <FormDateField maxDate={v1.common.dateOnlyToday()} />
              </FormField>
              <FormField
                name="registrationCertificateNumber"
                label={t("fields.registrationCertificateNumber")}
                disabled={disabled}
              >
                <FormInput
                  placeholder={t("placeholders.registrationCertificateNumber")}
                />
              </FormField>
            </FormSection>
          ) : null}
          <ScooterTechnicalFields
            compact={false}
            excludeFields={[
              "vin",
              "brandId",
              "model",
              "manufactureYear",
              "color",
              "powertrainType",
              "engineDisplacementCc",
              "fuelSystem",
            ]}
            {...props}
          />
          <CivMetadataFields disabled={disabled} />
        </div>
      </div>
    </div>
  );
}
