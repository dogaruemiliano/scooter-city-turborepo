"use client";

import { ApiError, v1 } from "@repo/api-shared";
import type {
  CountryCode,
  PhoneNumberInputChangeDetails,
} from "@repo/ui/components";
import { emptyDateParts } from "@repo/ui/lib/date-parts";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { webApi } from "@/lib/api";
import { AddressSection } from "./AddressSection";
import { CitizenshipToggle } from "./CitizenshipToggle";
import { ContactSection } from "./ContactSection";
import { CreateFormFeedback } from "./CreateFormFeedback";
import { DocumentsSection } from "./DocumentsSection";
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
  createInitialDocuments,
  isUnder18Person,
} from "./form-state";
import { createPersonInput } from "./input";
import { NotesField } from "./NotesField";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  Feedback,
  FormErrorKey,
  FormErrors,
  FormValidationIssue,
  PersonCitizenship,
  PersonCreateFormProps,
  PersonDocumentFormFieldKey,
} from "./types";

export function PersonCreateForm({ personsHref }: PersonCreateFormProps) {
  const t = useTranslations("persons");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreatePersonFormState>(() =>
    createEmptyCreateForm("romanian"),
  );
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const showUnder18Warning = isUnder18Person(form);
  const uploadingPhotos = hasDocumentPhotoStatus(form, "uploading");

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      await webApi.fetch(v1.persons.ROUTES.create, v1.persons.personSchema, {
        method: "POST",
        json: input.data,
      });

      setFeedback({
        kind: "success",
        title: t("feedback.createSuccessTitle"),
        messages: [t("feedback.createSuccessMessage")],
      });
      setForm(createEmptyCreateForm("romanian"));
      router.push(personsHref);
      router.refresh();
    } catch (error) {
      const personConflict = personCreateConflict(error);
      if (personConflict) {
        setFieldErrors({ [personConflict.field]: personConflict.message });
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

    if (isDocumentFieldErrorKey(field, "cnp")) {
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
        case "expiresOn":
          return t("fields.documentExpiresOn");
        case "status":
          return t("fields.documentStatus");
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
    <div className="mx-auto flex w-full max-w-screen-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("createPage.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("createPage.description")}
          </p>
        </div>
      </div>

      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void createPerson(event)}
      >
        <CitizenshipToggle
          citizenship={form.citizenship}
          onChange={changeCitizenship}
        />
        <ContactSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          showUnder18Warning={showUnder18Warning}
          onSetFormValue={setFormValue}
          onChangePhone={changePhone}
        />
        <AddressSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          onSetFormValue={setFormValue}
          onChangeCountry={changeCountry}
        />
        <DocumentsSection
          formId={formId}
          form={form}
          fieldErrors={fieldErrors}
          locale={locale}
          showUnder18Warning={showUnder18Warning}
          disabled={creating}
          onSetDocumentValue={setDocumentValue}
          onSetDocumentPhoto={setDocumentPhoto}
        />
        <NotesField
          formId={formId}
          value={form.notes}
          error={fieldErrors.notes}
          onChange={(value) => setFormValue("notes", value)}
        />

        {feedback ? <CreateFormFeedback feedback={feedback} /> : null}

        <FormActions
          creating={creating}
          uploadingPhotos={uploadingPhotos}
          personsHref={personsHref}
        />
      </form>
    </div>
  );

  function setFormValue<Key extends keyof CreatePersonFormState>(
    key: Key,
    value: CreatePersonFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
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
    setForm((current) => ({
      ...current,
      countryCode: value,
      region: "",
    }));
    clearFieldError("countryCode");
    clearFieldError("region");
  }

  function changeCitizenship(citizenship: PersonCitizenship) {
    setForm((current) =>
      current.citizenship === citizenship
        ? current
        : {
            ...current,
            citizenship,
            dateOfBirth:
              citizenship === "romanian"
                ? emptyDateParts()
                : current.dateOfBirth,
            documents: createInitialDocuments(citizenship),
          },
    );
    setFieldErrors({});
    setFeedback(null);
  }

  function setDocumentValue<Key extends PersonDocumentFormFieldKey>(
    documentKey: string,
    key: Key,
    value: CreatePersonDocumentFormState[Key],
  ) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.key === documentKey ? { ...document, [key]: value } : document,
      ),
    }));
    clearFieldError(documentFieldErrorKey(documentKey, key));
  }

  function setDocumentPhoto(
    documentKey: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File | null,
  ) {
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
  }

  async function uploadDocumentPhotoDraft(
    documentKey: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
    uploadId: string,
  ): Promise<void> {
    try {
      const checksumSha256 = await sha256Hex(file);
      const upload = await webApi.fetch(
        v1.persons.ROUTES.documents.photos.createDraftUploadUrl,
        v1.persons.personDocumentPhotoUploadUrlSchema,
        {
          method: "POST",
          json: {
            contentType: file.type,
            byteSize: file.size,
            checksumSha256,
          },
        },
      );

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(t("feedback.documentPhotoDraftUploadErrorMessage"));
      }

      setDocumentPhotoUploadState(documentKey, slot, uploadId, {
        id: uploadId,
        status: "uploaded",
        file,
        uploadToken: upload.uploadToken,
      });
    } catch (error) {
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
    setForm((current) => ({
      ...current,
      documents: current.documents.map((document) => {
        if (
          document.key !== documentKey ||
          document.photos[slot]?.id !== uploadId
        ) {
          return document;
        }

        return {
          ...document,
          photos: {
            ...document.photos,
            [slot]: nextUpload,
          },
        };
      }),
    }));
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

function personCreateConflict(
  error: unknown,
): { field: Extract<FormErrorKey, "email" | "phone">; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const field = conflictField(error.details);
  if (field !== "email" && field !== "phone") {
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
