"use client";

import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  FormSection,
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
} from "@repo/ui/components";
import { GaugeIcon, ClipboardCheckIcon } from "lucide-react";
import { FormField } from "@/components/form/FormField";
import { FormSegmentedRadioGroup } from "@/components/form/controls";
import {
  ScooterEditorFieldControl,
  ScooterInitialRegistrationFields,
  ScooterTechnicalFields,
} from "./ScooterEditorFields";
import { CivMetadataFields } from "./CivMetadataFields";
import { ScooterInsuranceInspector } from "./ScooterInsuranceInspector";
import type { ScooterEditorValues } from "./scooter-editor-schema";
import { OPERATIONAL_FIELDS } from "./scooter-wizard";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { useScooterLicenseAutofill } from "./useScooterLicenseAutofill";
import type { DocumentImportResult } from "./scooter-document-import";
import { useEffect } from "react";
import type { ScooterVinCorrection } from "./scooter-vin-review";

export function ScooterCreateFields({
  brands,
  onBrandCreated,
  disabled,
  documents,
  importResult,
  onReviewVin,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  disabled: boolean;
  documents: ScooterDocumentsEditor;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
  onReviewVin: (corrections: ScooterVinCorrection[]) => boolean;
}) {
  const t = useTranslations("scooters");
  const {
    control,
    formState: { errors, submitCount, isSubmitting },
  } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  const operational = useWatch({ control, name: OPERATIONAL_FIELDS });
  const props = { brands, onBrandCreated, disabled, powertrain };
  const [conditionOpen, setConditionOpen] = useState(false);
  const [technicalReviewOpen, setTechnicalReviewOpen] = useState(false);
  const openedAttempt = useRef(0);
  useEffect(() => {
    if (!submitCount || isSubmitting || openedAttempt.current === submitCount)
      return;
    openedAttempt.current = submitCount;
    const mainFields = new Set([
      "vin",
      "brandId",
      "model",
      "manufactureYear",
      "color",
      "powertrainType",
      "engineDisplacementCc",
      "powerKw",
      "electricMotorPowerKw",
      "vehicleCategory",
      "vehicleCategoryOther",
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
      if (OPERATIONAL_FIELDS.some((name) => errors[name]))
        setConditionOpen(true);
      else if (Object.keys(errors).some((name) => !mainFields.has(name)))
        setTechnicalReviewOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [submitCount, isSubmitting, errors]);
  const license = useScooterLicenseAutofill(false);
  const onImport = license.onImport;
  useEffect(() => {
    if (importResult) onImport(importResult);
  }, [importResult, onImport]);

  return (
    <div className="grid min-w-0 gap-10">
      <FormSection number={1} title={t("sections.identity")}>
        {(["vin", "brandId", "model", "manufactureYear", "color"] as const).map(
          (name) => (
            <ScooterEditorFieldControl key={name} name={name} {...props} />
          ),
        )}
      </FormSection>
      <FormSection number={2} panel title={t("creation.propulsion")}>
        <div className="sm:col-span-2">
          <FormField
            name="powertrainType"
            label={t("fields.powertrainType")}
            required
            disabled={disabled}
          >
            <FormSegmentedRadioGroup
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
        {powertrain !== "unpowered" ? (
          <ScooterEditorFieldControl
            name={
              powertrain === "electric" ? "electricMotorPowerKw" : "powerKw"
            }
            {...props}
          />
        ) : null}
        <ScooterEditorFieldControl name="vehicleCategory" {...props} />
      </FormSection>
      <div className="grid gap-6">
        <ScooterInitialRegistrationFields
          panel
          disabled={disabled}
          onManualLicenseChange={license.onManualLicenseChange}
        />
        <ScooterInsuranceInspector
          documents={documents}
          disabled={disabled}
          onReviewVin={onReviewVin}
        />
      </div>
      <Card as="section">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <GaugeIcon aria-hidden="true" className="size-5" />
              {t("creation.initialCondition")}
            </CardTitle>
            <Badge variant="secondary">{t("creation.optional")}</Badge>
          </div>
          <CardDescription>{t("creation.conditionHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          {operational.some(Boolean) ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <ClipboardCheckIcon aria-hidden="true" className="size-4" />
              {t("creation.conditionRecorded")}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setConditionOpen(true)}
          >
            {t("creation.conditionAction")}
          </Button>
        </CardContent>
      </Card>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("creation.civLater")}
      </p>
      <BottomSheet open={conditionOpen} onOpenChange={setConditionOpen}>
        <BottomSheetContent className="lg:w-96">
          <BottomSheetHeader>
            <BottomSheetTitle>
              {t("creation.initialCondition")}
            </BottomSheetTitle>
            <BottomSheetDescription>
              {t("creation.conditionHelp")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
            {OPERATIONAL_FIELDS.map((name) => (
              <ScooterEditorFieldControl key={name} name={name} {...props} />
            ))}
          </BottomSheetBody>
          <BottomSheetFooter>
            <Button type="button" onClick={() => setConditionOpen(false)}>
              {t("creation.conditionDone")}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
      <BottomSheet
        open={technicalReviewOpen}
        onOpenChange={setTechnicalReviewOpen}
      >
        <BottomSheetContent fullScreen>
          <BottomSheetHeader>
            <BottomSheetTitle>{t("documentImport.title")}</BottomSheetTitle>
            <BottomSheetDescription>
              {t("documentImport.help")}
            </BottomSheetDescription>
          </BottomSheetHeader>
          <BottomSheetBody>
            <ScooterTechnicalFields compact={false} {...props} />
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
