"use client";

import { BottomSheet, BottomSheetContent } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { DocumentDraftCard } from "./DocumentDraftCard";
import { DocumentDraftSheet } from "./DocumentDraftSheet";
import { FormSection } from "./FormSection";
import { isBlankDocumentDraft } from "./form-state";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  FormErrors,
  SetPersonDocument,
  SetPersonDocumentPhoto,
  SetPersonDocumentValue,
} from "./types";

export function DocumentsSection({
  formId,
  form,
  fieldErrors,
  locale,
  showUnder18Warning,
  disabled,
  onSetDocument,
  onSetDocumentValue,
  onSetDocumentPhoto,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  disabled: boolean;
  onSetDocument: SetPersonDocument;
  onSetDocumentValue: SetPersonDocumentValue;
  onSetDocumentPhoto: SetPersonDocumentPhoto;
}) {
  const t = useTranslations("persons");
  const [open, setOpen] = useState(false);
  const [activeDocumentKey, setActiveDocumentKey] = useState<string | null>(
    null,
  );
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const documentSnapshot = useRef<CreatePersonDocumentFormState | null>(null);
  const restoreSnapshotOnClose = useRef(true);
  const activeDocument = form.documents.find(
    (document) => document.key === activeDocumentKey,
  );

  function openDocument(document: CreatePersonDocumentFormState) {
    documentSnapshot.current = cloneDocument(document);
    restoreSnapshotOnClose.current = true;
    setSheetMode(isBlankDocumentDraft(document) ? "add" : "edit");
    setActiveDocumentKey(document.key);
    setOpen(true);
  }

  function saveDocument() {
    restoreSnapshotOnClose.current = false;
    setOpen(false);
  }

  function finishOpenChange(nextOpen: boolean) {
    if (nextOpen) return;

    if (restoreSnapshotOnClose.current && documentSnapshot.current) {
      onSetDocument(documentSnapshot.current);
    }

    documentSnapshot.current = null;
    restoreSnapshotOnClose.current = true;
    setActiveDocumentKey(null);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!disabled) setOpen(nextOpen);
      }}
      onOpenChangeComplete={finishOpenChange}
    >
      <FormSection title={t("sections.document")}>
        {form.documents.map((document) => {
          const documentId = `${formId}-document-${document.key}`;

          return (
            <DocumentDraftCard
              key={document.key}
              document={document}
              documentId={documentId}
              disabled={disabled}
              fieldErrors={fieldErrors}
              onOpen={() => openDocument(document)}
            />
          );
        })}
        {fieldErrors.documents ? (
          <p
            id={`${formId}-documents-error`}
            role="alert"
            className="text-sm text-destructive sm:col-span-2"
          >
            {fieldErrors.documents}
          </p>
        ) : null}
      </FormSection>

      <BottomSheetContent className="lg:w-xl">
        {activeDocument ? (
          <DocumentDraftSheet
            title={
              sheetMode === "add"
                ? t("detail.dialogs.addDocumentTitle")
                : t("detail.dialogs.editDocumentTitle")
            }
            document={activeDocument}
            documentId={`${formId}-document-${activeDocument.key}`}
            fieldErrors={fieldErrors}
            locale={locale}
            canChangeIdentityType={
              form.citizenship === "foreign" &&
              activeDocument.slot === "identity"
            }
            showUnder18Warning={showUnder18Warning}
            disabled={disabled}
            onSave={saveDocument}
            onSetDocumentValue={onSetDocumentValue}
            onSetDocumentPhoto={onSetDocumentPhoto}
          />
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}

function cloneDocument(
  document: CreatePersonDocumentFormState,
): CreatePersonDocumentFormState {
  return {
    ...document,
    issuedOn: { ...document.issuedOn },
    expiresOn: { ...document.expiresOn },
    photos: { ...document.photos },
  };
}
