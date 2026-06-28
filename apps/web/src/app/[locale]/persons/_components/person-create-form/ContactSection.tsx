"use client";

import {
  Input,
  PhoneNumberInput,
  type PhoneNumberInputChangeDetails,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { DatePartsInput } from "./DatePartsInput";
import { fieldErrorId, invalidAria } from "./errors";
import { FormField, FormSection } from "./FormLayout";
import { Under18Warning } from "./Under18Warning";
import type {
  CreatePersonFormState,
  FormErrors,
  SetPersonFormValue,
} from "./types";

export function ContactSection({
  formId,
  form,
  fieldErrors,
  locale,
  showUnder18Warning,
  onSetFormValue,
  onChangePhone,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  onSetFormValue: SetPersonFormValue;
  onChangePhone: (
    value: string,
    details: PhoneNumberInputChangeDetails,
  ) => void;
}) {
  const t = useTranslations("persons");
  const firstNameError = fieldErrors.firstName;
  const lastNameError = fieldErrors.lastName;
  const emailError = fieldErrors.email;
  const dateOfBirthError = fieldErrors.dateOfBirth;

  return (
    <FormSection title={t("sections.contact")}>
      <FormField
        id={`${formId}-first-name`}
        label={t("fields.firstName")}
        required
        error={firstNameError}
      >
        <Input
          id={`${formId}-first-name`}
          aria-describedby={fieldErrorId(
            `${formId}-first-name`,
            firstNameError,
          )}
          aria-invalid={invalidAria(firstNameError)}
          name="firstName"
          autoComplete="given-name"
          maxLength={100}
          required
          value={form.firstName}
          onChange={(event) => onSetFormValue("firstName", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${formId}-last-name`}
        label={t("fields.lastName")}
        required
        error={lastNameError}
      >
        <Input
          id={`${formId}-last-name`}
          aria-describedby={fieldErrorId(`${formId}-last-name`, lastNameError)}
          aria-invalid={invalidAria(lastNameError)}
          name="lastName"
          autoComplete="family-name"
          maxLength={100}
          required
          value={form.lastName}
          onChange={(event) => onSetFormValue("lastName", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${formId}-email`}
        label={t("fields.email")}
        required
        error={emailError}
      >
        <Input
          id={`${formId}-email`}
          aria-describedby={fieldErrorId(`${formId}-email`, emailError)}
          aria-invalid={invalidAria(emailError)}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(event) => onSetFormValue("email", event.target.value)}
        />
      </FormField>
      <FormField id={`${formId}-phone`} label={t("fields.phone")} required>
        <PhoneNumberInput
          id={`${formId}-phone`}
          name="phone"
          defaultCountry={form.phoneCountry}
          locale={locale}
          placeholder={t("placeholders.phone")}
          required
          invalid={Boolean(fieldErrors.phone)}
          errorMessage={fieldErrors.phone}
          countrySelectLabel={t("fields.phoneCountry")}
          numberInputLabel={t("fields.phone")}
          onValueChange={onChangePhone}
        />
      </FormField>
      {form.citizenship === "foreign" ? (
        <>
          <FormField
            id={`${formId}-date-of-birth-day`}
            label={t("fields.dateOfBirth")}
            error={dateOfBirthError}
          >
            <DatePartsInput
              baseId={`${formId}-date-of-birth`}
              aria-describedby={fieldErrorId(
                `${formId}-date-of-birth-day`,
                dateOfBirthError,
              )}
              invalid={Boolean(dateOfBirthError)}
              label={t("fields.dateOfBirth")}
              locale={locale}
              value={form.dateOfBirth}
              onChange={(value) => onSetFormValue("dateOfBirth", value)}
            />
          </FormField>
          {showUnder18Warning ? (
            <Under18Warning message={t("feedback.under18Warning")} />
          ) : null}
        </>
      ) : null}
    </FormSection>
  );
}
