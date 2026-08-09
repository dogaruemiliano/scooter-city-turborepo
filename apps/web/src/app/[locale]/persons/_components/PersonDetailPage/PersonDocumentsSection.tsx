"use client";

import { v1 } from "@repo/api-shared";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { inlineIconClassName } from "./constants";
import { DocumentDetailCard } from "./DocumentDetailCard";
import { EmptyDocumentDetailCard } from "./EmptyDocumentDetailCard";
import type { DocumentPhotosByDocumentId } from "./types";

export function PersonDocumentsSection({
  documents,
  photosByDocumentId,
  locale,
  busyAction,
  onCreateDocument,
  onUpdateDocument,
  onDeleteDocument,
  onUploadDocumentPhoto,
  onDeleteDocumentPhoto,
}: {
  documents: v1.persons.PersonDocument[];
  photosByDocumentId: DocumentPhotosByDocumentId;
  locale: string;
  busyAction: string | null;
  onCreateDocument: (
    input: v1.persons.CreatePersonDocumentInput,
  ) => Promise<boolean>;
  onUpdateDocument: (
    documentId: string,
    input: v1.persons.UpdatePersonDocumentInput,
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
  const identityDocument = documents.find((document) =>
    v1.persons.isPersonIdentityDocumentType(document.type),
  );
  const driverLicenseDocument = documents.find(
    (document) =>
      document.type === v1.persons.PERSON_DRIVER_LICENSE_DOCUMENT_TYPE,
  );

  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-2">
        <FileTextIcon aria-hidden="true" className={inlineIconClassName} />
        <h2 className="text-base font-semibold">{t("sections.document")}</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {identityDocument ? (
          <DocumentDetailCard
            document={identityDocument}
            photos={photosByDocumentId[identityDocument.id] ?? []}
            locale={locale}
            busyAction={busyAction}
            onUpdate={(input) => onUpdateDocument(identityDocument.id, input)}
            onDelete={() => onDeleteDocument(identityDocument.id)}
            onUploadPhoto={(slot, file) =>
              onUploadDocumentPhoto(identityDocument.id, slot, file)
            }
            onDeletePhoto={(slot) =>
              onDeleteDocumentPhoto(identityDocument.id, slot)
            }
          />
        ) : (
          <EmptyDocumentDetailCard
            slot="identity"
            busy={busyAction !== null}
            onCreate={onCreateDocument}
          />
        )}
        {driverLicenseDocument ? (
          <DocumentDetailCard
            document={driverLicenseDocument}
            photos={photosByDocumentId[driverLicenseDocument.id] ?? []}
            locale={locale}
            busyAction={busyAction}
            onUpdate={(input) =>
              onUpdateDocument(driverLicenseDocument.id, input)
            }
            onDelete={() => onDeleteDocument(driverLicenseDocument.id)}
            onUploadPhoto={(slot, file) =>
              onUploadDocumentPhoto(driverLicenseDocument.id, slot, file)
            }
            onDeletePhoto={(slot) =>
              onDeleteDocumentPhoto(driverLicenseDocument.id, slot)
            }
          />
        ) : (
          <EmptyDocumentDetailCard
            slot="driverLicense"
            busy={busyAction !== null}
            onCreate={onCreateDocument}
          />
        )}
      </div>
    </section>
  );
}
