"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { FormProvider, useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { v1 } from "@repo/api-shared";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Checkbox,
} from "@repo/ui/components";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { FileCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { useZodForm } from "@/lib/form/use-zod-form";
import { ScooterInsuranceFields } from "./ScooterInsuranceFields";
import {
  insuranceEditorDefaults,
  scooterCreateFormSchema,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterEditorMessage } from "./scooter-editor-messages";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type { ScooterVinCorrection } from "./scooter-vin-review";

export function ScooterInsuranceInspector({
  documents,
  disabled,
  onReviewVin,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  onReviewVin?: (corrections: ScooterVinCorrection[]) => boolean;
}) {
  const t = useTranslations("scooters");
  const user = useOptionalSession()?.user;
  const parent = useFormContext<ScooterEditorValues>();
  const policy = useWatch({
    control: parent.control,
    name: "insurancePolicies",
  })?.[0];
  const vin = useWatch({ control: parent.control, name: "vin" });
  const analysis = useContext(ScooterDocumentAnalysisContext);
  const source = documents.drafts.find((doc) => doc.type === "insurance");
  const entry = source ? analysis[source.id] : undefined;
  const extracted =
    entry?.status === "success" ? entry.analysis.extractedData : undefined;
  const src = useObjectUrl(source?.file ?? null);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const local = useZodForm<ScooterEditorValues, v1.scooters.UpdateScooterInput>(
    scooterCreateFormSchema,
    {
      defaultValues: parent.getValues(),
      labelFor: (path) =>
        path.startsWith("insurancePolicies.")
          ? t(`insurance.fields.${path.split(".").at(-1)}`)
          : t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
    },
  );
  const localVin = useWatch({
    control: local.control,
    name: "insurancePolicies.0.documentVin",
  });
  const mismatch = Boolean(
    vin &&
    (policy?.documentVin || extracted?.vin) &&
    vin.toUpperCase() !==
      (policy?.documentVin || extracted?.vin)?.toUpperCase(),
  );
  const correction = Boolean(
    extracted?.vin && localVin && extracted.vin !== localVin.toUpperCase(),
  );
  const canWrite = canAccess(user, "scooter_documents.write");

  const openInspector = useCallback(() => {
    const seed = {
      ...insuranceEditorDefaults(),
      id: source?.insurancePolicyId ?? policy?.id ?? crypto.randomUUID(),
    };
    if (extracted) {
      for (const field of v1.scooters.INSURANCE_FIELDS) {
        const value =
          field === "documentVin" ? extracted.vin : extracted.fields[field];
        if (value != null) seed[field] = String(value);
      }
    }
    local.reset({
      ...parent.getValues(),
      insurancePolicies: [{ ...seed, ...policy }],
    });
    setConfirmed(false);
    setOpen(true);
  }, [source, policy, extracted, local, parent]);

  // Hidden policy errors must lead to an editor the user can actually correct.
  const { submitCount, errors, isSubmitting } = parent.formState;
  const openedAttempt = useRef(0);
  useEffect(() => {
    if (!submitCount || isSubmitting || openedAttempt.current === submitCount)
      return;
    openedAttempt.current = submitCount;
    if (!errors.insurancePolicies) return;
    const frame = requestAnimationFrame(openInspector);
    return () => cancelAnimationFrame(frame);
  }, [submitCount, isSubmitting, errors, openInspector]);

  async function apply() {
    if (!canWrite || disabled || !(await local.trigger("insurancePolicies")))
      return;
    if (correction && !confirmed) return;
    if (
      correction &&
      source &&
      extracted &&
      localVin &&
      onReviewVin &&
      !onReviewVin([
        {
          sourceId: source.id,
          previousVin: extracted.vin,
          vin: localVin.trim().toUpperCase(),
        },
      ])
    )
      return;
    const reviewedPolicy = parent
      .getValues("insurancePolicies")
      ?.find((item) => item.id === local.getValues("insurancePolicies.0.id"));
    const policies = local.getValues("insurancePolicies")?.map((item) => ({
      ...item,
      rawFields: item.rawFields ?? reviewedPolicy?.rawFields,
    }));
    parent.setValue("insurancePolicies", policies, {
      shouldDirty: true,
      shouldTouch: true,
    });
    parent.clearErrors("insurancePolicies");
    setOpen(false);
  }

  if (!canAccess(user, "scooter_documents.read")) return null;
  const labels = {
    error: t("documents.pdfPreviewError"),
    previousPage: t("documents.previousPage"),
    nextPage: t("documents.nextPage"),
    zoomIn: t("documents.zoomIn"),
    zoomOut: t("documents.zoomOut"),
    resetZoom: t("documents.resetZoom"),
  };
  return (
    <>
      <Card as="section">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <FileCheckIcon aria-hidden="true" className="size-5" />
              {t("creation.insuranceDetails")}
            </CardTitle>
            {policy ? (
              <Badge variant={mismatch ? "warning" : "secondary"}>
                {mismatch
                  ? t("creation.policyMismatch")
                  : t(
                      `insurance.status.${v1.scooters.insuranceStatus(policy)}`,
                    )}
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            {policy
              ? [
                  policy.insuredName,
                  policy.validUntil,
                  policy.premiumAmount &&
                    `${policy.premiumAmount} ${policy.currency}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("creation.insuranceHelp")
              : t("creation.noInsurance")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {mismatch ? (
            <Alert variant="warning">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("insurance.vinMismatch")}</AlertTitle>
              <AlertDescription>{t("creation.insuranceHelp")}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="justify-self-start"
            onClick={openInspector}
          >
            {t(
              policy || source
                ? "creation.editInsurance"
                : "creation.addInsurance",
            )}
          </Button>
        </CardContent>
      </Card>
      <DocumentViewer
        open={open}
        onOpenChange={setOpen}
        src={src}
        contentType={source?.file.type}
        fileName={source?.file.name}
        title={t("creation.inspector")}
        imageAlt={source?.file.name ?? t("creation.insuranceDetails")}
        closeLabel={t("actions.close")}
        openFileLabel={t("documents.openFile")}
        actionsLabel={t("documents.actions")}
        pdfLabels={labels}
        zoomLabels={labels}
        reviewTitle={t("creation.comparison")}
        review={
          <FormProvider {...local}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("creation.insuranceHelp")}
            </p>
            <div className="grid gap-2 rounded-xl border border-border bg-control p-4">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("creation.fleetVin")}
              </span>
              <span className="break-all font-mono text-sm">{vin || "—"}</span>
            </div>
            <ScooterInsuranceFields
              singleColumn
              disabled={disabled}
              fieldKeys={[policy?.id ?? "draft"]}
            />
            {extracted?.vin && localVin !== vin && vin ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled || !canWrite}
                onClick={() => {
                  local.setValue(
                    "insurancePolicies.0.documentVin",
                    vin.toUpperCase(),
                  );
                  setConfirmed(false);
                }}
              >
                {t("creation.correctVin")}
              </Button>
            ) : null}
            {correction ? (
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={confirmed}
                  disabled={disabled || !canWrite}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <span>{t("creation.confirmCorrection")}</span>
              </label>
            ) : null}
            {canWrite ? (
              <Button
                type="button"
                disabled={disabled || (correction && !confirmed)}
                onClick={() => void apply()}
              >
                {t("creation.applyInsurance")}
              </Button>
            ) : null}
            {policy && canWrite ? (
              <Button
                type="button"
                variant="text"
                disabled={disabled}
                onClick={() => {
                  parent.setValue("insurancePolicies", [], {
                    shouldDirty: true,
                  });
                  documents.drafts
                    .filter((doc) => doc.insurancePolicyId === policy.id)
                    .forEach((doc) => documents.removeDraft(doc.id));
                  setOpen(false);
                }}
              >
                {t("creation.removePolicy")}
              </Button>
            ) : null}
          </FormProvider>
        }
      />
    </>
  );
}
