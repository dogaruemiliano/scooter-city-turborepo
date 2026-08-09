"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  buttonVariants,
  CountrySheetSelect,
  FormSection,
  Label,
  PhoneNumberInput,
} from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { blankToNull, personFormState } from "./PersonDetailPage/helpers";
import { TextareaField } from "./PersonDetailPage/TextareaField";
import { TextInputField } from "./PersonDetailPage/TextInputField";
import type { PersonFormState } from "./PersonDetailPage/types";

interface PersonEditFormProps {
  person: v1.persons.Person;
  personHref: string;
}

export function PersonEditForm({ person, personHref }: PersonEditFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const phoneId = useId();
  const countryId = useId();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => personFormState(person));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = v1.persons.updatePersonInputSchema.safeParse({
      email: form.email,
      phone: form.phone,
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: blankToNull(form.dateOfBirth),
      addressLine1: blankToNull(form.addressLine1),
      addressLine2: blankToNull(form.addressLine2),
      city: blankToNull(form.city),
      region: blankToNull(form.region),
      postalCode: blankToNull(form.postalCode),
      countryCode: blankToNull(form.countryCode),
      notes: blankToNull(form.notes),
    });

    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    setSaving(true);
    try {
      await webApi.fetch(
        v1.persons.ROUTES.update(person.id),
        v1.persons.personSchema,
        { method: "PATCH", json: input.data },
      );

      router.push(personHref);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("feedback.genericError"),
      );
      setSaving(false);
    }
  }

  function setValue<Key extends keyof PersonFormState>(
    key: Key,
    value: PersonFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <form
        className="grid gap-8"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormSection title={t("sections.contact")}>
          <TextInputField
            label={t("fields.firstName")}
            value={form.firstName}
            onChange={(value) => setValue("firstName", value)}
          />
          <TextInputField
            label={t("fields.lastName")}
            value={form.lastName}
            onChange={(value) => setValue("lastName", value)}
          />
          <TextInputField
            label={t("fields.email")}
            type="email"
            value={form.email}
            onChange={(value) => setValue("email", value)}
          />
          <div className="grid gap-2">
            <Label htmlFor={phoneId}>{t("fields.phone")}</Label>
            <PhoneNumberInput
              id={phoneId}
              value={form.phone}
              locale={locale}
              placeholder={t("placeholders.phone")}
              countrySelectLabel={t("fields.phoneCountry")}
              numberInputLabel={t("fields.phone")}
              onValueChange={(value) => setValue("phone", value)}
            />
          </div>
          <TextInputField
            label={t("fields.dateOfBirth")}
            date
            value={form.dateOfBirth}
            onChange={(value) => setValue("dateOfBirth", value)}
          />
        </FormSection>

        <FormSection title={t("sections.address")}>
          <div className="grid gap-2">
            <Label id={`${countryId}-label`}>{t("fields.country")}</Label>
            <CountrySheetSelect
              id={countryId}
              label={t("fields.country")}
              labelledById={`${countryId}-label`}
              locale={locale}
              value={form.countryCode}
              placeholder={t("placeholders.country")}
              onValueChange={(value) => setValue("countryCode", value)}
              disabled={saving}
              searchPlaceholder={t("countryPicker.search")}
              clearSearchLabel={t("countryPicker.clearSearch")}
              emptyMessage={t("countryPicker.empty")}
              closeLabel={t("actions.close")}
            />
          </div>
          <TextInputField
            label={t("fields.region")}
            value={form.region}
            onChange={(value) => setValue("region", value)}
          />
          <TextInputField
            label={t("fields.city")}
            value={form.city}
            onChange={(value) => setValue("city", value)}
          />
          <TextInputField
            label={t("fields.postalCode")}
            value={form.postalCode}
            onChange={(value) => setValue("postalCode", value)}
          />
          <TextInputField
            label={t("fields.addressLine1")}
            value={form.addressLine1}
            className="sm:col-span-2"
            onChange={(value) => setValue("addressLine1", value)}
          />
          <TextInputField
            label={t("fields.addressLine2")}
            value={form.addressLine2}
            className="sm:col-span-2"
            onChange={(value) => setValue("addressLine2", value)}
          />
        </FormSection>

        <FormSection>
          <TextareaField
            label={t("fields.notes")}
            value={form.notes}
            className="sm:col-span-2"
            onChange={(value) => setValue("notes", value)}
          />
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
    </div>
  );
}
