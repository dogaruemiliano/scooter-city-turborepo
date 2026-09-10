"use client";

import { v1 } from "@repo/api-shared";
import { Alert, AlertDescription, Button, Spinner } from "@repo/ui/components";
import { CheckCircle2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form/FormField";
import { FormInput, FormTextarea } from "@/components/form/controls";
import { useZodForm } from "@/lib/form/use-zod-form";
import { saveCompanyIdentity } from "../_lib/company-identity-api";

const companyIdentityFormSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  taxIdentifier: z.string().trim().min(1).max(64),
  countryCode: z.string().trim().toUpperCase().length(2),
  nameAliases: z.string().max(4_000),
});

type CompanyIdentityFormValues = z.infer<typeof companyIdentityFormSchema>;

export function CompanyIdentityForm({
  identity,
}: {
  identity: v1.finance.FinanceLegalIdentity | null;
}) {
  const t = useTranslations("finance.settings");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useZodForm<CompanyIdentityFormValues, CompanyIdentityFormValues>(
    companyIdentityFormSchema,
    {
      defaultValues: {
        legalName: identity?.legalName ?? "",
        taxIdentifier: identity?.taxIdentifier ?? "",
        countryCode: identity?.countryCode ?? "RO",
        nameAliases: identity?.nameAliases.join("\n") ?? "",
      },
      labelFor: (path) => path,
    },
  );

  async function onSubmit(values: CompanyIdentityFormValues) {
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const updated = await saveCompanyIdentity({
        legalName: values.legalName,
        taxIdentifier: values.taxIdentifier,
        countryCode: values.countryCode,
        nameAliases: values.nameAliases
          .split("\n")
          .map((alias) => alias.trim())
          .filter(Boolean),
      });
      form.reset({
        legalName: updated.legalName,
        taxIdentifier: updated.taxIdentifier,
        countryCode: updated.countryCode,
        nameAliases: updated.nameAliases.join("\n"),
      });
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex max-w-3xl flex-col"
      >
        <section className="flex flex-col gap-6 pb-8">
          <h2 className="text-base font-medium">{t("identityTitle")}</h2>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <FormField
              name="legalName"
              label={t("legalName")}
              required
              className="sm:col-span-2"
            >
              <FormInput autoFocus autoComplete="organization" />
            </FormField>
            <FormField name="taxIdentifier" label={t("taxIdentifier")} required>
              <FormInput autoComplete="off" />
            </FormField>
            <FormField name="countryCode" label={t("countryCode")} required>
              <FormInput autoComplete="country" className="uppercase" />
            </FormField>
          </div>
        </section>

        <section className="flex flex-col gap-4 pb-8">
          <FormField name="nameAliases" label={t("aliases")}>
            <FormTextarea rows={4} placeholder={t("aliasesPlaceholder")} />
          </FormField>
          <p className="text-sm text-muted-foreground">{t("aliasesHint")}</p>
        </section>

        {saved ? (
          <Alert className="mb-5">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertDescription>{t("saved")}</AlertDescription>
          </Alert>
        ) : null}
        {saveError ? (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription>{t("saveFailed")}</AlertDescription>
          </Alert>
        ) : null}

        <footer className="flex justify-end">
          <Button type="submit" disabled={saving || !form.formState.isDirty}>
            {saving ? <Spinner /> : null}
            {saving ? t("saving") : t("save")}
          </Button>
        </footer>
      </form>
    </FormProvider>
  );
}
