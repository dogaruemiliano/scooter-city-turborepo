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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@repo/ui/components";
import { Building2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { FinanceEmptyState } from "../../_components/FinanceEmptyState";

export function CompanyManager({
  companies,
}: {
  companies: v1.finance.Company[];
}) {
  const t = useTranslations("finance");
  const router = useRouter();
  const [feedback, setFeedback] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  async function setActive(company: v1.finance.Company, isActive: boolean) {
    setBusyId(company.id);
    setFeedback(undefined);
    try {
      await webApi.fetch(
        v1.finance.ROUTES.companies.update(company.id),
        v1.finance.companySchema,
        { method: "PATCH", json: { isActive } },
      );
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? error.message : t("feedback.genericError"),
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <CompanyDialog />
      </div>
      {feedback ? (
        <Alert variant="destructive">
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}
      {companies.length === 0 ? (
        <FinanceEmptyState>{t("companies.empty")}</FinanceEmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("companies.columns.company")}</TableHead>
                <TableHead>{t("companies.columns.identifier")}</TableHead>
                <TableHead>{t("companies.columns.contact")}</TableHead>
                <TableHead>{t("companies.columns.status")}</TableHead>
                <TableHead className="text-right">
                  {t("companies.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Building2Icon className="size-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {company.tradingName ?? company.legalName}
                        </div>
                        {company.tradingName ? (
                          <div className="text-xs text-muted-foreground">
                            {company.legalName}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
                    <Badge variant={company.isActive ? "default" : "secondary"}>
                      {t(
                        company.isActive ? "common.active" : "common.inactive",
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <CompanyDialog company={company} />
                      <Switch
                        checked={company.isActive}
                        disabled={busyId === company.id}
                        aria-label={`${t("companies.columns.status")}: ${company.legalName}`}
                        onCheckedChange={(value) =>
                          void setActive(company, value)
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function CompanyDialog({ company }: { company?: v1.finance.Company }) {
  const t = useTranslations("finance");
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = Object.fromEntries(form.entries());
    const parsed = (
      company
        ? v1.finance.updateCompanyInputSchema
        : v1.finance.createCompanyInputSchema
    ).safeParse(raw);
    if (!parsed.success) {
      setError(t("companies.form.invalid"));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await webApi.fetch(
        company
          ? v1.finance.ROUTES.companies.update(company.id)
          : v1.finance.ROUTES.companies.create,
        v1.finance.companySchema,
        { method: company ? "PATCH" : "POST", json: parsed.data },
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
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={company ? "ghost" : "default"}
            size={company ? "icon" : "default"}
            aria-label={company ? t("companies.edit") : undefined}
          />
        }
      >
        {company ? (
          <PencilIcon />
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            {t("companies.create")}
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto">
        <form id={formId} onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {t(
                company
                  ? "companies.form.editTitle"
                  : "companies.form.createTitle",
              )}
            </DialogTitle>
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
            {fields.map(([name, label, required]) => (
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
            ))}
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
