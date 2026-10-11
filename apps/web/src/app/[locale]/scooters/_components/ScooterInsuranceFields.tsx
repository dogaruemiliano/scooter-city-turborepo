"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { Button, Checkbox, FormSection } from "@repo/ui/components";
import { PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Controller,
  type UseFieldArrayReturn,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { FormField } from "@/components/form/FormField";
import {
  FormDateField,
  FormDecimalInput,
  FormInput,
} from "@/components/form/controls";
import {
  ScooterDocumentUpload,
  ScooterFilePreview,
} from "./ScooterDocumentUpload";
import {
  insuranceEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { ScooterVinReference } from "./ScooterVinReference";

export function ScooterInsuranceDocuments({
  documents,
  disabled,
  persistedPolicyIds,
  insurance,
  editing,
  compact = false,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  persistedPolicyIds: string[];
  editing: boolean;
  compact?: boolean;
  insurance: UseFieldArrayReturn<
    ScooterEditorValues,
    "insurancePolicies",
    "formKey"
  >;
}) {
  const t = useTranslations("scooters.insurance");
  const { fields, append, remove } = insurance;
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  if (!canAccess(user, "scooter_documents.read")) return null;
  if (!editing) {
    const policy = fields[0];
    return (
      <ScooterDocumentUpload
        type="insurance"
        insurancePolicyId={policy?.id}
        documents={documents}
        disabled={disabled}
        compact={compact}
        onAdd={(files) => {
          const next = policy ?? insuranceEditorDefaults();
          if (!policy) append(next, { shouldFocus: false });
          documents.add("insurance", files, next.id);
        }}
      />
    );
  }
  return (
    <section className="grid gap-4" aria-label={t("title")}>
      {fields.map((policy, index) => (
        <div key={policy.formKey} className="grid gap-2">
          <ScooterDocumentUpload
            title={t("policy", { number: index + 1 })}
            type="insurance"
            insurancePolicyId={policy.id}
            documents={documents}
            disabled={disabled}
          />
          {canWrite && !persistedPolicyIds.includes(policy.id) ? (
            <Button
              type="button"
              variant="text"
              className="justify-self-start"
              disabled={disabled}
              onClick={() => {
                documents.drafts
                  .filter((doc) => doc.insurancePolicyId === policy.id)
                  .forEach((doc) => documents.removeDraft(doc.id));
                remove(index);
              }}
            >
              {t("removeDraft")}
            </Button>
          ) : null}
        </div>
      ))}
      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={disabled || fields.length >= 100}
          onClick={() =>
            append(insuranceEditorDefaults(), { shouldFocus: false })
          }
        >
          <PlusIcon aria-hidden="true" />
          {t("add")}
        </Button>
      ) : null}
    </section>
  );
}

export function ScooterInsuranceFields({
  disabled,
  fieldKeys,
  onRemovePolicy,
}: {
  disabled: boolean;
  fieldKeys: string[];
  onRemovePolicy?: (index: number) => void;
}) {
  const t = useTranslations("scooters.insurance");
  const locale = useLocale();
  const { control } = useFormContext<ScooterEditorValues>();
  const policies = useWatch({ control, name: "insurancePolicies" }) ?? [];
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const readOnly = disabled || !canWrite;
  const vin = useWatch({ control, name: "vin" });
  if (!canAccess(user, "scooter_documents.read")) return null;
  return (
    <>
      {v1.scooters.insurancePeriodsOverlap(policies) ? (
        <p role="status" className="text-sm text-warning">
          {t("overlap")}
        </p>
      ) : null}
      {policies.map((policy, index) => (
        <FormSection
          key={fieldKeys[index] ?? policy.id}
          title={t("policy", { number: index + 1 })}
        >
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {t(`status.${v1.scooters.insuranceStatus(policy)}`)}
          </p>
          {v1.scooters.INSURANCE_FIELDS.map((field) => {
            const name = `insurancePolicies.${index}.${field}` as const;
            return (
              <div
                key={field}
                className={`grid gap-1 ${field === "insuredName" || field === "documentVin" ? "sm:col-span-2" : ""}`}
              >
                <FormField
                  name={name}
                  label={t(`fields.${field}`)}
                  disabled={readOnly}
                  labelSuffix={
                    field === "validFrom" || field === "validUntil"
                      ? "-day"
                      : undefined
                  }
                >
                  {field === "validFrom" || field === "validUntil" ? (
                    <FormDateField />
                  ) : field === "premiumAmount" ? (
                    <FormDecimalInput
                      locale={locale}
                      placeholder={t(`placeholders.${field}`)}
                    />
                  ) : (
                    <FormInput
                      placeholder={t(`placeholders.${field}`)}
                      autoCapitalize={
                        field === "documentVin" || field === "currency"
                          ? "characters"
                          : "words"
                      }
                      normalize={
                        field === "documentVin" || field === "currency"
                          ? (value) => value.toUpperCase()
                          : undefined
                      }
                    />
                  )}
                </FormField>
              </div>
            );
          })}
          {policy.documentVin &&
          vin &&
          policy.documentVin.toUpperCase() !== vin.toUpperCase() ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t("vinMismatch")}
            </p>
          ) : null}
          {!policy.documentVin ? (
            <FormField
              name={`insurancePolicies.${index}.vinReviewConfirmed`}
              controlId={`insurance-${policy.id}-vin-review`}
              label={t("fields.vinReviewConfirmed")}
              disabled={readOnly}
            >
              <Controller
                control={control}
                name={`insurancePolicies.${index}.vinReviewConfirmed`}
                render={({ field }) => (
                  <Checkbox
                    id={`insurance-${policy.id}-vin-review`}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    disabled={readOnly}
                    aria-label={t("fields.vinReviewConfirmed")}
                  />
                )}
              />
              <p className="text-sm text-muted-foreground">
                {t("vinReviewHint")}
              </p>
              <ScooterVinReference />
            </FormField>
          ) : null}
          {canWrite && onRemovePolicy ? (
            <Button
              type="button"
              variant="text"
              className="justify-self-start"
              disabled={readOnly}
              onClick={() => onRemovePolicy(index)}
            >
              {t("removeDraft")}
            </Button>
          ) : null}
        </FormSection>
      ))}
    </>
  );
}

export function ScooterInsuranceList({
  scooter,
}: {
  scooter: v1.scooters.Scooter;
}) {
  const t = useTranslations("scooters.insurance");
  const locale = useLocale();
  const rank = { active: 0, upcoming: 1, review: 2, expired: 3 };
  const policies = [...(scooter.insurancePolicies ?? [])].sort(
    (a, b) =>
      rank[v1.scooters.insuranceStatus(a)] -
        rank[v1.scooters.insuranceStatus(b)] ||
      (b.validUntil ?? "").localeCompare(a.validUntil ?? ""),
  );
  if (!policies.length) return null;
  return (
    <section className="grid gap-6" aria-label={t("title")}>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {v1.scooters.insurancePeriodsOverlap(policies) ? (
        <p className="text-sm text-warning">{t("overlap")}</p>
      ) : null}
      {policies.map((policy) => (
        <article
          key={policy.id}
          className="grid gap-3 border-b border-border pb-6"
        >
          <div>
            <h3 className="font-medium">
              {policy.insuredName ?? t("unknownInsured")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(`status.${v1.scooters.insuranceStatus(policy)}`)}
            </p>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(["validFrom", "validUntil", "premiumAmount"] as const).map(
              (field) => (
                <div key={field}>
                  <dt className="text-muted-foreground">
                    {t(`fields.${field}`)}
                  </dt>
                  <dd>
                    {field === "premiumAmount"
                      ? policy.premiumAmount == null
                        ? "—"
                        : `${new Intl.NumberFormat(locale).format(policy.premiumAmount)} ${policy.currency ?? ""}`
                      : policy[field]
                        ? new Intl.DateTimeFormat(locale, {
                            timeZone: "UTC",
                          }).format(new Date(`${policy[field]}T00:00:00Z`))
                        : "—"}
                  </dd>
                </div>
              ),
            )}
          </dl>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scooter.documents
              ?.filter((doc) => doc.insurancePolicyId === policy.id)
              .map((doc) => (
                <ScooterFilePreview
                  key={doc.id}
                  document={doc}
                  disabled={false}
                />
              ))}
          </div>
        </article>
      ))}
    </section>
  );
}
