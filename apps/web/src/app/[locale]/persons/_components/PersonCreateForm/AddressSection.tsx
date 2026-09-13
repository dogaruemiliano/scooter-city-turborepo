"use client";

import { v1 } from "@repo/api-shared";
import {
  CountrySheetSelect,
  SheetSelect,
  Input,
  type CountryCode,
  FormSection,
} from "@repo/ui/components";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { fieldErrorId, invalidAria } from "./errors";
import { FormField } from "./FormField";
import type {
  CreatePersonFormState,
  FormErrors,
  SetPersonFormValue,
} from "./types";

const COUNTY_OPTIONS = v1.persons.ROMANIAN_COUNTIES.map((county) => ({
  value: county,
  label: county,
}));

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
  const localities = useMemo(
    () =>
      v1.persons.getRomanianLocalities(form.region).map((locality) => ({
        value: locality.name,
        label: locality.name,
      })),
    [form.region],
  );

  return (
    <FormSection aria-label={t("sections.address")}>
      {form.citizenship !== "romanian" && (
        <FormField
          id={`${formId}-country`}
          extractionKey="person.countryCode"
          label={t("fields.country")}
          required
          error={countryCodeError}
        >
          <CountrySheetSelect
            id={`${formId}-country`}
            label={t("fields.country")}
            labelledById={`${formId}-country-label`}
            describedById={fieldErrorId(`${formId}-country`, countryCodeError)}
            invalid={Boolean(countryCodeError)}
            locale={locale}
            required
            value={form.countryCode}
            onValueChange={onChangeCountry}
            searchPlaceholder={t("countryPicker.search")}
            clearSearchLabel={t("countryPicker.clearSearch")}
            emptyMessage={t("countryPicker.empty")}
            closeLabel={t("actions.close")}
          />
        </FormField>
      )}
      {form.countryCode === "RO" ? (
        <FormField
          id={`${formId}-county`}
          extractionKey="person.region"
          required
          label={t("fields.county")}
          error={fieldErrors.region}
        >
          <SheetSelect
            required
            id={`${formId}-county`}
            label={t("fields.county")}
            labelledById={`${formId}-county-label`}
            describedById={fieldErrorId(`${formId}-county`, fieldErrors.region)}
            invalid={Boolean(fieldErrors.region)}
            options={COUNTY_OPTIONS}
            value={form.region}
            placeholder={t("placeholders.county")}
            onValueChange={(value) => {
              if (value === form.region) return;
              onSetFormValue("region", value);
              onSetFormValue("city", "");
            }}
            onClear={() => {
              onSetFormValue("region", "");
              onSetFormValue("city", "");
            }}
            clearOptionLabel={t("placeholders.county")}
            searchPlaceholder={t("countyPicker.search")}
            clearSearchLabel={t("countryPicker.clearSearch")}
            emptyMessage={t("countyPicker.empty")}
            closeLabel={t("actions.close")}
          />
        </FormField>
      ) : (
        <FormField
          id={`${formId}-region`}
          extractionKey="person.region"
          required
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
            required
            autoComplete="address-level1"
            value={form.region}
            onChange={(event) => onSetFormValue("region", event.target.value)}
          />
        </FormField>
      )}
      <FormField
        id={`${formId}-city`}
        extractionKey="person.city"
        required
        label={t("fields.city")}
        error={cityError}
      >
        {form.countryCode === "RO" ? (
          <SheetSelect
            required
            id={`${formId}-city`}
            label={t("fields.city")}
            labelledById={`${formId}-city-label`}
            describedById={fieldErrorId(`${formId}-city`, cityError)}
            invalid={Boolean(cityError)}
            disabled={!localities.length}
            options={localities}
            value={form.city}
            placeholder={t(
              form.region
                ? "placeholders.locality"
                : "placeholders.localityCountyFirst",
            )}
            onValueChange={(value) => onSetFormValue("city", value)}
            onClear={() => onSetFormValue("city", "")}
            clearOptionLabel={t("placeholders.locality")}
            searchPlaceholder={t("localityPicker.search")}
            clearSearchLabel={t("countryPicker.clearSearch")}
            emptyMessage={t("localityPicker.empty")}
            closeLabel={t("actions.close")}
          />
        ) : (
          <Input
            id={`${formId}-city`}
            aria-describedby={fieldErrorId(`${formId}-city`, cityError)}
            aria-invalid={invalidAria(cityError)}
            name="city"
            required
            autoComplete="address-level2"
            value={form.city}
            onChange={(event) => onSetFormValue("city", event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${formId}-address-line-1`}
        extractionKey="person.addressLine1"
        required
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
          required
          autoComplete="address-line1"
          value={form.addressLine1}
          onChange={(event) =>
            onSetFormValue("addressLine1", event.target.value)
          }
        />
      </FormField>
      <FormField
        id={`${formId}-address-line-2`}
        extractionKey="person.addressLine2"
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
    </FormSection>
  );
}
