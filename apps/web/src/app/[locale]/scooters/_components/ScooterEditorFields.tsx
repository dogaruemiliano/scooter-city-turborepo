"use client";

import { v1 } from "@repo/api-shared";
import { FormSection } from "@repo/ui/components";
import { useLocale, useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";

import { FormField } from "@/components/form/FormField";
import {
  FormDateField,
  FormDecimalInput,
  FormInput,
  FormSelect,
  FormTextarea,
} from "@/components/form/controls";
import { ScooterDocumentImport } from "./ScooterDocumentImport";
import { ScooterDocumentUpload } from "./ScooterDocumentUpload";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { CivMetadataFields } from "./CivMetadataFields";
import { useCivFieldHint } from "./useCivFieldHint";
import { useCivVocabulary } from "./CivVocabularyContext";
import { useId } from "react";
import { ScooterCivSelect } from "./ScooterCivSelect";
import { ScooterBrandField } from "./ScooterBrandField";
import {
  DECIMAL_FIELDS,
  INTEGER_FIELDS,
  SCOOTER_EDITOR_SECTIONS,
  type ScooterEditorField,
  type ScooterEditorValues,
} from "./scooter-editor-schema";

export function ScooterEditorFields({
  brands,
  documents,
  editing,
  disabled,
  onRawFields,
  rawFields,
  onBrandCreated,
}: {
  rawFields: Record<string, string>;
  onRawFields: (fields: Record<string, string>) => void;
  onBrandCreated: (brand: v1.scooterBrands.ScooterBrand) => void;
  documents: ScooterDocumentsEditor;
  brands: v1.scooterBrands.ScooterBrand[];
  editing: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("scooters");
  const { control } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  return (
    <>
      <ScooterDocumentUpload
        type="civ"
        documents={documents}
        disabled={disabled}
      />
      <ScooterDocumentUpload
        type="registration_certificate"
        documents={documents}
        disabled={disabled}
      />
      <ScooterDocumentImport
        brands={brands}
        editing={editing}
        disabled={disabled}
        onRawFields={onRawFields}
        rawFields={rawFields}
      />
      <CivMetadataFields disabled={disabled} />
      {SCOOTER_EDITOR_SECTIONS.filter((section) =>
        section.fields.some(
          (name) =>
            !(
              v1.scooters.inactivePowertrainFields(
                powertrain,
              ) as readonly string[]
            ).includes(name),
        ),
      ).map((section) => (
        <FormSection key={section.title} title={t(`sections.${section.title}`)}>
          {section.fields.map((name) => {
            if (
              (
                v1.scooters.inactivePowertrainFields(
                  powertrain,
                ) as readonly string[]
              ).includes(name)
            )
              return null;
            if (name === "fuelType" && powertrain === "electric") return null;
            if (name in v1.scooters.SCOOTER_CIV_OPTIONS)
              return (
                <ScooterCivSelect
                  key={name}
                  name={name as keyof typeof v1.scooters.SCOOTER_CIV_OPTIONS}
                  disabled={disabled}
                  powertrain={powertrain}
                />
              );
            if (name === "brandId")
              return (
                <ScooterBrandField
                  key={name}
                  brands={brands}
                  onBrandCreated={onBrandCreated}
                  disabled={disabled}
                />
              );
            if (name === "powertrainType")
              return <ScooterPowertrainField key={name} disabled={disabled} />;
            return (
              <ScooterTextField key={name} name={name} disabled={disabled} />
            );
          })}
        </FormSection>
      ))}
      {editing ? (
        <FormSection title={t("sections.registrationDocument")}>
          <ScooterTextField
            name="registrationCertificateNumber"
            disabled={disabled}
          />
        </FormSection>
      ) : (
        <ScooterInitialRegistrationFields disabled={disabled} />
      )}
    </>
  );
}

function ScooterTextField({
  name,
  disabled,
  placeholder,
}: {
  name: ScooterEditorField;
  disabled: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("scooters");
  const locale = useLocale();
  const labelHint = useCivFieldHint(name);
  const vocabulary = useCivVocabulary();
  const listId = useId();
  const suggestions = vocabulary.filter((item) => item.field === name);
  const uppercase = name === "vin" || name === "nationalRegistryNumber";
  const fieldPlaceholder = placeholder ?? t(`placeholders.${name}`);
  return (
    <FormField
      name={name}
      label={t(`fields.${name}`)}
      labelHint={labelHint}
      disabled={disabled}
      required={name === "vin"}
      className={
        ["notes", "civMentions"].includes(name) ? "sm:col-span-2" : undefined
      }
    >
      {["notes", "civMentions"].includes(name) ? (
        <FormTextarea placeholder={fieldPlaceholder} />
      ) : DECIMAL_FIELDS.has(name) ? (
        <FormDecimalInput locale={locale} placeholder={fieldPlaceholder} />
      ) : (
        <FormInput
          placeholder={fieldPlaceholder}
          inputMode={
            DECIMAL_FIELDS.has(name)
              ? "decimal"
              : INTEGER_FIELDS.has(name)
                ? "numeric"
                : undefined
          }
          list={suggestions.length ? listId : undefined}
          normalize={uppercase ? uppercaseIdentifier : undefined}
          autoCapitalize={uppercase ? "characters" : undefined}
          spellCheck={uppercase ? false : undefined}
        />
      )}
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map((item) => (
            <option key={item.value} value={item.value} />
          ))}
        </datalist>
      ) : null}
    </FormField>
  );
}

function ScooterPowertrainField({ disabled }: { disabled: boolean }) {
  const t = useTranslations("scooters");
  const labelHint = useCivFieldHint("propulsionSystem");
  const { clearErrors, control } = useFormContext<ScooterEditorValues>();
  const powertrain = useWatch({ control, name: "powertrainType" });
  return (
    <FormField
      name="powertrainType"
      label={t("fields.powertrainType")}
      labelHint={labelHint}
      required
      disabled={disabled}
    >
      <FormSelect
        placeholder={t("placeholders.powertrainType")}
        options={v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((value) => ({
          value,
          label: t(`powertrainTypes.${value}`),
        }))}
        onValueChange={(value) => {
          clearErrors([
            ...v1.scooters.inactivePowertrainFields(value),
            "fuelType",
            "fuelTypeOther",
          ]);
        }}
      />
      {powertrain === "electric" ? (
        <p className="text-sm text-muted-foreground">
          {t("civ.electricEnergy")}
        </p>
      ) : null}
    </FormField>
  );
}

const uppercaseIdentifier = (value: string) => value.toUpperCase();

function ScooterInitialRegistrationFields({ disabled }: { disabled: boolean }) {
  const t = useTranslations("scooters");
  const { control, getValues, setValue, clearErrors, setError } =
    useFormContext<ScooterEditorValues>();
  const registrationType = useWatch({ control, name: "registrationType" });
  const registrationDate = useWatch({ control, name: "registrationDate" });
  const registered = registrationType !== "unregistered";
  return (
    <FormSection title={t("sections.registration")}>
      <ScooterTextField
        name="registrationCertificateNumber"
        disabled={disabled}
      />
      <FormField
        name="registrationType"
        label={t("fields.registrationType")}
        required
        disabled={disabled}
      >
        <FormSelect
          placeholder={t("placeholders.registrationType")}
          options={v1.scooters.SCOOTER_REGISTRATION_TYPES.map((value) => ({
            value,
            label: t(`registrationTypes.${value}`),
          }))}
          onValueChange={(value) => {
            if (value === "unregistered") {
              for (const field of [
                "registrationNumber",
                "registrationDate",
                "registrationCertificateNumber",
                "temporaryRegistrationExpiresAt",
              ] as const) {
                setValue(field, "", { shouldDirty: true });
                clearErrors(field);
              }
              setValue("requiredLicenseCategory", "none", {
                shouldDirty: true,
              });
              clearErrors("requiredLicenseCategory");
            } else {
              if (!registered)
                setValue("requiredLicenseCategory", "", { shouldDirty: true });
              if (value !== "temporary") {
                setValue("temporaryRegistrationExpiresAt", "", {
                  shouldDirty: true,
                });
                clearErrors("temporaryRegistrationExpiresAt");
              }
              const plate = getValues("registrationNumber");
              if (plate) {
                if (
                  v1.scooters.validatePlateForRegistrationType(
                    value as v1.scooters.ScooterRegistrationType,
                    plate,
                  )
                )
                  clearErrors("registrationNumber");
                else
                  setError("registrationNumber", {
                    type: "validate",
                    message: t("feedback.validation.invalidPlateNumber"),
                  });
              }
            }
          }}
        />
      </FormField>
      {registered ? (
        <>
          <FormField
            name="registrationNumber"
            label={t("fields.registrationNumber")}
            required
            disabled={disabled}
          >
            <FormInput
              autoCapitalize="characters"
              placeholder={t(
                `placeholders.registrationNumber.${registrationType}`,
              )}
            />
          </FormField>
          <FormField
            name="registrationDate"
            label={t("fields.registrationDate")}
            labelSuffix="day"
            required
            disabled={disabled}
          >
            <FormDateField maxDate={v1.common.dateOnlyToday()} />
          </FormField>

          <FormField
            name="requiredLicenseCategory"
            label={t("fields.requiredLicenseCategory")}
            required
            disabled={disabled}
          >
            <FormSelect
              placeholder={t("placeholders.requiredLicenseCategory")}
              options={v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES.map(
                (value) => ({
                  value,
                  label: t(`requiredDriverLicenseTypes.${value}`),
                }),
              )}
            />
          </FormField>
          {registrationType === "temporary" ? (
            <FormField
              name="temporaryRegistrationExpiresAt"
              label={t("fields.temporaryRegistrationExpiresAt")}
              labelSuffix="day"
              required
              disabled={disabled}
            >
              <FormDateField minDate={registrationDate || undefined} />
            </FormField>
          ) : null}
        </>
      ) : null}
    </FormSection>
  );
}
