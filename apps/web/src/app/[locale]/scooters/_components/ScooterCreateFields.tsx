"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  FormSection,
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
} from "@repo/ui/components";
import { FormField } from "@/components/form/FormField";
import { FormBooleanRow } from "@/components/form/FormBooleanRow";
import { FormSegmentedRadioGroup } from "@/components/form/controls";
import {
  ScooterEditorFieldControl,
  ScooterInitialRegistrationFields,
  ScooterTechnicalFields,
} from "./ScooterEditorFields";
import { CivMetadataFields } from "./CivMetadataFields";
import { ScooterCreateInsuranceFields } from "./ScooterCreateInsuranceFields";
import type { ScooterEditorValues } from "./scooter-editor-schema";
import { OPERATIONAL_FIELDS } from "./scooter-wizard";
import { useScooterLicenseAutofill } from "./useScooterLicenseAutofill";
import type { DocumentImportResult } from "./scooter-document-import";
import { useEffect } from "react";
import { ScooterFleetNumberField } from "./ScooterFleetNumberField";
import { ScooterSectionComplete } from "./ScooterSectionComplete";

export function ScooterCreateFields({
  brands,
  editing = false,
  onBrandCreated,
  disabled,
  importResult,
  photos,
}: {
  editing?: boolean;
  brands: v1.scooterBrands.ScooterBrand[];
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  disabled: boolean;
  photos?: ReactNode;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
}) {
  const t = useTranslations("scooters");
  const {
    control,
    formState: { errors, submitCount, isSubmitting },
  } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  const registration = useWatch({ control, name: "registrationType" });
  const props = { brands, onBrandCreated, disabled, powertrain };
  const [technicalReviewOpen, setTechnicalReviewOpen] = useState(false);
  const technicalSheetRef = useRef<HTMLDivElement>(null);
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
      "registrationType",
      "registrationNumber",
      "registrationDate",
      "registrationCertificateNumber",
      "temporaryRegistrationExpiresAt",
      "requiredLicenseCategory",
      "insurancePolicies",
      ...OPERATIONAL_FIELDS,
    ]);
    const frame = requestAnimationFrame(() => {
      if (Object.keys(errors).some((name) => !mainFields.has(name)))
        setTechnicalReviewOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [submitCount, isSubmitting, errors]);
  const license = useScooterLicenseAutofill(editing);
  const onImport = license.onImport;
  useEffect(() => {
    if (importResult) onImport(importResult);
  }, [importResult, onImport]);

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
        {!editing ? (
          <ScooterFleetNumberField brands={brands} disabled={disabled} />
        ) : null}
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
          <ScooterEditorFieldControl name="engineDisplacementCc" {...props} />
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
        onManualLicenseChange={license.onManualLicenseChange}
      />
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
        onClick={() => setTechnicalReviewOpen(true)}
      >
        {t("wizard.otherFields")}
      </Button>
      <BottomSheet
        open={technicalReviewOpen}
        onOpenChange={setTechnicalReviewOpen}
      >
        <BottomSheetContent
          fullScreen
          ref={technicalSheetRef}
          initialFocus={() =>
            technicalSheetRef.current?.querySelector<HTMLElement>(
              'input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]',
            ) ?? true
          }
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{t("documentImport.title")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("documentImport.help")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
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
              ]}
              {...props}
            />
            <CivMetadataFields disabled={disabled} />
          </BottomSheetBody>
          <BottomSheetFooter>
            <Button type="button" onClick={() => setTechnicalReviewOpen(false)}>
              {t("creation.conditionDone")}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
