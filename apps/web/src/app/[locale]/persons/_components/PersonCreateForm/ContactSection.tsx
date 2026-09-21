"use client";

import {
  Input,
  PhoneNumberInput,
  type PhoneNumberInputChangeDetails,
  FormSection,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { EmailDomainSuggestions } from "@/components/form/EmailDomainSuggestions";

import { fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
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
  onSetFormValue,
  onChangePhone,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  onSetFormValue: SetPersonFormValue;
  onChangePhone: (
    value: string,
    details: PhoneNumberInputChangeDetails,
  ) => void;
}) {
  const t = useTranslations("persons");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailError = fieldErrors.email;

  return (
    <FormSection aria-label={t("sections.contact")}>
      <FormField
        id={`${formId}-email`}
        label={t("fields.email")}
        required
        error={emailError}
      >
        <Input
          ref={emailInputRef}
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
        <EmailDomainSuggestions
          email={form.email}
          onChange={(email) => onSetFormValue("email", email)}
          inputRef={emailInputRef}
        />
      </FormField>
      <FormField id={`${formId}-phone`} label={t("fields.phone")} required>
        <PhoneNumberInput
          id={`${formId}-phone`}
          name="phone"
          defaultCountry={form.phoneCountry}
          value={form.phone}
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
    </FormSection>
  );
}
