"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  buttonVariants,
  CountrySheetSelect,
  DEFAULT_COUNTRY,
  FormSection,
  Input,
  Label,
  PhoneNumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  type CountryCode,
} from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type ComponentProps, type FormEvent } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { webApi } from "@/lib/api";

/**
 * Required marker rendered beside — not inside — the label, so the label's text
 * stays clean for accessible-name lookups. Coloured like the label rather than
 * destructive: it flags a field, it does not report an error.
 */
function RequiredLabel({ children, ...props }: ComponentProps<"label">) {
  return (
    <div className="flex items-center gap-1">
      <Label {...props}>{children}</Label>
      <span aria-hidden="true" className="text-foreground">
        *
      </span>
    </div>
  );
}

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
  const [countryCode, setCountryCode] = useState<CountryCode>(
    (company?.countryCode as CountryCode | null) ?? DEFAULT_COUNTRY,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = {
      ...Object.fromEntries(form.entries()),
      legalForm,
      countryCode,
    };
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
      <PageTitleOverride
        title={
          isEdit
            ? t("companies.form.editTitle")
            : t("companies.form.createTitle")
        }
      />

      <form id={formId} onSubmit={submit} className="grid gap-8">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormSection title={t("companies.form.sections.identity")}>
          <div className="grid gap-2">
            <RequiredLabel id={`${formId}-legal-form`}>
              {t("companies.fields.legalForm")}
            </RequiredLabel>
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
          <TextField
            formId={formId}
            name="legalName"
            label={t("companies.fields.legalName")}
            defaultValue={company?.legalName ?? ""}
            disabled={busy}
            required
          />
          <TextField
            formId={formId}
            name="tradingName"
            label={t("companies.fields.tradingName")}
            defaultValue={company?.tradingName ?? ""}
            disabled={busy}
          />
        </FormSection>

        <FormSection title={t("companies.form.sections.registration")}>
          <TextField
            formId={formId}
            name="taxIdentifier"
            label={t("companies.fields.taxIdentifier")}
            defaultValue={company?.taxIdentifier ?? ""}
            disabled={busy}
          />
          <TextField
            formId={formId}
            name="registrationNumber"
            label={t("companies.fields.registrationNumber")}
            defaultValue={company?.registrationNumber ?? ""}
            disabled={busy}
          />
        </FormSection>

        <FormSection title={t("companies.form.sections.contact")}>
          <TextField
            formId={formId}
            name="email"
            label={t("companies.fields.email")}
            defaultValue={company?.email ?? ""}
            disabled={busy}
          />
          <div className="grid gap-2">
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
        </FormSection>

        <FormSection title={t("companies.form.sections.address")}>
          <TextField
            formId={formId}
            name="addressLine1"
            label={t("companies.fields.address")}
            defaultValue={company?.addressLine1 ?? ""}
            disabled={busy}
          />
          <TextField
            formId={formId}
            name="city"
            label={t("companies.fields.city")}
            defaultValue={company?.city ?? ""}
            disabled={busy}
          />
          <div className="grid gap-2">
            <Label id={`${formId}-country-label`}>
              {t("companies.fields.country")}
            </Label>
            <CountrySheetSelect
              id={`${formId}-country`}
              labelledById={`${formId}-country-label`}
              label={t("companies.fields.country")}
              value={countryCode}
              locale={locale}
              onValueChange={setCountryCode}
              disabled={busy}
              searchPlaceholder={t("companies.countryPicker.search")}
              clearSearchLabel={t("companies.countryPicker.clearSearch")}
              emptyMessage={t("companies.countryPicker.empty")}
              closeLabel={t("common.close")}
            />
          </div>
        </FormSection>

        <FormSection>
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
        </FormSection>

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

function TextField({
  formId,
  name,
  label,
  defaultValue,
  disabled,
  required,
}: {
  formId: string;
  name: string;
  label: string;
  defaultValue: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = `${formId}-${name}`;

  return (
    <div className="grid gap-2">
      {required ? (
        <RequiredLabel htmlFor={id}>{label}</RequiredLabel>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
