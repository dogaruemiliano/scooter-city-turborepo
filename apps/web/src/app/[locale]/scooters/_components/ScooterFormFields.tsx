"use client";

import { v1 } from "@repo/api-shared";
import {
  Button,
  DatePartsInput,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import type { ScooterFormErrors, ScooterFormState } from "./scooter-form";

interface ScooterFormFieldsProps {
  formId: string;
  form: ScooterFormState;
  errors: ScooterFormErrors;
  disabled?: boolean;
  includeRegistration?: boolean;
  onSetValue: <Key extends keyof ScooterFormState>(
    key: Key,
    value: ScooterFormState[Key],
  ) => void;
}

export function ScooterFormFields({
  formId,
  form,
  errors,
  disabled,
  includeRegistration = true,
  onSetValue,
}: ScooterFormFieldsProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();

  function changePowertrain(powertrainType: v1.scooters.ScooterPowertrainType) {
    onSetValue("powertrainType", powertrainType);
    if (powertrainType === "electric") {
      onSetValue("engineCc", "");
    }
  }

  return (
    <>
      <FormSection title={t("sections.identity")}>
        <TextField
          id={`${formId}-vin`}
          label={t("fields.vin")}
          required
          value={form.vin}
          error={errors.vin}
          maxLength={17}
          placeholder={t("placeholders.vin")}
          disabled={disabled}
          onChange={(value) => onSetValue("vin", value.toUpperCase())}
        />
        <TextField
          id={`${formId}-brand`}
          label={t("fields.brand")}
          required
          value={form.brand}
          error={errors.brand}
          placeholder={t("placeholders.brand")}
          disabled={disabled}
          onChange={(value) => onSetValue("brand", value)}
        />
        <TextField
          id={`${formId}-model`}
          label={t("fields.model")}
          required
          value={form.model}
          error={errors.model}
          placeholder={t("placeholders.model")}
          disabled={disabled}
          onChange={(value) => onSetValue("model", value)}
        />
        <TextField
          id={`${formId}-color`}
          label={t("fields.color")}
          required
          value={form.color}
          error={errors.color}
          placeholder={t("placeholders.color")}
          disabled={disabled}
          onChange={(value) => onSetValue("color", value)}
        />
      </FormSection>

      <FormSection title={t("sections.technical")}>
        <TextField
          id={`${formId}-manufacture-year`}
          label={t("fields.manufactureYear")}
          required
          type="number"
          inputMode="numeric"
          value={form.manufactureYear}
          error={errors.manufactureYear}
          placeholder={t("placeholders.manufactureYear")}
          disabled={disabled}
          onChange={(value) => onSetValue("manufactureYear", value)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm leading-none font-medium">
            {t("fields.powertrainType")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {v1.scooters.SCOOTER_POWERTRAIN_TYPES.map((powertrainType) => (
              <Button
                key={powertrainType}
                type="button"
                variant={
                  form.powertrainType === powertrainType ? "default" : "outline"
                }
                aria-pressed={form.powertrainType === powertrainType}
                disabled={disabled}
                onClick={() => changePowertrain(powertrainType)}
              >
                {t(`powertrainTypes.${powertrainType}`)}
              </Button>
            ))}
          </div>
          {errors.powertrainType ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.powertrainType}
            </p>
          ) : null}
        </div>
        {form.powertrainType === "combustion" ? (
          <TextField
            id={`${formId}-engine-cc`}
            label={t("fields.engineCc")}
            required
            type="number"
            inputMode="numeric"
            value={form.engineCc}
            error={errors.engineCc}
            placeholder={t("placeholders.engineCc")}
            disabled={disabled}
            onChange={(value) => onSetValue("engineCc", value)}
          />
        ) : null}
        <TextField
          id={`${formId}-power-kw`}
          label={t("fields.powerKw")}
          type="number"
          inputMode="decimal"
          value={form.powerKw}
          error={errors.powerKw}
          placeholder={t("placeholders.powerKw")}
          disabled={disabled}
          onChange={(value) => onSetValue("powerKw", value)}
        />
      </FormSection>

      {includeRegistration ? (
        <ScooterRegistrationFormFields
          formId={formId}
          form={form}
          errors={errors}
          disabled={disabled}
          onSetValue={onSetValue}
        />
      ) : null}

      <FormSection title={t("sections.purchase")}>
        <Field
          id={`${formId}-purchased-on-day`}
          label={t("fields.purchasedOn")}
          required
          error={errors.purchasedOn}
        >
          <DatePartsInput
            baseId={`${formId}-purchased-on`}
            aria-describedby={
              errors.purchasedOn
                ? `${formId}-purchased-on-day-error`
                : undefined
            }
            disabled={disabled}
            invalid={Boolean(errors.purchasedOn)}
            label={t("fields.purchasedOn")}
            locale={locale}
            value={form.purchasedOn}
            onChange={(value) => onSetValue("purchasedOn", value)}
          />
        </Field>
      </FormSection>

      <FormSection title={t("sections.notes")}>
        <div className="sm:col-span-2">
          <TextareaField
            id={`${formId}-notes`}
            label={t("fields.notes")}
            value={form.notes}
            error={errors.notes}
            placeholder={t("placeholders.notes")}
            disabled={disabled}
            onChange={(value) => onSetValue("notes", value)}
          />
        </div>
      </FormSection>
    </>
  );
}

export function ScooterRegistrationFormFields({
  formId,
  form,
  errors,
  disabled,
  onSetValue,
}: ScooterFormFieldsProps) {
  const t = useTranslations("scooters");
  const locale = useLocale();

  function changeRegistrationType(
    registrationType: v1.scooters.ScooterRegistrationType,
  ) {
    onSetValue("registrationType", registrationType);
    if (registrationType === "unregistered") {
      onSetValue("plateNumber", "");
      onSetValue("registeredOn", { day: "", month: "", year: "" });
      onSetValue("requiredDriverLicenseType", "none");
    }
    if (registrationType !== "temporary") {
      onSetValue("registrationExpiresOn", { day: "", month: "", year: "" });
    }
  }

  const registered = form.registrationType !== "unregistered";

  return (
    <FormSection title={t("sections.registration")}>
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
            <SelectValue />
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
            label={t("fields.plateNumber")}
            required
            value={form.plateNumber}
            error={errors.plateNumber}
            placeholder={t(`placeholders.plateNumber.${form.registrationType}`)}
            disabled={disabled}
            onChange={(value) => onSetValue("plateNumber", value)}
          />
          <Field
            id={`${formId}-registered-on-day`}
            label={t("fields.registeredOn")}
            required
            error={errors.registeredOn}
          >
            <DatePartsInput
              baseId={`${formId}-registered-on`}
              aria-describedby={
                errors.registeredOn
                  ? `${formId}-registered-on-day-error`
                  : undefined
              }
              disabled={disabled}
              invalid={Boolean(errors.registeredOn)}
              label={t("fields.registeredOn")}
              locale={locale}
              value={form.registeredOn}
              onChange={(value) => onSetValue("registeredOn", value)}
            />
          </Field>
          {form.registrationType === "temporary" ? (
            <Field
              id={`${formId}-registration-expires-on-day`}
              label={t("fields.registrationExpiresOn")}
              required
              error={errors.registrationExpiresOn}
            >
              <DatePartsInput
                baseId={`${formId}-registration-expires-on`}
                aria-describedby={
                  errors.registrationExpiresOn
                    ? `${formId}-registration-expires-on-day-error`
                    : undefined
                }
                disabled={disabled}
                invalid={Boolean(errors.registrationExpiresOn)}
                label={t("fields.registrationExpiresOn")}
                locale={locale}
                value={form.registrationExpiresOn}
                onChange={(value) => onSetValue("registrationExpiresOn", value)}
              />
            </Field>
          ) : null}
          <Field
            id={`${formId}-required-driver-license-type`}
            label={t("fields.requiredDriverLicenseType")}
            required
            error={errors.requiredDriverLicenseType}
          >
            <Select
              value={form.requiredDriverLicenseType}
              onValueChange={(value) =>
                onSetValue(
                  "requiredDriverLicenseType",
                  value as v1.scooters.ScooterRequiredDriverLicenseType,
                )
              }
              disabled={disabled}
            >
              <SelectTrigger
                id={`${formId}-required-driver-license-type`}
                className="w-full"
              >
                <SelectValue />
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
        </>
      ) : null}
    </FormSection>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg bg-muted p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </section>
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
  ...props
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
  className?: string;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      <Input
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={className}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </Field>
  );
}

function TextareaField({
  id,
  label,
  value,
  error,
  required,
  onChange,
  className,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
  className?: string;
} & Omit<ComponentProps<typeof Textarea>, "id" | "value" | "onChange">) {
  return (
    <Field id={id} label={label} required={required} error={error}>
      <Textarea
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("min-h-24", className)}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
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
          <span aria-hidden="true" className="text-destructive">
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
