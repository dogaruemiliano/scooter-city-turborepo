"use client";

import { Input, FormSection } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
import { Under18Warning } from "./Under18Warning";
import type {
  CreatePersonFormState,
  FormErrors,
  SetPersonFormValue,
} from "./types";
import { DatePartsInput } from "@/components/DateField";
import { dateDigits } from "@repo/ui/lib/date-parts";

export function PersonalSection({
  formId,
  form,
  fieldErrors,
  locale,
  showUnder18Warning,
  onSetFormValue,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  onSetFormValue: SetPersonFormValue;
}) {
  const t = useTranslations("persons");
  const firstNameError = fieldErrors.firstName;
  const lastNameError = fieldErrors.lastName;
  const dateOfBirthError = fieldErrors.dateOfBirth;

  return (
    <FormSection>
      <FormField
        id={`${formId}-first-name`}
        extractionKey="person.firstName"
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
        extractionKey="person.lastName"
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
        id={`${formId}-cnp`}
        extractionKey="person.cnp"
        label={t("fields.documentCnp")}
        required={form.citizenship === "romanian"}
        error={fieldErrors.cnp}
      >
        <Input
          id={`${formId}-cnp`}
          name="cnp"
          inputMode="numeric"
          maxLength={13}
          value={form.cnp}
          aria-invalid={invalidAria(fieldErrors.cnp)}
          aria-describedby={fieldErrorId(`${formId}-cnp`, fieldErrors.cnp)}
          onChange={(event) =>
            onSetFormValue("cnp", dateDigits(event.target.value, 13))
          }
        />
      </FormField>
      {form.citizenship === "romanian" && showUnder18Warning ? (
        <Under18Warning message={t("feedback.under18Warning")} />
      ) : null}
      {form.citizenship === "foreign" ? (
        <>
          <FormField
            id={`${formId}-date-of-birth-day`}
            extractionKey="person.dateOfBirth"
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
