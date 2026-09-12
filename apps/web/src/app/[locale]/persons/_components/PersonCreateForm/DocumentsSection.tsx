"use client";

import { v1 } from "@repo/api-shared";

import {
  BottomSheet,
  BottomSheetContent,
  FormSection,
} from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ExtractionReviewContext,
  useExtractionReview,
} from "./ExtractionReviewContext";
import {
  applyExtractionSuggestion,
  markExtractionFieldEdited,
} from "./extraction-state";

import { DocumentDraftCard } from "./DocumentDraftCard";
import { DocumentDraftSheet } from "./DocumentDraftSheet";
import { isBlankDocumentDraft } from "./form-state";
import type {
  CreatePersonDocumentFormState,
  CreatePersonFormState,
  FormErrors,
  SetPersonDocument,
  PersonDocumentFormFieldKey,
} from "./types";

export function DocumentsSection({
  formId,
  form,
  fieldErrors,
  locale,
  showUnder18Warning,
  disabled,
  onSetDocument,
}: {
  formId: string;
  form: CreatePersonFormState;
  fieldErrors: FormErrors;
  locale: string;
  showUnder18Warning: boolean;
  disabled: boolean;
  onSetDocument: SetPersonDocument;
}) {
  const t = useTranslations("persons");
  const [open, setOpen] = useState(false);
  const [activeDocumentKey, setActiveDocumentKey] = useState<string | null>(
    null,
  );
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [patch, setPatch] = useState<Partial<CreatePersonDocumentFormState>>(
    {},
  );
  const extraction = useExtractionReview();
  const baseDocument = form.documents.find(
    (document) => document.key === activeDocumentKey,
  );
  const activeDocument = baseDocument
    ? { ...baseDocument, ...patch }
    : undefined;
  let localState = extraction?.state;
  if (localState && activeDocument) {
    localState = {
      ...localState,
      form: {
        ...form,
        documents: form.documents.map((document) =>
          document.key === activeDocument.key ? activeDocument : document,
        ),
      },
    };
    for (const key of Object.keys(patch) as PersonDocumentFormFieldKey[])
      localState = markExtractionFieldEdited(
        localState,
        `document.${activeDocument.key}.${key}`,
      );
  }

  function openDocument(document: CreatePersonDocumentFormState) {
    setPatch({});
    setSheetMode(isBlankDocumentDraft(document) ? "add" : "edit");
    setActiveDocumentKey(document.key);
    setOpen(true);
  }

  function saveDocument() {
    if (activeDocument)
      onSetDocument(
        activeDocument,
        Object.keys(patch) as PersonDocumentFormFieldKey[],
      );
    setOpen(false);
  }

  function finishOpenChange(nextOpen: boolean) {
    if (nextOpen) return;

    setPatch({});
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
          <ExtractionReviewContext.Provider
            value={
              extraction && localState
                ? {
                    ...extraction,
                    state: localState,
                    onApplySuggestion: (key, suggestionId) => {
                      if (!localState) return;
                      const next = applyExtractionSuggestion(
                        localState,
                        key,
                        suggestionId,
                      );
                      const updated = next.form.documents.find(
                        (document) => document.key === activeDocument.key,
                      )!;
                      const changes = Object.fromEntries(
                        (
                          Object.keys(
                            activeDocument,
                          ) as (keyof CreatePersonDocumentFormState)[]
                        )
                          .filter(
                            (field) =>
                              JSON.stringify(activeDocument[field]) !==
                              JSON.stringify(updated[field]),
                          )
                          .map((field) => [field, updated[field]]),
                      );
                      setPatch((current) => ({ ...current, ...changes }));
                    },
                  }
                : null
            }
          >
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
              showUnder18Warning={
                activeDocument.type === "nationalId"
                  ? v1.persons.isUnder18FromDateOfBirth(
                      v1.persons.getDateOfBirthFromCnp(activeDocument.cnp),
                    )
                  : showUnder18Warning
              }
              disabled={disabled}
              onSave={saveDocument}
              onSetDocumentValue={(_documentKey, key, value) =>
                setPatch((current) => ({ ...current, [key]: value }))
              }
            />
          </ExtractionReviewContext.Provider>
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}
