"use client";

import { PageTitleOverride } from "@/components/PageTitleOverride";

import { ApiError, v1 } from "@repo/api-shared";
import { Button, Checkbox, buttonVariants } from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormProvider, get, type FieldErrors, useWatch } from "react-hook-form";

import { FormSummary } from "@/components/form/FormSummary";
import { webApi } from "@/lib/api";
import { useZodForm } from "@/lib/form/use-zod-form";
import { importFieldReviews } from "./scooter-import-review";
import { useScooterWizard } from "./useScooterWizard";
import { useScooterExtraction } from "./useScooterExtraction";
import { useScooterDocuments } from "./useScooterDocuments";
import {
  useScooterDocumentAnalysis,
  type DocumentAnalysisState,
} from "./useScooterDocumentAnalysis";
import { prepareScooterAnalysisImport } from "./scooter-analysis-import";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import { ScooterVinReview } from "./ScooterVinReview";
import { ScooterVinReference } from "./ScooterVinReference";
import {
  CivVocabularyContext,
  type CivVocabulary,
} from "./CivVocabularyContext";
import { ScooterImportReviewProvider } from "./ScooterImportReview";
import { ScooterEditorFields } from "./ScooterEditorFields";
import {
  scooterEditorMessage,
  scooterServerFieldErrors,
} from "./scooter-editor-messages";
import {
  CREATE_FIELDS,
  scooterChangedFields,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  scooterEditorDefaults,
  type ScooterEditorField,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterFieldConflict } from "./scooter-feedback";

export interface ScooterEditorProps {
  scooter?: v1.scooters.Scooter;
  returnHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
}

export function ScooterEditor({
  scooter,
  returnHref,
  brands,
  vocabulary = [],
}: ScooterEditorProps) {
  const t = useTranslations("scooters");
  const router = useRouter();
  const [createdBrands, setCreatedBrands] = useState<
    v1.scooterBrands.ScooterBrand[]
  >([]);
  const availableBrands = [
    ...new Map(
      [...brands, ...createdBrands].map((brand) => [brand.id, brand]),
    ).values(),
  ];
  const [importedRawFields, setImportedRawFields] = useState<Record<
    string,
    string
  > | null>(null);
  const documents = useScooterDocuments(scooter?.documents);
  const analysis = useScooterDocumentAnalysis(documents, scooter?.id);
  const [checkingDocumentVins, setCheckingDocumentVins] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [vinReviewRequired, setVinReviewRequired] = useState(false);
  const [importedSignature, setImportedSignature] = useState<string | null>(
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const pendingFocus = useRef<FieldErrors<ScooterEditorValues> | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useZodForm<ScooterEditorValues, v1.scooters.UpdateScooterInput>(
    scooter ? scooterEditFormSchema : scooterCreateFormSchema,
    {
      defaultValues: scooterEditorDefaults(scooter),
      labelFor: (path) =>
        path.startsWith("insurancePolicies.")
          ? t(`insurance.fields.${path.split(".").at(-1)}`)
          : t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
      shouldFocusError: false,
    },
  );
  const extraction = useScooterExtraction({
    form,
    documents,
    brands: availableBrands,
    editing: Boolean(scooter),
    initialRawFields: scooter?.civRawFields ?? {},
    onRawFields: setImportedRawFields,
  });
  const importedFallbackFields = extraction.reviewResult
    ? [
        ...new Set([
          ...Object.keys(extraction.reviewResult.values),
          ...importFieldReviews(extraction.reviewResult, form.getValues()).map(
            (review) => review.field,
          ),
        ]),
      ].filter((field): field is ScooterEditorField =>
        (CREATE_FIELDS as readonly string[]).includes(field),
      )
    : [];
  const wizard = useScooterWizard(
    form,
    extraction.sources,
    importedFallbackFields,
  );
  const isWizard = !scooter;
  const sourceSignature = JSON.stringify(extraction.sources);
  const importedCurrentDocuments = importedSignature === sourceSignature;
  const hasFailedAnalysis = Object.values(analysis.entries).some(
    (entry) => entry.status === "failed",
  );
  const vinReviewDocuments = extraction.sources.flatMap((source) => {
    const entry = analysis.entries[source.sourceId];
    if (entry?.status !== "success") return [];
    const data = entry.analysis.extractedData;
    return [
      {
        sourceId: source.sourceId,
        fileName: source.fileName,
        vin: data.vin,
        originalVin: data.vinReview ? data.vinReview.originalVin : data.vin,
      },
    ];
  });
  const [previousAnalysisSignature, setPreviousAnalysisSignature] =
    useState(sourceSignature);
  if (previousAnalysisSignature !== sourceSignature) {
    setPreviousAnalysisSignature(sourceSignature);
    setAnalysisError(null);
    setVinReviewRequired(false);
    setCheckingDocumentVins(false);
  }
  const progressRef = useRef<HTMLParagraphElement>(null);
  const unverifiedSources = extraction.unverifiedSources.filter(
    (source) =>
      !isWizard ||
      (wizard.step === "documents" && checkingDocumentVins) ||
      wizard.step === "operational" ||
      source.type === wizard.step ||
      (wizard.step === "civ" && source.type === "import_document"),
  );
  const { isSubmitting, isDirty, dirtyFields, submitCount } = form.formState;
  const powertrain = useWatch({
    control: form.control,
    name: "powertrainType",
  });
  const clearedFields =
    scooter && scooter.powertrainType !== powertrain
      ? v1.scooters
          .inactivePowertrainFields(powertrain)
          .filter((field) => scooter[field] != null)
      : [];

  function focusErrors(errors: FieldErrors<ScooterEditorValues>) {
    pendingFocus.current = errors;
    if (isWizard) wizard.errorStep(errors);
  }

  useEffect(() => {
    // Validation runs while RHF is submitting and the controls are disabled.
    // Wait for the enabled controls to commit before moving focus.
    if (isSubmitting || !pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const errors = pendingFocus.current;
      pendingFocus.current = null;
      if (!errors) return;
      // Composite controls also synchronize their disabled state after commit.
      for (const field of formRef.current?.querySelectorAll<HTMLElement>(
        "[data-field-name]",
      ) ?? []) {
        if (get(errors, field.dataset.fieldName ?? "")) {
          field
            .querySelector<HTMLElement>(
              'input:not([type="hidden"]), textarea, button[role="combobox"], button[role="checkbox"], button[aria-haspopup="dialog"]',
            )
            ?.focus();
          break;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isSubmitting, submitCount, wizard.step]);

  async function submit(input: v1.scooters.UpdateScooterInput) {
    if (
      submitting.current ||
      analysis.running ||
      documents.blocked ||
      extraction.vinMismatch ||
      extraction.unverifiedSources.length
    )
      return;
    submitting.current = true;
    setRequestError(null);
    try {
      const json = scooter ? scooterChangedFields(input, dirtyFields) : input;
      await webApi.fetch(
        scooter
          ? v1.scooters.ROUTES.update(scooter.id)
          : v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        {
          method: scooter ? "PATCH" : "POST",
          json: {
            ...json,
            ...documents.payload,
            ...(input.insurancePolicies?.length
              ? { insurancePolicies: input.insurancePolicies }
              : {}),
            ...(importedRawFields ? { civRawFields: importedRawFields } : {}),
          },
        },
      );
      router.push(returnHref);
      router.refresh();
    } catch (error) {
      const serverErrors = scooterServerFieldErrors(error, t);
      if (Object.keys(serverErrors).length) {
        const errors: FieldErrors<ScooterEditorValues> = {};
        for (const name of Object.keys(
          serverErrors,
        ) as (keyof typeof serverErrors)[]) {
          const fieldError = { type: "server", message: serverErrors[name] };
          form.setError(name, fieldError);
          errors[name] = fieldError;
        }
        focusErrors(errors);
        setRequestError(Object.values(serverErrors).join(" "));
        return;
      }
      const conflict = scooterFieldConflict(error);
      if (conflict) {
        const message = t(
          conflict.field === "vin"
            ? "feedback.vinConflict"
            : "feedback.plateConflict",
        );
        form.setError(conflict.field, { type: "server", message });
        focusErrors({ [conflict.field]: { type: "server", message } });
        setRequestError(message);
      } else {
        const details = error instanceof ApiError ? error.details : undefined;
        if (
          details &&
          typeof details === "object" &&
          "field" in details &&
          details.field === "brandId"
        ) {
          const message = t("feedback.brandUnavailable");
          form.setError("brandId", { type: "server", message });
          focusErrors({ brandId: { type: "server", message } });
          setRequestError(message);
        } else setRequestError(t("feedback.genericError"));
      }
    } finally {
      submitting.current = false;
    }
  }

  async function continueWizard() {
    if (
      documents.blocked ||
      (wizard.step !== "documents" &&
        (extraction.vinMismatch || unverifiedSources.length))
    )
      return;
    setRequestError(null);
    if (await wizard.next())
      requestAnimationFrame(() => progressRef.current?.focus());
    else {
      pendingFocus.current = form.formState.errors;
      requestAnimationFrame(() => {
        const field = formRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        field?.focus();
      });
    }
  }

  function applyAnalysis(entries: (DocumentAnalysisState | undefined)[]) {
    const successes = entries.flatMap((entry) =>
      entry?.status === "success" ? [entry.analysis] : [],
    );
    if (successes.length) {
      const result = prepareScooterAnalysisImport(
        successes,
        extraction.sources,
        availableBrands,
        form.getValues(),
        Boolean(scooter),
      );
      if (!result.ok) {
        setVinReviewRequired(result.reason === "vinMismatch");
        setAnalysisError(
          result.reason === "vinMismatch"
            ? t("documentImport.vinMismatch", {
                fields: result.fields.join(", "),
              })
            : t("extraction.errors.failed"),
        );
        return false;
      }
      setAnalysisError(null);
      setVinReviewRequired(false);
      extraction.applyImport(result);
    }
    const hasCiv = extraction.sources.some((source) => source.type === "civ");
    const unresolved = extraction.sources.some((source) => {
      if (hasCiv && source.type === "import_document") return false;
      const success = successes.find(
        (item) => item.sourceId === source.sourceId,
      );
      return (
        !success?.extractedData.vin &&
        !extraction.isVinConfirmed(source.sourceId)
      );
    });
    if (unresolved) {
      setCheckingDocumentVins(true);
      return false;
    }
    setImportedSignature(sourceSignature);
    return true;
  }

  async function extractAndContinue() {
    if (analysis.running || documents.blocked) return;
    setAnalysisError(null);
    if (importedCurrentDocuments && !hasFailedAnalysis) {
      if (isWizard) await continueWizard();
      return;
    }
    const results = await analysis.run();
    if (!results || results.some((entry) => entry?.status === "failed")) return;
    if (applyAnalysis(results) && isWizard) await continueWizard();
  }

  async function continueManually() {
    if (analysis.running || documents.blocked) return;
    setAnalysisError(null);
    if (applyAnalysis(Object.values(analysis.entries))) await continueWizard();
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 pt-6 pb-12 sm:px-6 sm:pt-10 sm:pb-16">
      {scooter ? (
        <>
          <PageTitleOverride title={v1.scooters.scooterDisplayCode(scooter)} />
          <h1 className="text-2xl font-semibold">
            {v1.scooters.scooterDisplayCode(scooter)}
          </h1>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("fleetNumber.assignedOnSave")}
        </p>
      )}
      <CivVocabularyContext value={vocabulary}>
        <FormProvider {...form}>
          <form
            ref={formRef}
            className="grid gap-8"
            noValidate
            onSubmit={(event) => {
              if (isWizard && !wizard.last) {
                event.preventDefault();
                if (wizard.step === "documents" && extraction.sources.length)
                  void extractAndContinue();
                else void continueWizard();
                return;
              }
              void form.handleSubmit(submit, (errors) => {
                setRequestError(null);
                focusErrors(errors);
              })(event);
            }}
          >
            {isWizard ? (
              <p
                ref={progressRef}
                tabIndex={-1}
                aria-live="polite"
                className="text-sm text-muted-foreground outline-none"
              >
                {t("wizard.progress", {
                  current: wizard.index + 1,
                  total: wizard.steps.length,
                  step: t(`wizard.steps.${wizard.step}`),
                })}
              </p>
            ) : null}
            <FormSummary
              title={t(
                scooter
                  ? "feedback.updateErrorTitle"
                  : "feedback.createErrorTitle",
              )}
              message={requestError}
            />
            <ScooterDocumentAnalysisContext value={analysis.entries}>
              <ScooterImportReviewProvider
                editing={Boolean(scooter)}
                result={extraction.reviewResult}
                sources={extraction.sources}
              >
                <ScooterEditorFields
                  step={isWizard ? wizard.step : undefined}
                  fallbackFields={
                    extraction.vinMismatch
                      ? [...new Set([...wizard.fallbackFields, "vin" as const])]
                      : wizard.fallbackFields
                  }
                  importSources={extraction.sources}
                  importResult={extraction.reviewResult}
                  onApplyImport={(result) => {
                    extraction.applyImport(result, {
                      confirmedUnknownVins: true,
                    });
                    analysis.dismissFailures();
                    setImportedSignature(sourceSignature);
                    setAnalysisError(null);
                  }}
                  documents={documents}
                  persistedPolicyIds={
                    scooter?.insurancePolicies?.map((policy) => policy.id) ?? []
                  }
                  brands={availableBrands}
                  rawFields={importedRawFields ?? scooter?.civRawFields ?? {}}
                  onBrandCreated={(brand) =>
                    setCreatedBrands((current) => [...current, brand])
                  }
                  onRawFields={(fields) =>
                    setImportedRawFields((current) => ({
                      ...scooter?.civRawFields,
                      ...current,
                      ...fields,
                    }))
                  }
                  editing={Boolean(scooter)}
                  disabled={isSubmitting || analysis.running}
                />
              </ScooterImportReviewProvider>
            </ScooterDocumentAnalysisContext>
            {analysisError ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {analysisError}
                </p>
                {vinReviewRequired && vinReviewDocuments.length ? (
                  <ScooterVinReview
                    key={JSON.stringify([sourceSignature, vinReviewDocuments])}
                    documents={vinReviewDocuments}
                    disabled={
                      isSubmitting || analysis.running || documents.blocked
                    }
                    onApply={(corrections) => {
                      const reviewed = analysis.reviewVins(corrections);
                      if (reviewed) applyAnalysis(reviewed);
                    }}
                  />
                ) : null}
              </>
            ) : null}
            {extraction.vinMismatch ? (
              <p role="alert" className="text-sm text-destructive">
                {t("documentImport.vinMismatch", { fields: "VIN" })}
              </p>
            ) : null}
            {unverifiedSources.length ? (
              <div className="grid gap-3 rounded-md border border-warning p-4">
                <p className="text-sm text-warning">{t("wizard.verifyVin")}</p>
                <ScooterVinReference />
                {unverifiedSources.map((source) => (
                  <label
                    key={source.sourceId}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Checkbox
                      checked={false}
                      disabled={isSubmitting}
                      onCheckedChange={(checked) => {
                        if (checked) extraction.confirmVin(source.sourceId);
                      }}
                    />
                    <span className="min-w-0 break-words">
                      {t("wizard.confirmVin", { fileName: source.fileName })}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            {scooter?.propulsionSystem ? (
              <p className="text-sm text-muted-foreground">
                {t("civ.legacyPropulsion", { value: scooter.propulsionSystem })}
              </p>
            ) : null}
            {scooter &&
            scooter.powertrainType !== powertrain &&
            powertrain === "electric" &&
            scooter.fuelType &&
            scooter.fuelType !== "electric" ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("civ.electricFuelOnSave")}
              </p>
            ) : null}
            {clearedFields.length > 0 ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t("civ.clearOnSave", {
                  fields: clearedFields
                    .map((field) => t(`fields.${field}`))
                    .join(", "),
                })}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Link
                href={returnHref}
                className={buttonVariants({ variant: "outline" })}
                aria-disabled={isSubmitting}
                tabIndex={isSubmitting ? -1 : undefined}
                onClick={(event) => {
                  if (isSubmitting) event.preventDefault();
                }}
              >
                {t("actions.cancel")}
              </Link>
              {isWizard && wizard.index > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => {
                    wizard.back();
                    requestAnimationFrame(() => progressRef.current?.focus());
                  }}
                >
                  {t("wizard.back")}
                </Button>
              ) : null}
              {isWizard && !wizard.last ? (
                <>
                  {wizard.step === "documents" &&
                  extraction.sources.length > 0 &&
                  (!importedCurrentDocuments || hasFailedAnalysis) ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        isSubmitting || documents.blocked || analysis.running
                      }
                      onClick={() => {
                        void continueManually();
                      }}
                    >
                      {t("extraction.manual")}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      analysis.running ||
                      documents.blocked ||
                      (wizard.step !== "documents" &&
                        (extraction.vinMismatch ||
                          unverifiedSources.length > 0))
                    }
                  >
                    {t(
                      wizard.step === "documents" &&
                        extraction.sources.length &&
                        (!importedCurrentDocuments || hasFailedAnalysis)
                        ? analysis.running
                          ? "extraction.processing"
                          : hasFailedAnalysis
                            ? "extraction.retry"
                            : "extraction.extractAndContinue"
                        : wizard.step === "documents" &&
                            !extraction.sources.length
                          ? "wizard.continueWithoutDocuments"
                          : "wizard.continue",
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {scooter && extraction.sources.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        isSubmitting ||
                        documents.blocked ||
                        analysis.running ||
                        (importedCurrentDocuments && !hasFailedAnalysis)
                      }
                      onClick={() => {
                        void extractAndContinue();
                      }}
                    >
                      {t(
                        analysis.running
                          ? "extraction.processing"
                          : hasFailedAnalysis
                            ? "extraction.retry"
                            : "extraction.extract",
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      analysis.running ||
                      documents.blocked ||
                      extraction.vinMismatch ||
                      extraction.unverifiedSources.length > 0 ||
                      Boolean(
                        scooter &&
                        !isDirty &&
                        !documents.changed &&
                        !importedRawFields,
                      )
                    }
                  >
                    {t(
                      scooter
                        ? isSubmitting
                          ? "actions.saving"
                          : "actions.save"
                        : isSubmitting
                          ? "actions.creating"
                          : "actions.create",
                    )}
                  </Button>
                </>
              )}
            </div>
          </form>
        </FormProvider>
      </CivVocabularyContext>
    </div>
  );
}
