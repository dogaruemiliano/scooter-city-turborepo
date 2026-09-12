"use client";

import { ApiError, v1 } from "@repo/api-shared";
import type {
  CountryCode,
  PhoneNumberInputChangeDetails,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useRef, useEffect, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import {
  createExtractionState,
  markExtractionFieldEdited,
  invalidateDocumentExtraction,
  applyExtractionSuggestion,
  type ExtractionFieldKey,
} from "./extraction-state";
import { ExtractionReviewContext } from "./ExtractionReviewContext";
import { useDocumentExtraction } from "./useDocumentExtraction";
import { DocumentExtractionFeedback } from "./DocumentExtractionFeedback";
import { AddressSection } from "./AddressSection";
import { CitizenshipChoice } from "./CitizenshipChoice";
import {
  WizardProgress,
  REVIEW_STEPS,
  isReviewStep,
  type PersonReviewStep,
  type PersonWizardStep,
} from "./WizardProgress";
import { PersonalSection } from "./PersonalSection";
import { ContactSection } from "./ContactSection";
import { CreateFormFeedback } from "./CreateFormFeedback";
import { DocumentsSection } from "./DocumentsSection";
import { DocumentPhotosSection } from "./DocumentPhotosSection";
import {
  documentFieldErrorKey,
  documentFieldFromErrorKey,
  formErrorKeyFromPath,
  formErrorsFromIssues,
  isBlankField,
  isDocumentFieldErrorKey,
  isPersonFormFieldKey,
} from "./errors";
import { FormActions } from "./FormActions";
import {
  createEmptyCreateForm,
  switchDocumentWorkflow,
  updateDocumentDrafts,
  isUnder18Person,
  documentPhotoSlots,
} from "./form-state";
import { createPersonInput } from "./input";
import { NotesField } from "./NotesField";
import { NationalIdFormatSelect } from "./NationalIdFormatSelect";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  Feedback,
  FormErrorKey,
  FormErrors,
  FormValidationIssue,
  PersonCitizenship,
  NationalIdFormat,
  PersonCreateFormProps,
  PersonDocumentFormFieldKey,
} from "./types";

export function PersonCreateForm({ personsHref }: PersonCreateFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<PersonWizardStep>("citizenship");
  const [chosenNationalIdFormat, setChosenNationalIdFormat] =
    useState<NationalIdFormat | null>(null);
  const [extractionState, setExtractionState] = useState(() =>
    createExtractionState(createEmptyCreateForm("romanian")),
  );
  const form = extractionState.form;
  const extraction = useDocumentExtraction(extractionState, setExtractionState);
  function setForm(
    update: (current: CreatePersonFormState) => CreatePersonFormState,
  ) {
    setExtractionState((current) => ({
      ...current,
      form: update(current.form),
    }));
  }
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const showUnder18Warning = isUnder18Person(form);
  const uploadingPhotos = hasDocumentPhotoStatus(form, "uploading");
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeading.current?.focus();
  }, [step]);

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    if (step !== "review") {
      nextStep();
      return;
    }
    if (extraction.pending) return;
    setFeedback(null);
    setFieldErrors({});

    const failedPhoto = firstDocumentPhotoWithStatus(form, "failed");
    if (failedPhoto) {
      setFeedback({
        kind: "error",
        title: t("feedback.documentPhotoUploadErrorTitle"),
        messages: [failedPhoto.message],
      });
      return;
    }

    if (uploadingPhotos) {
      setFeedback({
        kind: "error",
        title: t("feedback.documentPhotoUploadErrorTitle"),
        messages: [t("feedback.documentPhotoUploadPendingMessage")],
      });
      return;
    }

    const inputCandidate = createPersonInput(form, (field, error) => {
      const fieldLabel =
        field === "dateOfBirth"
          ? t("fields.dateOfBirth")
          : field === "documentIssuedOn"
            ? t("fields.documentIssuedOn")
            : t("fields.documentExpiresOn");

      return error === "incomplete"
        ? t("feedback.date.incomplete", { field: fieldLabel })
        : t("feedback.date.invalid", { field: fieldLabel });
    });
    if (inputCandidate.error) {
      setStep(stepForField(inputCandidate.error.field));
      setFieldErrors({
        [inputCandidate.error.field]: inputCandidate.error.message,
      });
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: [inputCandidate.error.message],
      });
      return;
    }

    const input = v1.persons.createPersonInputSchema.safeParse(
      inputCandidate.input,
    );
    if (!input.success) {
      const nextFieldErrors = formErrorsFromIssues(
        input.error.issues,
        form,
        formatValidationIssue,
      );
      setFieldErrors(nextFieldErrors);
      setStep(stepForField(Object.keys(nextFieldErrors)[0] as FormErrorKey));
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages:
          input.error.issues.length > 0
            ? input.error.issues.map((issue) =>
                formatValidationIssue(
                  issue,
                  formErrorKeyFromPath(issue.path, form),
                ),
              )
            : [t("feedback.createValidationFallback")],
      });
      return;
    }

    setCreating(true);
    try {
      const person = await webApi.fetch(
        v1.persons.ROUTES.create,
        v1.persons.personSchema,
        {
          method: "POST",
          json: input.data,
        },
      );

      setFeedback({
        kind: "success",
        title: t("feedback.createSuccessTitle"),
        messages: [t("feedback.createSuccessMessage")],
      });
      router.push(`${personsHref}/${encodeURIComponent(person.id)}`);
      router.refresh();
    } catch (error) {
      const personConflict = personCreateConflict(error);
      if (personConflict) {
        setFieldErrors({ [personConflict.field]: personConflict.message });
        setStep(stepForField(personConflict.field));
      }
      const message = personConflict
        ? personConflict.message
        : error instanceof ApiError
          ? error.message
          : t("feedback.genericError");

      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: [message],
      });
    } finally {
      setCreating(false);
    }
  }

  function formatValidationIssue(
    issue: FormValidationIssue,
    field: FormErrorKey | null,
  ): string {
    if (isDocumentFieldErrorKey(field, "photos")) {
      const documentKey = documentFieldFromErrorKey(field)?.documentKey;
      const document = form.documents.find((item) => item.key === documentKey);
      return t("feedback.validation.requiredDocumentPhotos", {
        document: document
          ? t(`documentTypes.${document.type}`)
          : t("sections.documentPhotos"),
      });
    }
    if (field === "documents") {
      return issue.message === "Document types must be unique."
        ? t("feedback.validation.duplicateDocumentTypes")
        : t("feedback.validation.documentSlotLimit");
    }

    if (field === "email") {
      return isBlankField(field, form)
        ? t("feedback.validation.required", { field: fieldLabel(field) })
        : t("feedback.validation.invalidEmail");
    }

    if (field === "phone") {
      return isBlankField(field, form)
        ? t("feedback.validation.required", { field: fieldLabel(field) })
        : t("feedback.validation.invalidPhone");
    }

    if (field === "cnp" || isDocumentFieldErrorKey(field, "cnp")) {
      return t("feedback.validation.invalidCnp");
    }

    const label = fieldLabel(field);

    if (issue.code === "too_small" && issue.minimum === 1) {
      return t("feedback.validation.required", { field: label });
    }

    if (
      issue.code === "too_big" &&
      (typeof issue.maximum === "number" || typeof issue.maximum === "bigint")
    ) {
      return t("feedback.validation.maxLength", {
        field: label,
        max: Number(issue.maximum),
      });
    }

    if (issue.message === v1.common.FUTURE_DATE_MESSAGE) {
      return t("feedback.validation.futureDate", { field: label });
    }

    return issue.code === "invalid_format" || issue.code === "custom"
      ? t("feedback.validation.invalid", { field: label })
      : t("feedback.validation.fallback");
  }

  function fieldLabel(field: FormErrorKey | null): string {
    if (!field) return t("createPage.formTitle");

    const documentField = documentFieldFromErrorKey(field);
    if (documentField) {
      switch (documentField.field) {
        case "type":
          return t("fields.documentType");
        case "series":
          return t("fields.documentSeries");
        case "number": {
          const document = form.documents.find(
            (item) => item.key === documentField.documentKey,
          );
          return document?.type === "nationalId"
            ? t("fields.nationalIdNumber")
            : t("fields.documentNumber");
        }
        case "cnp":
          return t("fields.documentCnp");
        case "issuingCountryCode":
          return t("fields.documentIssuingCountryCode");
        case "issuedBy":
          return t("fields.documentIssuedBy");
        case "issuedOn":
          return t("fields.documentIssuedOn");
        case "hasExpiryDate":
          return t("fields.documentHasExpiryDate");
        case "expiresOn":
          return t("fields.documentExpiresOn");
        case "status":
          return t("fields.documentStatus");
        case "licenseCategories":
          return t("license.title");
        case "photos":
          return t("sections.documentPhotos");
        case "notes":
          return t("fields.notes");
      }
    }

    switch (field) {
      case "email":
        return t("fields.email");
      case "phone":
        return t("fields.phone");
      case "firstName":
        return t("fields.firstName");
      case "cnp":
        return t("fields.documentCnp");
      case "lastName":
        return t("fields.lastName");
      case "dateOfBirth":
        return t("fields.dateOfBirth");
      case "addressLine1":
        return t("fields.addressLine1");
      case "addressLine2":
        return t("fields.addressLine2");
      case "city":
        return t("fields.city");
      case "region":
        return form.countryCode === "RO"
          ? t("fields.county")
          : t("fields.region");
      case "postalCode":
        return t("fields.postalCode");
      case "countryCode":
        return t("fields.country");
      case "documents":
        return t("sections.document");
      case "notes":
        return t("fields.notes");
    }

    return t("createPage.formTitle");
  }

  return (
    <ExtractionReviewContext.Provider
      value={{
        state: extractionState,
        onApplySuggestion: (key, id) =>
          setExtractionState((current) =>
            applyExtractionSuggestion(current, key, id),
          ),
      }}
    >
      <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <form
          className="grid gap-6"
          noValidate
          onSubmit={(event) => void createPerson(event)}
        >
          <WizardProgress
            step={step}
            disabled={creating}
            onSelect={selectReviewStep}
          />
          {step === "citizenship" ? (
            <CitizenshipChoice onChange={changeCitizenship} />
          ) : null}
          {step === "nationalId" ? (
            <NationalIdFormatSelect
              value={chosenNationalIdFormat}
              disabled={creating}
              onChange={changeNationalIdFormat}
            />
          ) : null}
          {step === "documents" ? (
            <DocumentPhotosSection
              formId={formId}
              form={form}
              disabled={creating}
              onSetDocumentPhoto={setDocumentPhoto}
              fieldErrors={fieldErrors}
            />
          ) : null}
          {step === "documents" || isReviewStep(step) ? (
            <DocumentExtractionFeedback
              form={form}
              jobs={extraction.jobs}
              pending={extraction.pending}
              disabled={creating}
              onRetry={extraction.retry}
              onManual={extraction.continueManually}
            />
          ) : null}
          {isReviewStep(step) ? (
            <div className="grid gap-2">
              <h2
                ref={stepHeading}
                tabIndex={-1}
                className="text-xl font-semibold outline-none"
              >
                {t(`wizard.steps.${step}`)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("wizard.reviewHelp")}
              </p>
            </div>
          ) : null}
          {step === "personal" ? (
            <PersonalSection
              formId={formId}
              form={form}
              fieldErrors={fieldErrors}
              locale={locale}
              showUnder18Warning={showUnder18Warning}
              onSetFormValue={setFormValue}
            />
          ) : null}
          {step === "contact" ? (
            <ContactSection
              formId={formId}
              form={form}
              fieldErrors={fieldErrors}
              locale={locale}
              onSetFormValue={setFormValue}
              onChangePhone={changePhone}
            />
          ) : null}
          {step === "address" ? (
            <AddressSection
              formId={formId}
              form={form}
              fieldErrors={fieldErrors}
              locale={locale}
              onSetFormValue={setFormValue}
              onChangeCountry={changeCountry}
            />
          ) : null}
          {step === "review" ? (
            <>
              <DocumentsSection
                formId={formId}
                form={form}
                fieldErrors={fieldErrors}
                locale={locale}
                showUnder18Warning={showUnder18Warning}
                disabled={creating}
                onSetDocument={setDocument}
              />
              <NotesField
                formId={formId}
                value={form.notes}
                error={fieldErrors.notes}
                onChange={(value) => setFormValue("notes", value)}
              />
            </>
          ) : null}

          {feedback ? <CreateFormFeedback feedback={feedback} /> : null}

          <FormActions
            creating={creating}
            uploadingPhotos={uploadingPhotos}
            extracting={extraction.pending}
            personsHref={personsHref}
            step={step}
            onBack={goBack}
            onNext={nextStep}
          />
        </form>
      </div>
    </ExtractionReviewContext.Provider>
  );

  function selectReviewStep(next: PersonReviewStep) {
    setFeedback(null);
    setStep(next);
  }

  function goBack() {
    setFeedback(null);
    const index = isReviewStep(step) ? REVIEW_STEPS.indexOf(step) : -1;
    setStep(
      index > 0
        ? REVIEW_STEPS[index - 1]!
        : step === "personal"
          ? "documents"
          : step === "documents" && form.citizenship === "romanian"
            ? "nationalId"
            : "citizenship",
    );
  }

  function nextStep() {
    if (step === "documents") {
      reviewDetails();
      return;
    }
    if (!isReviewStep(step) || step === "review" || creating) return;
    // Validate only the visible group; later steps are validated on their turn.
    const fields =
      step === "personal"
        ? (["firstName", "lastName", "cnp", "dateOfBirth"] as const)
        : step === "contact"
          ? (["email", "phone"] as const)
          : ([
              "addressLine1",
              "addressLine2",
              "city",
              "region",
              "postalCode",
              "countryCode",
            ] as const);
    const candidate = createPersonInput(
      { ...form, documents: [] },
      (field, error) =>
        t(`feedback.date.${error}`, {
          field: fieldLabel(field === "dateOfBirth" ? field : null),
        }),
    );
    const errors: FormErrors = {};
    if (candidate.error && stepForField(candidate.error.field) === step) {
      errors[candidate.error.field] = candidate.error.message;
    }
    // A partial birth date must not prevent validation of contact/address.
    const values = candidate.input ?? { ...form };
    for (const field of fields) {
      if (field === "dateOfBirth" && candidate.error) continue;
      const result = v1.persons.createPersonInputSchema.shape[field].safeParse(
        values[field],
      );
      if (!result.success)
        errors[field] = formatValidationIssue(result.error.issues[0]!, field);
    }
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return { ...next, ...errors };
    });
    if (Object.keys(errors).length) {
      setFeedback({
        kind: "error",
        title: t("feedback.createErrorTitle"),
        messages: Object.values(errors) as string[],
      });
      return;
    }
    selectReviewStep(REVIEW_STEPS[REVIEW_STEPS.indexOf(step) + 1]!);
  }

  function reviewDetails() {
    if (uploadingPhotos) return;
    const nextErrors: FormErrors = {};
    for (const document of form.documents) {
      const failed = Object.values(document.photos).find(
        (photo) => photo?.status === "failed",
      );
      if (failed?.status === "failed") {
        nextErrors[documentFieldErrorKey(document.key, "photos")] =
          failed.message;
      } else if (
        document.required &&
        documentPhotoSlots(document).some(
          (slot) => document.photos[slot]?.status !== "uploaded",
        )
      ) {
        nextErrors[documentFieldErrorKey(document.key, "photos")] = t(
          "feedback.validation.requiredDocumentPhotos",
          { document: t(`documentTypes.${document.type}`) },
        );
      }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFeedback({
        kind: "error",
        title: t("wizard.documentsMissing"),
        messages: Object.values(nextErrors) as string[],
      });
      return;
    }
    setFeedback(null);
    setStep("personal");
  }

  function setFormValue<Key extends keyof CreatePersonFormState>(
    key: Key,
    value: CreatePersonFormState[Key],
  ) {
    setExtractionState((current) =>
      markExtractionFieldEdited(
        { ...current, form: { ...current.form, [key]: value } },
        `person.${key}` as ExtractionFieldKey,
      ),
    );
    clearFieldErrorForPersonKey(key);
  }

  function changePhone(value: string, details: PhoneNumberInputChangeDetails) {
    setForm((current) => ({
      ...current,
      phone: value,
      phoneCountry: details.country,
      phoneCountryCallingCode: details.countryCallingCode,
      phoneNationalNumber: details.nationalNumber,
    }));
    clearFieldError("phone");
  }

  function changeCountry(value: CountryCode) {
    setExtractionState((current) =>
      markExtractionFieldEdited(
        markExtractionFieldEdited(
          {
            ...current,
            form: { ...current.form, countryCode: value, region: "" },
          },
          "person.countryCode",
        ),
        "person.region",
      ),
    );
    clearFieldError("countryCode");
    clearFieldError("region");
  }

  function changeCitizenship(citizenship: PersonCitizenship) {
    changeWorkflow(citizenship, form.nationalIdFormat);
    setStep(citizenship === "romanian" ? "nationalId" : "documents");
    setFieldErrors({});
    setFeedback(null);
  }

  function changeNationalIdFormat(format: NationalIdFormat) {
    changeWorkflow("romanian", format);
    setChosenNationalIdFormat(format);
    setStep("documents");
    setFieldErrors({});
    setFeedback(null);
  }

  function changeWorkflow(
    citizenship: PersonCitizenship,
    format: NationalIdFormat,
  ) {
    if (form.citizenship === citizenship && form.nationalIdFormat === format)
      return;
    for (const document of form.documents)
      extraction.cancelDocument(document.key);
    setExtractionState((current) => {
      let next = current;
      for (const document of current.form.documents)
        next = invalidateDocumentExtraction(next, document.key);
      return {
        ...next,
        form: switchDocumentWorkflow(next.form, citizenship, format),
      };
    });
  }

  function setDocument(
    document: CreatePersonDocumentFormState,
    editedFields: readonly PersonDocumentFormFieldKey[] = [],
  ) {
    setExtractionState((current) => {
      const patch = Object.fromEntries(
        editedFields.map((key) => [key, document[key]]),
      );
      let next = {
        ...current,
        form: {
          ...current.form,
          documents: current.form.documents.map((item) =>
            item.key === document.key ? { ...item, ...patch } : item,
          ),
        },
      };
      for (const key of editedFields)
        next = markExtractionFieldEdited(
          next,
          `document.${document.key}.${key}`,
        );
      return next;
    });
    for (const key of editedFields)
      clearFieldError(documentFieldErrorKey(document.key, key));
  }

  function setDocumentPhoto(
    documentKey: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File | null,
  ) {
    clearFieldError(documentFieldErrorKey(documentKey, "photos"));
    extraction.cancelDocument(documentKey);
    setExtractionState((current) =>
      invalidateDocumentExtraction(current, documentKey),
    );
    if (file) {
      const uploadId = createDraftUploadId();
      setForm((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.key === documentKey
            ? {
                ...document,
                photos: {
                  ...document.photos,
                  [slot]: {
                    id: uploadId,
                    status: "uploading",
                    file,
                  },
                },
              }
            : document,
        ),
      }));
      setFeedback(null);
      void uploadDocumentPhotoDraft(documentKey, slot, file, uploadId);
      return;
    }

    setForm((current) => ({
      ...current,
      documents: current.documents.map((document) => {
        if (document.key !== documentKey) {
          return document;
        }
        const photos = { ...document.photos };
        delete photos[slot];
        return {
          ...document,
          photos,
        };
      }),
    }));
    setFeedback(null);
  }

  async function uploadDocumentPhotoDraft(
    documentKey: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
    uploadId: string,
  ): Promise<void> {
    let stage: DocumentPhotoUploadStage = "checksum";
    let storageResponse: StorageUploadResponseDiagnostics | null = null;
    const logContext = {
      documentKey,
      slot,
      uploadId,
      contentType: file.type || "unknown",
      byteSize: file.size,
      secureContext: window.isSecureContext,
      online: navigator.onLine,
    };

    console.debug("[person-document-photo] draft upload started", logContext);

    try {
      const checksumSha256 = await sha256Hex(file);
      stage = "signed-url";
      const upload = await webApi.fetch(
        v1.persons.ROUTES.documents.photos.createDraftUploadUrl,
        v1.persons.personDocumentPhotoUploadUrlSchema,
        {
          method: "POST",
          json: {
            ...(file.type === "application/pdf"
              ? { documentType: "proofOfAddress" }
              : {}),
            contentType: file.type,
            byteSize: file.size,
            checksumSha256,
          },
        },
      );

      console.debug("[person-document-photo] signed URL received", {
        ...logContext,
        method: upload.method,
        expiresAt: upload.expiresAt,
        maxBytes: upload.maxBytes,
        uploadHeaderNames: Object.keys(upload.headers).sort(),
      });

      stage = "storage-put";
      const uploadResponse = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });
      storageResponse = storageUploadResponseDiagnostics(uploadResponse);
      if (!uploadResponse.ok) {
        throw new Error(
          `Storage upload returned HTTP ${uploadResponse.status}${
            uploadResponse.statusText ? ` ${uploadResponse.statusText}` : ""
          }`,
        );
      }

      console.info("[person-document-photo] draft upload completed", {
        ...logContext,
        ...storageResponse,
      });

      setDocumentPhotoUploadState(documentKey, slot, uploadId, {
        id: uploadId,
        status: "uploaded",
        file,
        uploadToken: upload.uploadToken,
      });
    } catch (error) {
      console.error(
        "[person-document-photo] draft upload failed",
        {
          ...logContext,
          stage,
          ...(storageResponse ?? {}),
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          ...(error instanceof ApiError
            ? {
                apiStatus: error.status,
                apiCode: error.code,
                apiRequestId: error.requestId,
              }
            : {}),
        },
        error,
      );

      const message =
        error instanceof ApiError
          ? error.message
          : t("feedback.documentPhotoDraftUploadErrorMessage");
      setDocumentPhotoUploadState(documentKey, slot, uploadId, {
        id: uploadId,
        status: "failed",
        file,
        message,
      });
      setFeedback({
        kind: "error",
        title: t("feedback.documentPhotoUploadErrorTitle"),
        messages: [message],
      });
    }
  }

  function setDocumentPhotoUploadState(
    documentKey: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    uploadId: string,
    nextUpload: CreatePersonDocumentFormState["photos"][v1.persons.PersonDocumentPhotoSlot],
  ) {
    setForm((current) =>
      updateDocumentDrafts(current, (document) => {
        if (
          document.key !== documentKey ||
          document.photos[slot]?.id !== uploadId
        )
          return document;
        return {
          ...document,
          photos: { ...document.photos, [slot]: nextUpload },
        };
      }),
    );
  }

  function clearFieldError(field: FormErrorKey) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function clearFieldErrorForPersonKey(key: keyof CreatePersonFormState) {
    if (isPersonFormFieldKey(key)) {
      clearFieldError(key);
    }
  }
}

function personCreateConflict(error: unknown): {
  field: Extract<FormErrorKey, "email" | "phone" | "cnp">;
  message: string;
} | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const field = conflictField(error.details);
  if (field !== "email" && field !== "phone" && field !== "cnp") {
    return null;
  }

  return { field, message: error.message };
}

function conflictField(details: unknown): unknown {
  return details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    "field" in details
    ? details.field
    : null;
}

function hasDocumentPhotoStatus(
  form: CreatePersonFormState,
  status: "uploading" | "failed",
): boolean {
  return form.documents.some((document) =>
    v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS.some(
      (slot) => document.photos[slot]?.status === status,
    ),
  );
}

function firstDocumentPhotoWithStatus(
  form: CreatePersonFormState,
  status: "failed",
): Extract<
  CreatePersonDocumentFormState["photos"][v1.persons.PersonDocumentPhotoSlot],
  { status: "failed" }
> | null;
function firstDocumentPhotoWithStatus(
  form: CreatePersonFormState,
  status: "uploading",
): Extract<
  CreatePersonDocumentFormState["photos"][v1.persons.PersonDocumentPhotoSlot],
  { status: "uploading" }
> | null;
function firstDocumentPhotoWithStatus(
  form: CreatePersonFormState,
  status: "uploading" | "failed",
):
  | CreatePersonDocumentFormState["photos"][v1.persons.PersonDocumentPhotoSlot]
  | null {
  for (const document of form.documents) {
    for (const slot of v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS) {
      const upload = document.photos[slot];
      if (upload?.status === status) {
        return upload as Extract<typeof upload, { status: typeof status }>;
      }
    }
  }

  return null;
}

function createDraftUploadId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type DocumentPhotoUploadStage = "checksum" | "signed-url" | "storage-put";

interface StorageUploadResponseDiagnostics {
  storageStatus: number;
  storageStatusText: string;
  storageRequestId: string | null;
  storageExtendedRequestId: string | null;
}

function storageUploadResponseDiagnostics(
  response: Response,
): StorageUploadResponseDiagnostics {
  return {
    storageStatus: response.status,
    storageStatusText: response.statusText,
    storageRequestId: response.headers.get("x-amz-request-id"),
    storageExtendedRequestId: response.headers.get("x-amz-id-2"),
  };
}

function stepForField(field: FormErrorKey): PersonReviewStep {
  if (["firstName", "lastName", "cnp", "dateOfBirth"].includes(field))
    return "personal";
  if (["email", "phone"].includes(field)) return "contact";
  if (
    [
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "postalCode",
      "countryCode",
    ].includes(field)
  )
    return "address";
  return "review";
}
