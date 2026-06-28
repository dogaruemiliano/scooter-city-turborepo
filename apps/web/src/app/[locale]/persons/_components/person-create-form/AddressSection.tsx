"use client";

import { CountrySelect, Input, type CountryCode } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { ROMANIAN_COUNTIES } from "./constants";
import { fieldErrorId, invalidAria } from "./errors";
import { FormField, FormSection } from "./FormLayout";
import type {
  CreatePersonFormState,
  FormErrors,
  SetPersonFormValue,
} from "./types";

export function AddressSection({
  formId,
  form,
  fieldErrors,
  locale,
  onSetFormValue,
  onChangeCountry,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  onSetFormValue: SetPersonFormValue;
  onChangeCountry: (value: CountryCode) => void;
}) {
  const t = useTranslations("persons");
  const countryCodeError = fieldErrors.countryCode;
  const addressLine1Error = fieldErrors.addressLine1;
  const addressLine2Error = fieldErrors.addressLine2;
  const cityError = fieldErrors.city;
  const postalCodeError = fieldErrors.postalCode;

  return (
    <FormSection title={t("sections.address")}>
      <FormField
        id={`${formId}-country`}
        label={t("fields.country")}
        required
        error={countryCodeError}
      >
        <CountrySelect
          id={`${formId}-country`}
          aria-describedby={fieldErrorId(`${formId}-country`, countryCodeError)}
          aria-invalid={invalidAria(countryCodeError)}
          name="countryCode"
          autoComplete="country"
          locale={locale}
          required
          value={form.countryCode}
          onValueChange={onChangeCountry}
        />
      </FormField>
      {form.countryCode === "RO" ? (
        <FormField
          id={`${formId}-county`}
          label={t("fields.county")}
          error={fieldErrors.region}
        >
          <select
            id={`${formId}-county`}
            aria-describedby={fieldErrorId(
              `${formId}-county`,
              fieldErrors.region,
            )}
            aria-invalid={invalidAria(fieldErrors.region)}
            name="region"
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-base transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm"
            value={form.region}
            onChange={(event) => {
              onSetFormValue("region", event.target.value);
            }}
          >
            <option value="">{t("placeholders.county")}</option>
            {ROMANIAN_COUNTIES.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField
          id={`${formId}-region`}
          label={t("fields.region")}
          error={fieldErrors.region}
        >
          <Input
            id={`${formId}-region`}
            aria-describedby={fieldErrorId(
              `${formId}-region`,
              fieldErrors.region,
            )}
            aria-invalid={invalidAria(fieldErrors.region)}
            name="region"
            autoComplete="address-level1"
            value={form.region}
            onChange={(event) => onSetFormValue("region", event.target.value)}
          />
        </FormField>
      )}
      <FormField
        id={`${formId}-address-line-1`}
        label={t("fields.addressLine1")}
        error={addressLine1Error}
      >
        <Input
          id={`${formId}-address-line-1`}
          aria-describedby={fieldErrorId(
            `${formId}-address-line-1`,
            addressLine1Error,
          )}
          aria-invalid={invalidAria(addressLine1Error)}
          name="addressLine1"
          autoComplete="address-line1"
          value={form.addressLine1}
          onChange={(event) =>
            onSetFormValue("addressLine1", event.target.value)
          }
        />
      </FormField>
      <FormField
        id={`${formId}-address-line-2`}
        label={t("fields.addressLine2")}
        error={addressLine2Error}
      >
        <Input
          id={`${formId}-address-line-2`}
          aria-describedby={fieldErrorId(
            `${formId}-address-line-2`,
            addressLine2Error,
          )}
          aria-invalid={invalidAria(addressLine2Error)}
          name="addressLine2"
          autoComplete="address-line2"
          value={form.addressLine2}
          onChange={(event) =>
            onSetFormValue("addressLine2", event.target.value)
          }
        />
      </FormField>
      <FormField
        id={`${formId}-city`}
        label={t("fields.city")}
        error={cityError}
      >
        <Input
          id={`${formId}-city`}
          aria-describedby={fieldErrorId(`${formId}-city`, cityError)}
          aria-invalid={invalidAria(cityError)}
          name="city"
          autoComplete="address-level2"
          value={form.city}
          onChange={(event) => onSetFormValue("city", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${formId}-postal-code`}
        label={t("fields.postalCode")}
        error={postalCodeError}
      >
        <Input
          id={`${formId}-postal-code`}
          aria-describedby={fieldErrorId(
            `${formId}-postal-code`,
            postalCodeError,
          )}
          aria-invalid={invalidAria(postalCodeError)}
          name="postalCode"
          autoComplete="postal-code"
          value={form.postalCode}
          onChange={(event) => onSetFormValue("postalCode", event.target.value)}
        />
      </FormField>
    </FormSection>
  );
}
