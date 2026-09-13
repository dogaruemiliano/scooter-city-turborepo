"use client";

import { v1 } from "@repo/api-shared";
import { tokens } from "@repo/theme";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  SaveButton,
} from "@repo/ui/components";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { LicenseCategoriesFields } from "../LicenseCategoriesFields";
import { DocumentExpiryField } from "../DocumentExpiryField";
import { DocumentPhotoDraftCard } from "../PersonCreateForm/DocumentPhotoDraftCard";
import type {
  PersonDocumentPhotoDraftUploads,
  SetPersonDocumentPhoto,
} from "../PersonCreateForm/types";
import { uploadDocumentDraft } from "../../_lib/upload-document-draft";
import {
  documentFormHasChanges,
  documentFormInput,
  documentFormState,
} from "./helpers";
import { SelectField } from "./SelectField";
import { TextareaField } from "./TextareaField";
import { TextInputField } from "./TextInputField";
import type { DocumentFormState } from "./types";

const SAVE_SUCCESS_DURATION_MS = tokens.motion.duration.slower;

type DocumentFormDialogProps = {
  title: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  triggerAriaLabel?: string;
  triggerLabelClassName?: string;
  triggerSize?: "sm" | "icon-sm";
  triggerVariant?: "default" | "outline";
  triggerDisabled?: boolean;
  document?: v1.persons.PersonDocument;
  initialType?: v1.persons.PersonDocumentType;
  allowedTypes?: readonly v1.persons.PersonDocumentType[];
  busy: boolean;
  deleteBusy?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  submitMode?: "create" | "update";
  onSubmit: (
    input:
      | v1.persons.CreatePersonDocumentInput
      | v1.persons.UpdatePersonDocumentInput,
  ) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
};

export function DocumentFormDialog({
  title,
  triggerLabel,
  triggerIcon,
  triggerAriaLabel,
  triggerLabelClassName,
  triggerSize = "sm",
  triggerVariant = "outline",
  triggerDisabled = false,
  document,
  initialType = "nationalId",
  allowedTypes = v1.persons.PERSON_DOCUMENT_TYPES,
  busy,
  deleteBusy = false,
  open,
  onOpenChange,
  submitMode = "create",
  onSubmit,
  onDelete,
}: DocumentFormDialogProps) {
  const t = useTranslations("persons");
  const [internalOpen, setInternalOpen] = useState(false);
  const [form, setForm] = useState(() =>
    documentFormState(document, initialType),
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [photos, setPhotos] = useState<PersonDocumentPhotoDraftUploads>({});
  const expirySwitchId = useId();
  const actualOpen = open ?? internalOpen;
  const setActualOpen = onOpenChange ?? setInternalOpen;
  const hasChanges = documentFormHasChanges(form, document);
  const isDriverLicense =
    form.type === v1.persons.PERSON_DRIVER_LICENSE_DOCUMENT_TYPE;
  const showTypeField = allowedTypes.length > 1;
  const needsLicencePhotos = isDriverLicense && submitMode === "create";
  const uploading = Object.values(photos).some(
    (photo) => photo?.status === "uploading",
  );

  const setDocumentPhoto: SetPersonDocumentPhoto = (
    _key,
    slot,
    file,
    originalFile,
  ) => {
    setError(null);
    if (!file) {
      setPhotos((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      return;
    }
    const id = crypto.randomUUID();
    setPhotos((current) => ({
      ...current,
      [slot]: { id, file, originalFile, status: "uploading" },
    }));
    void uploadDocumentDraft(file, "driverLicense").then(
      (uploadToken) =>
        setPhotos((current) =>
          current[slot]?.id === id
            ? {
                ...current,
                [slot]: {
                  id,
                  file,
                  originalFile,
                  uploadToken,
                  status: "uploaded",
                },
              }
            : current,
        ),
      () =>
        setPhotos((current) =>
          current[slot]?.id === id
            ? {
                ...current,
                [slot]: {
                  id,
                  file,
                  originalFile,
                  status: "failed",
                  message: t("feedback.documentPhotoUploadErrorTitle"),
                },
              }
            : current,
        ),
    );
  };

  function resetForm() {
    setForm(documentFormState(document, initialType));
    setError(null);
    setDeleteOpen(false);
    setSaveSucceeded(false);
    setPhotos({});
  }

  function changeOpen(nextOpen: boolean) {
    if (busy || deleteBusy || saveSucceeded) return;
    setActualOpen(nextOpen);
  }

  function changeDeleteOpen(nextOpen: boolean) {
    if (deleteBusy) return;
    setDeleteOpen(nextOpen);
  }

  async function deleteDocument() {
    if (onDelete && (await onDelete())) {
      setDeleteOpen(false);
      setActualOpen(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (
      needsLicencePhotos &&
      ["front", "back"].some(
        (slot) => photos[slot as "front" | "back"]?.status !== "uploaded",
      )
    ) {
      setError(
        t("feedback.validation.requiredDocumentPhotos", {
          document: t("documentTypes.driverLicense"),
        }),
      );
      return;
    }

    if (submitMode === "update" && !hasChanges) {
      return;
    }

    if (
      form.type !== "proofOfAddress" &&
      form.hasExpiryDate &&
      !form.expiresOn
    ) {
      setError(
        t("feedback.validation.required", {
          field: t("fields.documentExpiresOn"),
        }),
      );
      return;
    }

    const candidate = documentFormInput(form);
    if (submitMode === "create") {
      const input = v1.persons.createPersonDocumentInputSchema.safeParse({
        ...candidate,
        ...(needsLicencePhotos
          ? {
              photos: Object.fromEntries(
                Object.entries(photos).flatMap(([slot, photo]) =>
                  photo?.status === "uploaded"
                    ? [[slot, photo.uploadToken]]
                    : [],
                ),
              ),
            }
          : {}),
      });
      if (!input.success) {
        setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
        return;
      }

      if (await onSubmit(input.data)) {
        setSaveSucceeded(true);
        await new Promise((resolve) =>
          window.setTimeout(resolve, SAVE_SUCCESS_DURATION_MS),
        );
        setActualOpen(false);
      }
      return;
    }

    const input =
      v1.persons.updatePersonDocumentInputSchema.safeParse(candidate);
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? t("feedback.genericError"));
      return;
    }

    if (await onSubmit(input.data)) {
      setSaveSucceeded(true);
      await new Promise((resolve) =>
        window.setTimeout(resolve, SAVE_SUCCESS_DURATION_MS),
      );
      setActualOpen(false);
    }
  }

  function setValue<Key extends keyof DocumentFormState>(
    key: Key,
    value: DocumentFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <BottomSheet
      open={actualOpen}
      onOpenChange={changeOpen}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) resetForm();
      }}
    >
      {triggerLabel ? (
        <BottomSheetTrigger
          render={
            <Button
              type="button"
              variant={triggerVariant}
              size={triggerSize}
              aria-label={triggerAriaLabel}
              disabled={triggerDisabled}
            />
          }
        >
          {triggerIcon}
          <span className={triggerLabelClassName}>{triggerLabel}</span>
        </BottomSheetTrigger>
      ) : null}
      <BottomSheetContent className="lg:w-document-editor lg:max-w-document-editor">
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{title}</BottomSheetTitle>
          </BottomSheetHeader>
          <BottomSheetBody>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{t("feedback.updateErrorTitle")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {needsLicencePhotos ? (
                <fieldset className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <legend className="mb-3 text-sm font-medium">
                    {t("feedback.validation.requiredDocumentPhotos", {
                      document: t("documentTypes.driverLicense"),
                    })}
                  </legend>
                  {(["front", "back"] as const).map((slot) => (
                    <DocumentPhotoDraftCard
                      key={slot}
                      inputId={`${expirySwitchId}-${slot}`}
                      documentKey="driver-license"
                      slot={slot}
                      slotLabel={t(`documentPhotoSlots.${slot}`)}
                      acceptsPdf
                      upload={photos[slot]}
                      disabled={busy || deleteBusy}
                      onSetDocumentPhoto={setDocumentPhoto}
                    />
                  ))}
                </fieldset>
              ) : null}
              {showTypeField ? (
                <SelectField
                  label={t("fields.documentType")}
                  value={form.type}
                  values={allowedTypes}
                  labelForValue={(value) => t(`documentTypes.${value}`)}
                  onChange={(value) =>
                    setValue("type", value as v1.persons.PersonDocumentType)
                  }
                />
              ) : null}
              <SelectField
                label={t("fields.documentStatus")}
                value={form.status}
                values={v1.persons.PERSON_DOCUMENT_STATUSES}
                labelForValue={(value) => t(`documentStatuses.${value}`)}
                onChange={(value) =>
                  setValue("status", value as v1.persons.PersonDocumentStatus)
                }
              />
              {form.type !== "proofOfAddress" ? (
                <>
                  {!isDriverLicense ? (
                    <TextInputField
                      label={t("fields.documentSeries")}
                      value={form.series}
                      onChange={(value) => setValue("series", value)}
                    />
                  ) : null}
                  <TextInputField
                    label={
                      isDriverLicense
                        ? t("fields.nationalIdNumber")
                        : t("fields.documentNumber")
                    }
                    value={form.number}
                    onChange={(value) => setValue("number", value)}
                  />

                  <TextInputField
                    label={t("fields.documentIssuingCountryCode")}
                    value={form.issuingCountryCode}
                    onChange={(value) => setValue("issuingCountryCode", value)}
                  />
                  <DocumentExpiryField
                    switchId={expirySwitchId}
                    switchLabel={t("fields.documentHasExpiryDate")}
                    checked={form.hasExpiryDate}
                    switchDisabled={busy || deleteBusy}
                    onCheckedChange={(checked) => {
                      setError(null);
                      setValue("hasExpiryDate", checked);
                    }}
                  >
                    <TextInputField
                      label={t("fields.documentExpiresOn")}
                      date
                      required={form.hasExpiryDate}
                      disabled={busy || deleteBusy || !form.hasExpiryDate}
                      value={form.expiresOn}
                      onChange={(value) => setValue("expiresOn", value)}
                    />
                  </DocumentExpiryField>
                </>
              ) : null}
              {isDriverLicense ? (
                <LicenseCategoriesFields
                  value={form.licenseCategories}
                  onChange={(value) => setValue("licenseCategories", value)}
                  disabled={busy || deleteBusy}
                />
              ) : null}
              <TextareaField
                label={t("fields.notes")}
                value={form.notes}
                className="sm:col-span-2"
                onChange={(value) => setValue("notes", value)}
              />
            </div>
            {onDelete ? (
              <div className="mt-2 border-t border-border pt-4">
                <BottomSheet open={deleteOpen} onOpenChange={changeDeleteOpen}>
                  <BottomSheetTrigger
                    render={
                      <Button
                        type="button"
                        variant="text"
                        className="text-destructive hover:text-destructive active:text-destructive"
                        disabled={busy || deleteBusy}
                      />
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("actions.deleteDocument")}
                  </BottomSheetTrigger>
                  <BottomSheetContent className="lg:w-md">
                    <BottomSheetHeader>
                      <BottomSheetTitle>
                        {t("detail.dialogs.deleteDocumentTitle")}
                      </BottomSheetTitle>
                      <BottomSheetDescription>
                        {t("detail.dialogs.deleteDocumentDescription")}
                      </BottomSheetDescription>
                    </BottomSheetHeader>
                    <BottomSheetFooter className="sm:flex-row-reverse sm:justify-start">
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full sm:w-auto"
                        disabled={deleteBusy}
                        onClick={() => void deleteDocument()}
                      >
                        {deleteBusy
                          ? t("actions.deleting")
                          : t("actions.deleteDocument")}
                      </Button>
                      <BottomSheetClose
                        render={
                          <Button
                            type="button"
                            variant="text"
                            className="w-full sm:w-auto"
                            disabled={deleteBusy}
                          />
                        }
                      >
                        {t("actions.cancel")}
                      </BottomSheetClose>
                    </BottomSheetFooter>
                  </BottomSheetContent>
                </BottomSheet>
              </div>
            ) : null}
          </BottomSheetBody>
          <BottomSheetFooter className="sm:flex-row sm:items-center">
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row-reverse">
              <SaveButton
                type="submit"
                className="w-full sm:w-auto"
                disabled={busy || deleteBusy || uploading || !hasChanges}
                state={saveSucceeded ? "success" : busy ? "pending" : "idle"}
                idleLabel={t("actions.save")}
                pendingLabel={t("actions.saving")}
                successLabel={t("actions.saved")}
              />
              <BottomSheetClose
                render={
                  <Button
                    type="button"
                    variant="text"
                    className="w-full sm:w-auto"
                    disabled={busy || deleteBusy || saveSucceeded}
                  />
                }
              >
                {t("actions.cancel")}
              </BottomSheetClose>
            </div>
          </BottomSheetFooter>
        </form>
      </BottomSheetContent>
    </BottomSheet>
  );
}
