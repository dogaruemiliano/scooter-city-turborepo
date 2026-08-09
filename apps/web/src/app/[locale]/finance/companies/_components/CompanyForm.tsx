"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  buttonVariants,
  Input,
  Label,
  PhoneNumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";

const FIELDS = [
  ["legalName", "legalName", true],
  ["tradingName", "tradingName", false],
  ["taxIdentifier", "taxIdentifier", false],
  ["registrationNumber", "registrationNumber", false],
  ["email", "email", false],
  ["phone", "phone", false],
  ["addressLine1", "address", false],
  ["city", "city", false],
  ["countryCode", "countryCode", false],
] as const;

export function CompanyForm({
  company,
  cancelHref,
}: {
  /** Omit to create a new company; pass one to edit it. */
  company?: v1.finance.Company;
  cancelHref: string;
}) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const isEdit = company !== undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [legalForm, setLegalForm] = useState<v1.finance.CompanyLegalForm>(
    company?.legalForm ?? "SRL",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = { ...Object.fromEntries(form.entries()), legalForm };
    const parsed = isEdit
      ? v1.finance.updateCompanyInputSchema.safeParse(raw)
      : v1.finance.createCompanyInputSchema.safeParse(raw);
    if (!parsed.success) {
      setError(t("companies.form.invalid"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await webApi.fetch(
        isEdit
          ? v1.finance.ROUTES.companies.update(company.id)
          : v1.finance.ROUTES.companies.create,
        v1.finance.companySchema,
        { method: isEdit ? "PATCH" : "POST", json: parsed.data },
      );
      router.push(cancelHref);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("feedback.genericError"),
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {isEdit
            ? t("companies.form.editTitle")
            : t("companies.form.createTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("companies.form.description")}
        </p>
      </div>

      <form id={formId} onSubmit={submit} className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label id={`${formId}-legal-form`}>
              {t("companies.fields.legalForm")}
            </Label>
            <Select
              value={legalForm}
              onValueChange={(value) =>
                setLegalForm(value as v1.finance.CompanyLegalForm)
              }
              disabled={busy}
            >
              <SelectTrigger
                aria-labelledby={`${formId}-legal-form`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {v1.finance.COMPANY_LEGAL_FORMS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`enums.companyLegalForms.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {FIELDS.map(([name, label, required]) =>
            name === "phone" ? (
              <div key={name} className="grid gap-2">
                <Label htmlFor={`${formId}-phone`}>
                  {t("companies.fields.phone")}
                </Label>
                <PhoneNumberInput
                  id={`${formId}-phone`}
                  name="phone"
                  locale={locale}
                  placeholder={t("companies.fields.phone")}
                  countrySelectLabel={t("companies.fields.phoneCountry")}
                  numberInputLabel={t("companies.fields.phone")}
                  defaultValue={company?.phone ?? ""}
                  disabled={busy}
                />
              </div>
            ) : (
              <div key={name} className="grid gap-2">
                <Label htmlFor={`${formId}-${name}`}>
                  {t(`companies.fields.${label}`)}
                </Label>
                <Input
                  id={`${formId}-${name}`}
                  name={name}
                  defaultValue={company?.[name] ?? ""}
                  required={required}
                  disabled={busy}
                />
              </div>
            ),
          )}
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`${formId}-notes`}>
              {t("companies.fields.notes")}
            </Label>
            <Textarea
              id={`${formId}-notes`}
              name="notes"
              defaultValue={company?.notes ?? ""}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href={cancelHref}
            className={buttonVariants({
              variant: "outline",
              className: busy ? "pointer-events-none opacity-60" : "",
            })}
            aria-disabled={busy}
          >
            {t("common.cancel")}
          </Link>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
