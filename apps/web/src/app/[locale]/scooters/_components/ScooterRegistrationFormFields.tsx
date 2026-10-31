"use client";

import { v1 } from "@repo/api-shared";
import {
  FormSection,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { NormalizedInput } from "@repo/ui/components/normalized-input";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import type { ScooterFormErrors, ScooterFormState } from "./scooter-form";
import { DatePartsInput } from "@/components/DateField";

interface ScooterRegistrationFormFieldsProps {
  formId: string;
  form: ScooterFormState;
  errors: ScooterFormErrors;
  disabled?: boolean;
  onSetValue: <Key extends keyof ScooterFormState>(
    key: Key,
    value: ScooterFormState[Key],
  ) => void;
}

const uppercasePlate = (value: string) => value.toUpperCase();

export function ScooterRegistrationFormFields({
  formId,
  form,
  errors,
  disabled,
  onSetValue,
}: ScooterRegistrationFormFieldsProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();

  function changeRegistrationType(
    registrationType: v1.scooters.ScooterRegistrationType,
  ) {
    onSetValue("registrationType", registrationType);
    if (registrationType === "unregistered") {
      onSetValue("registrationNumber", "");
      onSetValue("registrationDate", { day: "", month: "", year: "" });
    }
    if (registrationType !== "temporary") {
      onSetValue("temporaryRegistrationExpiresAt", {
        day: "",
        month: "",
        year: "",
      });
    }
  }

  const registered = form.registrationType !== "unregistered";

  return (
    <FormSection>
      <Field
        id={`${formId}-registration-type`}
        label={t("fields.registrationType")}
        required
        error={errors.registrationType}
      >
        <Select
          value={form.registrationType}
          onValueChange={(value) =>
            changeRegistrationType(value as v1.scooters.ScooterRegistrationType)
          }
          disabled={disabled}
        >
          <SelectTrigger id={`${formId}-registration-type`} className="w-full">
            <SelectValue placeholder={t("placeholders.registrationType")} />
          </SelectTrigger>
          <SelectContent>
            {v1.scooters.SCOOTER_REGISTRATION_TYPES.map((registrationType) => (
              <SelectItem key={registrationType} value={registrationType}>
                {t(`registrationTypes.${registrationType}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {registered ? (
        <>
          <TextField
            id={`${formId}-plate-number`}
            label={t("fields.registrationNumber")}
            required
            value={form.registrationNumber}
            normalize={uppercasePlate}
            autoCapitalize="characters"
            error={errors.registrationNumber}
            placeholder={t(
              `placeholders.registrationNumber.${form.registrationType}`,
            )}
            disabled={disabled}
            onChange={(value) => onSetValue("registrationNumber", value)}
          />
          {form.registrationType === "temporary" ? (
            <Field
              id={`${formId}-registration-expires-on-day`}
              label={t("fields.temporaryRegistrationExpiresAt")}
              required
              error={errors.temporaryRegistrationExpiresAt}
            >
              <DatePartsInput
                baseId={`${formId}-registration-expires-on`}
                aria-describedby={
                  errors.temporaryRegistrationExpiresAt
                    ? `${formId}-registration-expires-on-day-error`
                    : undefined
                }
                disabled={disabled}
                invalid={Boolean(errors.temporaryRegistrationExpiresAt)}
                label={t("fields.temporaryRegistrationExpiresAt")}
                locale={locale}
                value={form.temporaryRegistrationExpiresAt}
                onChange={(value) =>
                  onSetValue("temporaryRegistrationExpiresAt", value)
                }
              />
            </Field>
          ) : null}
        </>
      ) : null}
      <Field
        id={`${formId}-required-driver-license-type`}
        label={t("fields.requiredLicenseCategory")}
        required
        error={errors.requiredLicenseCategory}
      >
        <Select
          value={form.requiredLicenseCategory}
          onValueChange={(value) =>
            onSetValue(
              "requiredLicenseCategory",
              value as v1.scooters.ScooterRequiredDriverLicenseType,
            )
          }
          disabled={disabled}
        >
          <SelectTrigger
            id={`${formId}-required-driver-license-type`}
            className="w-full"
          >
            <SelectValue
              placeholder={t("placeholders.requiredLicenseCategory")}
            />
          </SelectTrigger>
          <SelectContent>
            {v1.scooters.SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES.map(
              (licenseType) => (
                <SelectItem key={licenseType} value={licenseType}>
                  {t(`requiredDriverLicenseTypes.${licenseType}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </Field>
    </FormSection>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  required,
  onChange,
  className,
  normalize,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
  className?: string;
  normalize?: (value: string) => string;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange" | "type">) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      {normalize ? (
        <NormalizedInput
          {...props}
          id={id}
          value={value}
          onValueChange={onChange}
          normalize={normalize}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={className}
        />
      ) : (
        <Input
          id={id}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={className}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
      )}
    </Field>
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required ? (
          <span aria-hidden="true" className="text-foreground">
            *
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
