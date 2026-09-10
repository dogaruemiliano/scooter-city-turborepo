"use client";

import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  FieldGroup,
  Separator,
  Spinner,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form/FormField";
import { FormInput } from "@/components/form/controls";
import { useZodForm } from "@/lib/form/use-zod-form";
import { saveCompanyAssociates } from "../_lib/company-associates-api";

const percentageSchema = z
  .string()
  .trim()
  .refine((value) => {
    const percentage = Number(value);
    return Number.isFinite(percentage) && percentage > 0 && percentage <= 100;
  });

const companyAssociatesFormSchema = z
  .object({
    associates: z
      .array(
        z.object({
          associateId: z.string().optional(),
          email: z.email(),
          firstName: z.string().trim().max(100),
          lastName: z.string().trim().max(100),
          sharePercentage: percentageSchema,
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(
    ({ associates }) =>
      associates.reduce(
        (total, associate) =>
          total + percentageToBasisPoints(associate.sharePercentage),
        0,
      ) === v1.finance.TOTAL_SHARE_BASIS_POINTS,
    { path: ["associates"] },
  );

type CompanyAssociatesFormValues = z.infer<typeof companyAssociatesFormSchema>;

export function CompanyAssociatesForm({
  initialAssociates,
}: {
  initialAssociates: v1.finance.CompanyAssociates;
}) {
  const t = useTranslations("finance.associates");
  const locale = useLocale();
  const [associates, setAssociates] = useState(initialAssociates);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const form = useZodForm<
    CompanyAssociatesFormValues,
    CompanyAssociatesFormValues
  >(companyAssociatesFormSchema, {
    defaultValues: toFormValues(initialAssociates.items),
    labelFor: (path) => path,
  });
  const fields = useFieldArray({ control: form.control, name: "associates" });
  const values = useWatch({ control: form.control, name: "associates" });
  const totalBasisPoints = (values ?? []).reduce(
    (total, associate) =>
      total + percentageToBasisPoints(associate.sharePercentage),
    0,
  );
  const totalIsValid = totalBasisPoints === v1.finance.TOTAL_SHARE_BASIS_POINTS;
  const formattedTotal = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(totalBasisPoints / 100);

  async function onSubmit(values: CompanyAssociatesFormValues) {
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const updated = await saveCompanyAssociates({
        associates: values.associates.map((associate) => ({
          ...(associate.associateId
            ? { associateId: associate.associateId }
            : {}),
          email: associate.email,
          firstName: associate.firstName || null,
          lastName: associate.lastName || null,
          shareBasisPoints: percentageToBasisPoints(associate.sharePercentage),
        })),
      });
      setAssociates(updated);
      form.reset(toFormValues(updated.items));
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <FormProvider {...form}>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={fields.fields.length >= 20}
              onClick={() => {
                fields.append({
                  email: "",
                  firstName: "",
                  lastName: "",
                  sharePercentage: "",
                });
                setSaved(false);
              }}
            >
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              {t("add")}
            </Button>
          </div>

          <FieldGroup>
            {fields.fields.map((field, index) => {
              const member = associates.items.find(
                ({ associateId }) => associateId === field.associateId,
              );
              const isFoundingOwner =
                field.associateId === associates.managingOwnerId;
              const currentValue = values?.[index];
              const currentName = [
                currentValue?.firstName,
                currentValue?.lastName,
              ]
                .filter(Boolean)
                .join(" ");
              const label =
                currentName || currentValue?.email || t("newAssociate");

              return (
                <Card key={field.id} size="sm">
                  <CardHeader>
                    <CardTitle>
                      {label}
                      {isFoundingOwner ? ` · ${t("foundingOwner")}` : ""}
                    </CardTitle>
                    {!isFoundingOwner ? (
                      <CardAction>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("remove", { name: label })}
                          onClick={() => fields.remove(index)}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        name={`associates.${index}.firstName`}
                        label={t("firstName")}
                      >
                        <FormInput autoComplete="given-name" />
                      </FormField>
                      <FormField
                        name={`associates.${index}.lastName`}
                        label={t("lastName")}
                      >
                        <FormInput autoComplete="family-name" />
                      </FormField>
                      <FormField
                        name={`associates.${index}.email`}
                        label={t("email")}
                        required
                      >
                        <FormInput
                          type="email"
                          autoComplete="email"
                          readOnly={Boolean(member?.associate)}
                        />
                      </FormField>
                      <FormField
                        name={`associates.${index}.sharePercentage`}
                        label={t("ownershipShare")}
                        required
                      >
                        <FormInput
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="100"
                          step="0.01"
                        />
                      </FormField>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </FieldGroup>

          <Separator />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1" role="status">
              <p
                className={cn(
                  "text-sm font-medium",
                  !totalIsValid && "text-destructive",
                )}
              >
                {t("total", { value: formattedTotal })}
              </p>
              {!totalIsValid ? (
                <p className="text-sm text-destructive">{t("totalHint")}</p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={saving || !form.formState.isDirty || !totalIsValid}
            >
              {saving ? <Spinner /> : null}
              {saving ? t("saving") : t("save")}
            </Button>
          </div>

          {saved ? (
            <Alert>
              <CheckCircle2Icon aria-hidden="true" />
              <AlertDescription>{t("saved")}</AlertDescription>
            </Alert>
          ) : null}
          {saveError ? (
            <Alert variant="destructive">
              <AlertDescription>{t("saveFailed")}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </FormProvider>
    </div>
  );
}

function toFormValues(
  members: readonly v1.finance.FinanceBookMember[],
): CompanyAssociatesFormValues {
  return {
    associates: members.flatMap((member) =>
      member.associate
        ? [
            {
              associateId: member.associateId,
              email: member.associate.email,
              firstName: member.associate.firstName ?? "",
              lastName: member.associate.lastName ?? "",
              sharePercentage: basisPointsToInput(member.shareBasisPoints),
            },
          ]
        : [],
    ),
  };
}

function basisPointsToInput(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.00$/, "");
}

function percentageToBasisPoints(percentage: string): number {
  const value = Number(percentage);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
