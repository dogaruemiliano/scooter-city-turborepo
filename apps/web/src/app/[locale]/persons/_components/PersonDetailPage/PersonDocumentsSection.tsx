"use client";

import { v1 } from "@repo/api-shared";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DocumentDetailCard } from "./DocumentDetailCard";
import type { DocumentPhotosByDocumentId } from "./types";

export function PersonDocumentsSection({
  documents,
  photosByDocumentId,
  locale,
  busyAction,
  onUpdateDocument,
  onReplaceDocument,
  onDeleteDocument,
  onUploadDocumentPhoto,
  onDeleteDocumentPhoto,
}: {
  documents: v1.persons.PersonDocument[];
  photosByDocumentId: DocumentPhotosByDocumentId;
  locale: string;
  busyAction: string | null;
  onUpdateDocument: (
    documentId: string,
    input: v1.persons.UpdatePersonDocumentInput,
  ) => Promise<boolean>;
  onReplaceDocument: (
    documentId: string,
    input: v1.persons.CreatePersonDocumentInput,
  ) => Promise<boolean>;
  onDeleteDocument: (documentId: string) => Promise<boolean>;
  onUploadDocumentPhoto: (
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
    file: File,
  ) => Promise<boolean>;
  onDeleteDocumentPhoto: (
    documentId: string,
    slot: v1.persons.PersonDocumentPhotoSlot,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("persons");

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
        <h2 className="text-base font-semibold">{t("sections.document")}</h2>
      </div>
      {documents.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {documents.map((document) => (
            <DocumentDetailCard
              key={document.id}
              document={document}
              photos={photosByDocumentId[document.id] ?? []}
              locale={locale}
              busyAction={busyAction}
              onUpdate={(input) => onUpdateDocument(document.id, input)}
              onReplace={(input) => onReplaceDocument(document.id, input)}
              onDelete={() => onDeleteDocument(document.id)}
              onUploadPhoto={(slot, file) =>
                onUploadDocumentPhoto(document.id, slot, file)
              }
              onDeletePhoto={(slot) => onDeleteDocumentPhoto(document.id, slot)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("detail.documents.empty")}
        </div>
      )}
    </section>
  );
}
