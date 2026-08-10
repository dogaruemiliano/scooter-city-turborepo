"use client";

import { ApiError, v1 } from "@repo/api-shared";
import { Button, buttonVariants, FormSection } from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider } from "react-hook-form";

import {
  FormCountrySelect,
  FormDateField,
  FormInput,
  FormPhoneInput,
  FormTextarea,
} from "@/components/form/controls";
import { FormField } from "@/components/form/FormField";
import { FormSummary } from "@/components/form/FormSummary";
import { useZodForm } from "@/lib/form/use-zod-form";
import { webApi } from "@/lib/api";
import { personFormState } from "./PersonDetailPage/helpers";
import type { PersonFormState } from "./PersonDetailPage/types";
import {
  personEditFormSchema,
  personFieldLabelKey,
} from "./person-edit-schema";

interface PersonEditFormProps {
  person: v1.persons.Person;
  personHref: string;
}

export function PersonEditForm({ person, personHref }: PersonEditFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const today = v1.common.dateOnlyToday();

  const form = useZodForm<PersonFormState, v1.persons.UpdatePersonInput>(
    personEditFormSchema,
    {
      defaultValues: personFormState(person),
      labelFor: (path) => t(`fields.${personFieldLabelKey(path)}`),
    },
  );

  async function submit(input: v1.persons.UpdatePersonInput) {
    setRequestError(null);
    setSaving(true);

    try {
      await webApi.fetch(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        { method: "PATCH", json: input },
      );

      router.push(personHref);
      router.refresh();
    } catch (caught) {
      setRequestError(
        caught instanceof ApiError
          ? caught.message
          : t("feedback.genericError"),
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <FormProvider {...form}>
        <form
          className="grid gap-8"
          noValidate
          onSubmit={form.handleSubmit(submit)}
        >
          <FormSummary
            title={t("feedback.updateErrorTitle")}
            message={requestError}
          />

          <FormSection title={t("sections.contact")}>
            <FormField name="firstName" label={t("fields.firstName")} required>
              <FormInput />
            </FormField>
            <FormField name="lastName" label={t("fields.lastName")} required>
              <FormInput />
            </FormField>
            <FormField name="email" label={t("fields.email")} required>
              <FormInput type="email" />
            </FormField>
            <FormField name="phone" label={t("fields.phone")} required>
              <FormPhoneInput
                locale={locale}
                placeholder={t("placeholders.phone")}
                countrySelectLabel={t("fields.phoneCountry")}
                numberInputLabel={t("fields.phone")}
              />
            </FormField>
            <FormField
              name="dateOfBirth"
              label={t("fields.dateOfBirth")}
              labelSuffix="day"
            >
              <FormDateField maxDate={today} />
            </FormField>
          </FormSection>

          <FormSection title={t("sections.address")}>
            <FormField name="countryCode" label={t("fields.country")}>
              <FormCountrySelect
                label={t("fields.country")}
                locale={locale}
                placeholder={t("placeholders.country")}
                disabled={saving}
                searchPlaceholder={t("countryPicker.search")}
                clearSearchLabel={t("countryPicker.clearSearch")}
                emptyMessage={t("countryPicker.empty")}
                closeLabel={t("actions.close")}
              />
            </FormField>
            <FormField name="region" label={t("fields.region")}>
              <FormInput />
            </FormField>
            <FormField name="city" label={t("fields.city")}>
              <FormInput />
            </FormField>
            <FormField name="postalCode" label={t("fields.postalCode")}>
              <FormInput />
            </FormField>
            <FormField
              name="addressLine1"
              label={t("fields.addressLine1")}
              className="sm:col-span-2"
            >
              <FormInput />
            </FormField>
            <FormField
              name="addressLine2"
              label={t("fields.addressLine2")}
              className="sm:col-span-2"
            >
              <FormInput />
            </FormField>
          </FormSection>

          <FormSection>
            <FormField
              name="notes"
              label={t("fields.notes")}
              className="sm:col-span-2"
            >
              <FormTextarea rows={4} />
            </FormField>
          </FormSection>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              href={personHref}
              className={buttonVariants({
                variant: "outline",
                className: saving ? "pointer-events-none opacity-60" : "",
              })}
              aria-disabled={saving}
            >
              {t("actions.cancel")}
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? t("actions.saving") : t("actions.save")}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
