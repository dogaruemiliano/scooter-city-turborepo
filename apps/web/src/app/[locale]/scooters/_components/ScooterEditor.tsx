"use client";

import {
  type ScooterImportSnapshot,
  type ScooterImportStatus,
} from "./scooter-import-workspace";
import { ScooterInsuranceSelection } from "./ScooterInsuranceSelection";
import { PageLayout } from "@repo/ui/components/page-layout";
import { useFormAction } from "@/lib/form/use-form-action";
import { SaveButton } from "@repo/ui/components/save-button";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { PageTitleOverride } from "@/components/PageTitleOverride";

import { ApiError, v1 } from "@repo/api-shared";
import { Button, Checkbox, buttonVariants } from "@repo/ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormProvider, get, type FieldErrors, useWatch } from "react-hook-form";

import { FormSummary } from "@/components/form/FormSummary";
import { webApi } from "@/lib/api";
import { useZodForm } from "@/lib/form/use-zod-form";
import { useScooterExtraction } from "./useScooterExtraction";
import { useScooterDocuments } from "./useScooterDocuments";
import type { ScooterPhotosSnapshot } from "./useScooterPhotos";
import { ScooterPhotos } from "./ScooterPhotos";
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
import { ScooterCreateFields } from "./ScooterCreateFields";
import { ScooterCreateActions } from "./ScooterCreateActions";
import {
  scooterEditorMessage,
  scooterServerFieldErrors,
} from "./scooter-editor-messages";
import {
  insuranceEditorDefaults,
  scooterChangedFields,
  scooterCreateFormSchema,
  scooterEditFormSchema,
  scooterEditorDefaults,
  scooterRequiredFieldsValid,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterFieldConflict } from "./scooter-feedback";

export interface ScooterEditorProps {
  scooter?: v1.scooters.Scooter;
  returnHref: string;
  brands: v1.scooterBrands.ScooterBrand[];
  vocabulary?: CivVocabulary;
  importDraft?: v1.scooters.ScooterImportDraft;
  initialSnapshot?: ScooterImportSnapshot;
  onSnapshot?: (snapshot: ScooterImportSnapshot) => void;
  onCreated?: (scooter: v1.scooters.Scooter, reviewNext: boolean) => void;
  embedded?: boolean;
  persistenceBlocked?: boolean;
  incomingFiles?: { id: string; files: File[] };
}

export function ScooterEditor({
  scooter,
  returnHref,
  brands,
  vocabulary = [],
  importDraft,
  initialSnapshot,
  onSnapshot,
  onCreated,
  embedded = false,
  persistenceBlocked = false,
  incomingFiles,
}: ScooterEditorProps) {
  const formAction = useFormAction();

  const t = useTranslations("scooters");
  const router = useRouter();
  const user = useOptionalSession()?.user;
  const canWriteDocuments = canAccess(user, "scooter_documents.write");
  const canExtract = canAccess(user, "scooter_documents.extract");
  const [createdBrands, setCreatedBrands] = useState<
    v1.scooterBrands.ScooterBrand[]
  >(() => initialSnapshot?.createdBrands ?? []);
  const availableBrands = [
    ...new Map(
      [...brands, ...createdBrands].map((brand) => [brand.id, brand]),
    ).values(),
  ];
  const [importedRawFields, setImportedRawFields] = useState<Record<
    string,
    string
  > | null>(initialSnapshot?.importedRawFields ?? null);
  const documents = useScooterDocuments(scooter?.documents, {
    ...(importDraft
      ? { session: { id: importDraft.id, expiresAt: importDraft.expiresAt } }
      : {}),
    snapshot: initialSnapshot?.documents,
  });
  const acceptedBatches = useRef(new Set<string>());
  useEffect(() => {
    if (!incomingFiles || acceptedBatches.current.has(incomingFiles.id)) return;
    acceptedBatches.current.add(incomingFiles.id);
    documents.add(null, incomingFiles.files);
  }, [incomingFiles, documents]);
  const analysis = useScooterDocumentAnalysis(documents, scooter?.id, {
    persistent: Boolean(importDraft),
    snapshot: initialSnapshot?.analysis,
  });
  const createAndNext = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [vinReviewRequired, setVinReviewRequired] = useState(false);
  const [vinReviewRequested, setVinReviewRequested] = useState(false);
  const [vinPreviewsLoading, setVinPreviewsLoading] = useState(false);
  const [importedSignature, setImportedSignature] = useState<string | null>(
    initialSnapshot?.importedSignature ?? null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const pendingFocus = useRef<FieldErrors<ScooterEditorValues> | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [saveCompleted, setSaveCompleted] = useState(false);
  const form = useZodForm<ScooterEditorValues, v1.scooters.UpdateScooterInput>(
    scooter ? scooterEditFormSchema : scooterCreateFormSchema,
    {
      defaultValues: initialSnapshot?.values ?? scooterEditorDefaults(scooter),
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
    initialRawFields:
      initialSnapshot?.importedRawFields ?? scooter?.civRawFields ?? {},
    snapshot: initialSnapshot?.extraction,
    onRawFields: setImportedRawFields,
  });
  const [currentInsuranceSourceId, setCurrentInsuranceSourceId] = useState<
    string | null | undefined
  >(initialSnapshot?.currentInsuranceSourceId);
  const insuranceReadings = Object.entries(analysis.entries).flatMap(
    ([sourceId, entry]) => {
      if (entry.status !== "success") return [];
      const source = extraction.sources.find(
        (item) => item.sourceId === sourceId,
      );
      if (!source) return [];
      const children = entry.analysis.extractedData.documents;
      if (!children?.length)
        return entry.analysis.documentType === "insurance"
          ? [
              {
                id: sourceId,
                sourceId,
                fileName: source.fileName,
                pages: [] as number[],
                policyId: source.insurancePolicyId,
                fields: entry.analysis.extractedData.fields,
                vin: entry.analysis.extractedData.vin,
              },
            ]
          : [];
      return children
        .filter((document) => document.documentType === "insurance")
        .map((document) => ({
          id: `${sourceId}:${document.id}`,
          sourceId,
          fileName: source.fileName,
          pages: document.pages,
          policyId: source.insurancePolicyId,
          fields: document.fields,
          vin: document.vin,
        }));
    },
  );
  const groupedInsurance = new Map<string, typeof insuranceReadings>();
  if (!scooter)
    for (const reading of insuranceReadings) {
      const { insuredName, validFrom, validUntil, premiumAmount, currency } =
        reading.fields;
      const fingerprint =
        reading.vin && insuredName && validFrom && validUntil
          ? JSON.stringify([
              reading.vin,
              insuredName,
              validFrom,
              validUntil,
              premiumAmount ?? null,
              currency ?? null,
            ])
          : reading.id;
      groupedInsurance.set(fingerprint, [
        ...(groupedInsurance.get(fingerprint) ?? []),
        reading,
      ]);
    }
  const insuranceOptions = [...groupedInsurance.values()].map((readings) => ({
    ...readings[0]!,
    id: readings.map((reading) => reading.id).sort()[0]!,
    fileName: [...new Set(readings.map((reading) => reading.fileName))].join(
      ", ",
    ),
    members: readings.map((reading) => reading.id),
  }));
  const selectedInsuranceOption = currentInsuranceSourceId
    ? insuranceOptions.find((item) =>
        item.members.includes(currentInsuranceSourceId),
      )
    : undefined;
  const selectedInsuranceSourceId =
    currentInsuranceSourceId === null
      ? null
      : (selectedInsuranceOption?.id ??
        (insuranceOptions.length === 1 ? insuranceOptions[0]!.id : undefined));
  const selectedInsuranceSourceIds =
    insuranceOptions.find((item) => item.id === selectedInsuranceSourceId)
      ?.members ?? [];
  const insuranceSelectionRequired =
    insuranceOptions.length > 1 && selectedInsuranceSourceId === undefined;
  const sourceSignature = JSON.stringify(extraction.sources);
  const importedCurrentDocuments = importedSignature === sourceSignature;
  const hasFailedAnalysis = Object.values(analysis.entries).some(
    (entry) => entry.status === "failed",
  );
  const vinReviewDocuments = extraction.sources
    .filter((source) => v1.scooters.scooterDocumentReadsVin(source.type))
    .flatMap((source) => {
      const entry = analysis.entries[source.sourceId];
      const unverified = extraction.unverifiedSources.some(
        (item) => item.sourceId === source.sourceId,
      );
      if (entry?.status !== "success" && !unverified) return [];
      const data =
        entry?.status === "success" ? entry.analysis.extractedData : undefined;
      const draft = documents.drafts.find(
        (item) => item.id === source.sourceId,
      );
      const saved = documents.existing.find(
        (item) => item.id === source.sourceId,
      );
      return [
        {
          sourceId: source.sourceId,
          fileName: source.fileName,
          vin: data?.vin ?? null,
          originalVin: data?.vinReview
            ? data.vinReview.originalVin
            : (data?.vin ?? null),
          file: draft?.file,
          src: saved ? webApi.url(saved.contentUrl) : undefined,
          contentType: saved?.contentType,
        },
      ];
    });
  const [previousAnalysisSignature, setPreviousAnalysisSignature] =
    useState(sourceSignature);
  if (previousAnalysisSignature !== sourceSignature) {
    setPreviousAnalysisSignature(sourceSignature);
    setAnalysisError(null);
    setVinReviewRequired(false);
    setVinReviewRequested(false);
  }
  const unverifiedSources = extraction.unverifiedSources.filter(
    (source) =>
      Boolean(scooter) ||
      !canExtract ||
      analysis.entries[source.sourceId]?.status === "failed" ||
      (!analysis.running &&
        analysis.entries[source.sourceId]?.status === "success"),
  );
  const [photoSnapshot, setPhotoSnapshot] = useState<
    ScooterPhotosSnapshot | undefined
  >(initialSnapshot?.photos);
  const onPhotoSnapshot = useCallback(
    (snapshot: ScooterPhotosSnapshot) =>
      setPhotoSnapshot((previous) =>
        JSON.stringify(previous) === JSON.stringify(snapshot)
          ? previous
          : snapshot,
      ),
    [],
  );
  const [photosBusy, setPhotosBusy] = useState(false);
  const [photosChanged, setPhotosChanged] = useState(false);
  const onPhotosSaved = useCallback(() => setPhotosChanged(true), []);
  const [photoDrafts, setPhotoDrafts] = useState<
    v1.scooters.ScooterPhotoDraft[]
  >([]);
  const [photosBlocked, setPhotosBlocked] = useState(false);
  const onPhotoDraftsChange = useCallback(
    (drafts: v1.scooters.ScooterPhotoDraft[], blocked: boolean) => {
      setPhotoDrafts(drafts);
      setPhotosBlocked(blocked);
    },
    [],
  );
  const { isSubmitting, isDirty, dirtyFields, submitCount } = form.formState;
  const powertrain = useWatch({
    control: form.control,
    name: "powertrainType",
  });
  const createValues = useWatch({
    control: form.control,
  });
  const hasCivEvidence =
    v1.scooters.hasScooterCivEvidence({
      ...createValues,
      civRawFields: importedRawFields ?? scooter?.civRawFields,
      documentDrafts: [...documents.existing, ...documents.drafts].flatMap(
        (document) => {
          if (!document.type) return [];
          const entry = analysis.entries[document.id];
          return [
            {
              type: document.type,
              extractedData:
                entry?.status === "success"
                  ? entry.analysis.extractedData
                  : (documents.extractions[document.id] ??
                    ("extractedData" in document
                      ? document.extractedData
                      : undefined)),
            },
          ];
        },
      ),
    }) ||
    Object.values(analysis.entries).some(
      (entry) =>
        entry.status === "success" &&
        entry.analysis.extractedData.documents?.some(
          (document) => document.documentType === "civ",
        ),
    );
  useEffect(() => {
    if (hasCivEvidence && form.getValues("civAvailability") !== "issued")
      form.setValue("civAvailability", "issued", {
        shouldDirty: true,
        shouldValidate: true,
      });
  }, [hasCivEvidence, form]);
  const clearedFields =
    scooter && scooter.powertrainType !== powertrain
      ? v1.scooters
          .inactivePowertrainFields(powertrain)
          .filter((field) => scooter[field] != null)
      : [];

  function focusErrors(errors: FieldErrors<ScooterEditorValues>) {
    pendingFocus.current = errors;
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
  }, [isSubmitting, submitCount]);

  async function submit(input: v1.scooters.UpdateScooterInput) {
    if (
      persistenceBlocked ||
      submitting.current ||
      saveCompleted ||
      photosBusy ||
      photosBlocked ||
      analysis.running ||
      documents.blocked ||
      vinReviewRequired ||
      extraction.vinMismatch ||
      extraction.unverifiedSources.length ||
      logicalVinConflict ||
      insuranceSelectionRequired
    )
      return;
    submitting.current = true;
    setRequestError(null);
    try {
      // Gallery writes have already persisted; a photo-only Save finishes editing.
      if (
        scooter &&
        photosChanged &&
        !isDirty &&
        !documents.changed &&
        !importedRawFields
      ) {
        setSaveCompleted(true);
        router.push(returnHref);
        router.refresh();
        return;
      }
      const sessionId = await documents.ensureSession();
      documents.beginSave();
      const json = scooter ? scooterChangedFields(input, dirtyFields) : input;
      const payload: v1.scooters.UpdateScooterInput = {
        ...json,
        ...(!scooter && photoDrafts.length ? { photoDrafts } : {}),
        sessionId,
        ...documents.payload,
        ...(input.insurancePolicies?.length
          ? { insurancePolicies: input.insurancePolicies }
          : {}),
        ...(importedRawFields ? { civRawFields: importedRawFields } : {}),
      };
      if (!canWriteDocuments) {
        delete payload.documentDrafts;
        delete payload.documentExtractions;
        delete payload.removedDocumentIds;
        delete payload.insurancePolicies;
        delete payload.civVersion;
        delete payload.civIssuedAt;
        delete payload.civIssuingAuthority;
        delete payload.civRawFields;
      }
      const savedScooter = await webApi.fetch(
        scooter
          ? v1.scooters.ROUTES.update(scooter.id)
          : v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        {
          method: scooter ? "PATCH" : "POST",
          json: payload,
        },
      );
      documents.saved();
      setSaveCompleted(true);
      if (onCreated) {
        onCreated(savedScooter, createAndNext.current);
        return;
      }
      router.push(
        scooter
          ? returnHref
          : `${returnHref.replace(/\/$/, "")}/${encodeURIComponent(savedScooter.id)}`,
      );
      router.refresh();
    } catch (error) {
      documents.saveFailed();
      if (documents.handleSessionError(error)) {
        setRequestError(t("feedback.sessionExpired"));
        return;
      }
      if (
        error instanceof ApiError &&
        [
          "SCOOTER_FLEET_NUMBER_CONFLICT",
          "SCOOTER_FLEET_NUMBER_EXHAUSTED",
        ].includes(error.code ?? "")
      ) {
        const message = t(
          error.code === "SCOOTER_FLEET_NUMBER_CONFLICT"
            ? "numbering.conflict"
            : "numbering.exhausted",
        );
        form.setError("fleetNumber", { type: "server", message });
        focusErrors({ fleetNumber: { type: "server", message } });
        setRequestError(message);
        return;
      }
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

  function applyAnalysis(
    entries: (DocumentAnalysisState | undefined)[],
    confirmedSourceIds: string[] = [],
  ) {
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
        insuranceOptions.length
          ? {
              currentInsuranceSourceId: selectedInsuranceSourceId ?? null,
              currentInsuranceSourceIds: selectedInsuranceSourceIds,
            }
          : undefined,
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
    const unresolved =
      !form.getValues("vin") &&
      extraction.sources.some((source) => {
        const success = successes.find(
          (item) => item.sourceId === source.sourceId,
        );
        return (
          v1.scooters.scooterDocumentReadsVin(source.type) &&
          !success?.extractedData.vin &&
          !confirmedSourceIds.includes(source.sourceId) &&
          !extraction.isVinConfirmed(source.sourceId)
        );
      });
    if (unresolved) {
      return false;
    }
    setImportedSignature(sourceSignature);
    return true;
  }

  async function openVinReview() {
    if (vinPreviewsLoading) return;
    setVinPreviewsLoading(true);
    try {
      await Promise.all(
        documents.drafts
          .filter((draft) => draft.fileUnavailable && draft.uploadToken)
          .map((draft) => documents.preview(draft)),
      );
      setVinReviewRequested(true);
    } catch {
      setAnalysisError(t("documents.pdfPreviewError"));
    } finally {
      setVinPreviewsLoading(false);
    }
  }

  async function extractAndContinue() {
    if (!canExtract || analysis.running || documents.blocked) return;
    setAnalysisError(null);
    if (importedCurrentDocuments && !hasFailedAnalysis) {
      return;
    }
    const results = await analysis.run();
    if (!results || results.some((entry) => entry?.status === "failed")) return;
    applyAnalysis(results);
  }

  // Uploading is the user's intent to analyze. Never retry a failed paid request automatically.
  const runAnalysis = analysis.run;
  useEffect(() => {
    if (
      scooter ||
      saveCompleted ||
      !canExtract ||
      (importedCurrentDocuments &&
        documents.drafts.every(
          (draft) => draft.type && documents.extractions[draft.id],
        ))
    )
      return;
    if (
      documents.drafts.some(
        (draft) =>
          draft.status === "ready" &&
          draft.version !== "client_copy" &&
          (!analysis.entries[draft.id] ||
            analysis.entries[draft.id]?.status === "processing"),
      )
    )
      void runAnalysis({ automatic: true });
  }, [
    scooter,
    saveCompleted,
    canExtract,
    documents.drafts,
    analysis.entries,
    analysis.running,
    runAnalysis,
    importedCurrentDocuments,
    documents.extractions,
  ]);

  const assignInsurance = documents.assignInsurance;
  useEffect(() => {
    for (const draft of documents.drafts) {
      const entry = analysis.entries[draft.id];
      if (
        entry?.status === "success" &&
        entry.analysis.extractedData.documents?.some(
          (document) => document.documentType === "insurance",
        )
      )
        assignInsurance(draft.id);
    }
  }, [documents.drafts, analysis.entries, assignInsurance]);
  const classify = documents.classify;
  useEffect(() => {
    if (scooter || saveCompleted) return;
    for (const draft of documents.drafts) {
      const entry = analysis.entries[draft.id];
      if (
        draft.version !== "client_copy" &&
        draft.type === null &&
        entry?.status === "success"
      )
        classify(draft.id, entry.analysis.documentType);
    }
  }, [scooter, saveCompleted, documents.drafts, analysis.entries, classify]);

  useEffect(() => {
    if (scooter || saveCompleted) return;
    const policies = form.getValues("insurancePolicies") ?? [];
    const missing = [
      ...new Set(
        documents.drafts
          .filter(
            (draft) =>
              draft.insurancePolicyId &&
              !policies.some((policy) => policy.id === draft.insurancePolicyId),
          )
          .map((draft) => draft.insurancePolicyId!),
      ),
    ];
    if (missing.length)
      form.setValue(
        "insurancePolicies",
        [{ ...insuranceEditorDefaults(), ...policies[0], id: missing[0]! }],
        { shouldDirty: true },
      );
  }, [scooter, saveCompleted, documents.drafts, form]);

  const automaticImport = useRef(initialSnapshot?.automaticImport ?? "");
  useEffect(() => {
    if (scooter || saveCompleted) return;
    const successes = Object.values(analysis.entries).filter(
      (entry) =>
        entry.status === "success" &&
        extraction.sources.some(
          (source) =>
            source.sourceId === entry.analysis.sourceId &&
            source.type === entry.analysis.documentType,
        ),
    );
    const signature = JSON.stringify([
      sourceSignature,
      successes,
      selectedInsuranceSourceId,
      selectedInsuranceSourceIds,
    ]);
    if (!successes.length || signature === automaticImport.current) return;
    automaticImport.current = signature;
    applyAnalysis(successes);
  });

  const createFormValid =
    scooterCreateFormSchema.safeParse(createValues).success;
  const needsDocumentReview = Boolean(
    vinReviewRequired ||
    extraction.vinMismatch ||
    extraction.unverifiedSources.length,
  );
  const documentsProcessing =
    analysis.running ||
    documents.drafts.some((document) => document.status === "uploading") ||
    Object.values(analysis.entries).some(
      (entry) => entry.status === "processing",
    );
  const createStatus = t(
    analysis.running
      ? "creation.analyzing"
      : documents.blocked || needsDocumentReview
        ? "creation.blocked"
        : createFormValid
          ? "creation.ready"
          : "creation.incomplete",
  );

  const logicalVins = Object.values(analysis.entries).flatMap((entry) =>
    entry.status === "success"
      ? (entry.analysis.extractedData.documents
          ?.filter((document) =>
            v1.scooters.scooterDocumentReadsVin(document.documentType),
          )
          .map((document) => document.vin)
          .filter(Boolean) ?? [])
      : [],
  );
  const logicalVinConflict =
    new Set([...logicalVins, ...(createValues.vin ? [createValues.vin] : [])])
      .size > 1;
  const workspaceStatus: ScooterImportStatus = saveCompleted
    ? "created"
    : photosBusy ||
        documents.drafts.some((draft) => draft.status === "uploading")
      ? "uploading"
      : Object.values(analysis.entries).some(
            (entry) =>
              entry.status === "processing" && entry.phase !== "queued",
          )
        ? "analysing"
        : analysis.running
          ? "queued"
          : hasFailedAnalysis ||
              photosBlocked ||
              documents.drafts.some((draft) => draft.status === "failed") ||
              logicalVinConflict ||
              insuranceSelectionRequired
            ? "attention"
            : Object.values(analysis.entries).some(
                  (entry) => entry.status === "success",
                )
              ? !needsDocumentReview && createFormValid && !documents.blocked
                ? "ready"
                : "review"
              : createFormValid
                ? "ready"
                : "empty";
  useEffect(() => {
    onSnapshot?.({
      version: 1,
      values: form.getValues(),
      documents: documents.snapshot,
      analysis: analysis.getSnapshot(),
      extraction: extraction.getSnapshot(),
      importedRawFields,
      importedSignature,
      automaticImport: automaticImport.current,
      reviewedDocuments: [],
      photos: photoSnapshot,
      currentInsuranceSourceId,
      createdBrands,
      status: workspaceStatus,
    });
  });
  const Boundary = embedded ? "div" : PageLayout;
  return (
    <Boundary>
      {scooter && (
        <>
          <PageTitleOverride title={v1.scooters.scooterDisplayCode(scooter)} />
          <h1 className="text-2xl font-semibold">
            {v1.scooters.scooterDisplayCode(scooter)}
          </h1>
        </>
      )}
      <CivVocabularyContext value={vocabulary}>
        <FormProvider {...form}>
          <form
            ref={formRef}
            className="grid min-w-0 gap-8"
            noValidate
            onSubmit={(event) => {
              if (
                scooter &&
                photosChanged &&
                !isDirty &&
                !documents.changed &&
                !importedRawFields
              ) {
                event.preventDefault();
                void submit({});
                return;
              }
              void form.handleSubmit(submit, (errors) => {
                setRequestError(null);
                focusErrors(errors);
              })(event);
            }}
          >
            <FormSummary
              title={t(
                scooter
                  ? "feedback.updateErrorTitle"
                  : "feedback.createErrorTitle",
              )}
              message={
                documents.sessionUnavailable
                  ? t("feedback.sessionExpired")
                  : requestError
              }
            />
            <div className="grid gap-4 scroll-mt-8">
              <ScooterDocumentAnalysisContext value={analysis.entries}>
                <ScooterImportReviewProvider
                  editing={Boolean(scooter)}
                  result={extraction.reviewResult}
                  sources={extraction.sources}
                >
                  <ScooterEditorFields
                    step="documents"
                    combinedReview={!scooter}
                    onLogicalDocument={(sourceId, documentId, patch) => {
                      if (patch.documentType)
                        extraction.resetAutomaticSource(sourceId);
                      analysis.updateLogicalDocument(
                        sourceId,
                        documentId,
                        patch,
                      );
                    }}
                    scooterVin={createValues.vin}
                    onRetryAnalysis={(sourceId) => {
                      void analysis.run({ sourceId });
                    }}
                    analyzing={analysis.running}
                    onCancelAnalysis={analysis.cancel}
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
                      scooter?.insurancePolicies?.map((policy) => policy.id) ??
                      []
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
                    disabled={isSubmitting}
                  />
                  {vinPreviewsLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t("workspace.previewLoading")}
                    </p>
                  ) : null}
                  {logicalVinConflict ? (
                    <p role="alert" className="text-sm text-destructive">
                      {t("workspace.logicalVinMismatch")}
                    </p>
                  ) : null}
                  {insuranceOptions.length ? (
                    <ScooterInsuranceSelection
                      options={insuranceOptions}
                      value={selectedInsuranceSourceId}
                      required={insuranceSelectionRequired}
                      disabled={isSubmitting || analysis.running}
                      onChange={(id) => {
                        const option = insuranceOptions.find(
                          (item) => item.id === id,
                        );
                        extraction.resetInsuranceSelection(
                          option?.policyId ?? undefined,
                        );
                        setCurrentInsuranceSourceId(id);
                      }}
                    />
                  ) : null}
                  <section className="mt-8 grid min-w-0 gap-6 pt-8">
                    <h2 className="text-xl font-semibold">
                      {t("creation.scooterDetails")}
                    </h2>
                    <ScooterCreateFields
                      editing={Boolean(scooter)}
                      hasCivEvidence={hasCivEvidence}
                      photos={
                        <ScooterPhotos
                          scooterId={scooter?.id}
                          initialSnapshot={initialSnapshot?.photos}
                          importDraftId={importDraft?.id}
                          onSnapshot={importDraft ? onPhotoSnapshot : undefined}
                          panel
                          number={2}
                          disabled={isSubmitting}
                          onBusyChange={setPhotosBusy}
                          onSaved={onPhotosSaved}
                          onDraftsChange={onPhotoDraftsChange}
                        />
                      }
                      brands={availableBrands}
                      onBrandCreated={(brand) =>
                        setCreatedBrands((current) => [...current, brand])
                      }
                      disabled={isSubmitting}
                    />
                  </section>
                </ScooterImportReviewProvider>
              </ScooterDocumentAnalysisContext>
              <div
                className="grid gap-4 scroll-mt-8"
                hidden={!needsDocumentReview && !analysisError}
              >
                {analysisError && !vinReviewRequired ? (
                  <p role="alert" className="text-sm text-destructive">
                    {analysisError}
                  </p>
                ) : null}
                {(vinReviewRequested ||
                  Boolean(
                    scooter && (vinReviewRequired || extraction.vinMismatch),
                  )) &&
                vinReviewDocuments.length ? (
                  <ScooterVinReview
                    key={JSON.stringify([sourceSignature, vinReviewDocuments])}
                    documents={vinReviewDocuments}
                    initialVin={!scooter ? form.getValues("vin") : ""}
                    showSummary={Boolean(scooter)}
                    onClose={
                      !scooter ? () => setVinReviewRequested(false) : undefined
                    }
                    disabled={
                      isSubmitting || analysis.running || documents.blocked
                    }
                    onApply={(corrections, vin) => {
                      const analyzed = corrections.filter(
                        (correction) =>
                          analysis.entries[correction.sourceId]?.status ===
                          "success",
                      );
                      const manuallyConfirmed = corrections
                        .filter(
                          (correction) =>
                            analysis.entries[correction.sourceId]?.status !==
                            "success",
                        )
                        .map((correction) => correction.sourceId);
                      const reviewed = analysis.reviewVins(analyzed);
                      if (!reviewed) return false;
                      form.setValue("vin", vin, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.clearErrors("vin");
                      if (!applyAnalysis(reviewed, manuallyConfirmed))
                        return false;
                      manuallyConfirmed.forEach(extraction.confirmVin);
                      setVinReviewRequested(false);
                      return true;
                    }}
                  />
                ) : null}
                {scooter && extraction.vinMismatch ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t("documentImport.vinMismatch", { fields: "VIN" })}
                  </p>
                ) : null}
                {scooter && unverifiedSources.length ? (
                  <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
                    <p className="text-sm font-medium text-warning">
                      {t("wizard.verifyVin")}
                    </p>
                    <ScooterVinReference />
                    {unverifiedSources.map((source) => (
                      <label
                        key={source.sourceId}
                        className="flex items-start gap-3 rounded-lg bg-control p-3 text-sm"
                      >
                        <Checkbox
                          checked={false}
                          disabled={isSubmitting}
                          onCheckedChange={(checked) => {
                            if (checked) extraction.confirmVin(source.sourceId);
                          }}
                        />
                        <span className="min-w-0 break-words">
                          {t("wizard.confirmVin", {
                            fileName: source.fileName,
                          })}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
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
            <ScooterCreateActions
              ready={photosChanged || scooterRequiredFieldsValid(createValues)}
              pending={documentsProcessing}
              submitting={isSubmitting}
              status={
                scooter
                  ? undefined
                  : needsDocumentReview && !documentsProcessing
                    ? t(
                        extraction.vinMismatch || vinReviewRequired
                          ? "creation.documentVinMismatchCheck"
                          : "creation.documentVinUnknownCheck",
                        {
                          documents: vinReviewDocuments
                            .filter(
                              (document) =>
                                !document.vin ||
                                document.vin !== createValues.vin,
                            )
                            .map((document) => document.fileName)
                            .join(", "),
                        },
                      )
                    : createStatus
              }
              review={
                !scooter && needsDocumentReview
                  ? {
                      label: t("creation.validateDocuments"),
                      disabled:
                        isSubmitting ||
                        analysis.running ||
                        documents.blocked ||
                        vinPreviewsLoading,
                      onClick: () => {
                        void openVinReview();
                      },
                    }
                  : undefined
              }
            >
              {scooter && analysis.running ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={analysis.cancel}
                >
                  {t("extraction.cancel")}
                </Button>
              ) : null}
              <Link
                href={returnHref}
                className={buttonVariants({ variant: "outline" })}
                aria-disabled={isSubmitting || photosBusy}
                tabIndex={isSubmitting || photosBusy ? -1 : undefined}
                onClick={(event) => {
                  if (isSubmitting || photosBusy) event.preventDefault();
                }}
              >
                {t("actions.cancel")}
              </Link>
              {canExtract && scooter && extraction.sources.length ? (
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
              {onCreated ? (
                <SaveButton
                  type="submit"
                  variant="outline"
                  onClick={() => {
                    createAndNext.current = true;
                  }}
                  disabled={
                    persistenceBlocked ||
                    saveCompleted ||
                    photosBusy ||
                    photosBlocked ||
                    isSubmitting ||
                    analysis.running ||
                    documents.blocked ||
                    needsDocumentReview ||
                    logicalVinConflict ||
                    insuranceSelectionRequired
                  }
                  {...formAction(
                    "create",
                    {
                      pending: isSubmitting,
                      error: requestError,
                      success: saveCompleted,
                    },
                    t("workspace.createNext"),
                  )}
                />
              ) : null}
              <SaveButton
                onClick={() => {
                  createAndNext.current = false;
                }}
                type="submit"
                disabled={
                  persistenceBlocked ||
                  saveCompleted ||
                  photosBusy ||
                  photosBlocked ||
                  isSubmitting ||
                  analysis.running ||
                  documents.blocked ||
                  vinReviewRequired ||
                  extraction.vinMismatch ||
                  extraction.unverifiedSources.length > 0 ||
                  logicalVinConflict ||
                  insuranceSelectionRequired ||
                  Boolean(
                    scooter &&
                    !isDirty &&
                    !photosChanged &&
                    !documents.changed &&
                    !importedRawFields,
                  )
                }
                {...formAction(
                  scooter ? "save" : "create",
                  {
                    pending: isSubmitting,
                    error: requestError,
                    success: saveCompleted,
                  },
                  t(scooter ? "actions.save" : "actions.create"),
                )}
              />
            </ScooterCreateActions>
          </form>
        </FormProvider>
      </CivVocabularyContext>
    </Boundary>
  );
}
