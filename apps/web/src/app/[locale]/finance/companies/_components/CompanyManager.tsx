"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PhoneNumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@repo/ui/components";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";
import {
  CompanyLegalFormIcon,
  companyDisplayName,
} from "./CompanyLegalFormIcon";

function CompanyIdentity({
  company,
  href,
}: {
  company: v1.finance.Company;
  href: string;
}) {
  const t = useTranslations("finance");
  const displayName = companyDisplayName(
    company,
    t(`enums.companyLegalForms.${company.legalForm}`),
  );
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <CompanyLegalFormIcon legalForm={company.legalForm} />
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {displayName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {t("companies.fields.taxIdentifier")}:{" "}
          {company.taxIdentifier ?? t("common.notProvided")}
        </div>
      </div>
      <ArrowRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" />
    </Link>
  );
}

export function CompanyManager({
  companies,
  companiesHref,
}: {
  companies: v1.finance.Company[];
  companiesHref: string;
}) {
  const t = useTranslations("finance");

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <CreateCompanyDialog />
      </div>
      {companies.length === 0 ? (
        <FinanceEmptyState>{t("companies.empty")}</FinanceEmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("companies.columns.company")}</TableHead>
                  <TableHead>{t("companies.columns.identifier")}</TableHead>
                  <TableHead>{t("companies.columns.contact")}</TableHead>
                  <TableHead>{t("companies.columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <CompanyIdentity
                        company={company}
                        href={`${companiesHref}/${encodeURIComponent(company.id)}`}
                      />
                    </TableCell>
                    <TableCell>
                      {company.taxIdentifier ??
                        company.registrationNumber ??
                        t("common.notProvided")}
                    </TableCell>
                    <TableCell>
                      <div>
                        {company.email ??
                          company.phone ??
                          t("common.notProvided")}
                      </div>
                      {company.email && company.phone ? (
                        <div className="text-xs text-muted-foreground">
                          {company.phone}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={company.isActive ? "default" : "secondary"}
                      >
                        {t(
                          company.isActive
                            ? "common.active"
                            : "common.inactive",
                        )}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-2 md:hidden">
            {companies.map((company) => (
              <li
                key={company.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <article className="p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CompanyIdentity
                      company={company}
                      href={`${companiesHref}/${encodeURIComponent(company.id)}`}
                    />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CreateCompanyDialog() {
  const t = useTranslations("finance");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [legalForm, setLegalForm] =
    useState<v1.finance.CompanyLegalForm>("SRL");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = { ...Object.fromEntries(form.entries()), legalForm };
    const parsed = v1.finance.createCompanyInputSchema.safeParse(raw);
    if (!parsed.success) {
      setError(t("companies.form.invalid"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.companies.create,
        v1.finance.companySchema,
        { method: "POST", json: parsed.data },
      );
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("feedback.genericError"),
      );
    } finally {
      setBusy(false);
    }
  }
  const fields = [
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
  return (
    <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
      <DialogTrigger render={<Button type="button" variant="default" />}>
        <PlusIcon data-icon="inline-start" />
        {t("companies.create")}
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto">
        <form id={formId} onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{t("companies.form.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("companies.form.description")}
            </DialogDescription>
          </DialogHeader>
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
            {fields.map(([name, label, required]) =>
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
                    defaultValue=""
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
                defaultValue=""
                disabled={busy}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={busy} />
              }
            >
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
