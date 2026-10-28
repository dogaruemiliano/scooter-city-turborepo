"use client";

import { v1 } from "@repo/api-shared";
import {
  MediaCollection,
  type MediaCollectionItem,
} from "@repo/ui/components/media-collection";
import { useMediaViewerLabels } from "@/components/useMediaViewerLabels";
import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { webApi } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useContext, type ReactNode } from "react";
import { DocumentStatus } from "@repo/ui/components/document-status";
import {
  ScooterDocumentTypeEditor,
  type LogicalDocumentUpdate,
} from "./ScooterDocumentTypeEditor";
import { ScooterClientCopyBadge } from "./ScooterClientCopyBadge";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type { ScooterDocumentsEditor } from "./useScooterDocuments";

/** One scooter's documents. Its photo gallery owns a separate collection. */
export function ScooterDocumentMediaList({
  documents,
  editor,
  disabled,
  children,
  onLogicalDocument,
  scooterVin,
}: {
  documents: v1.scooters.ScooterDocument[];
  editor?: ScooterDocumentsEditor;
  disabled?: boolean;
  children: ReactNode;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const labels = useMediaViewerLabels();
  const entries = useContext(ScooterDocumentAnalysisContext);
  const extraction = useTranslations("scooters.extraction");
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canRead = canAccess(user, "scooter_documents.read");
  const canEdit = !disabled && canAccess(user, "scooter_documents.write");
  function validate(file: File) {
    return !(
      v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]
    ).includes(file.type)
      ? t("unsupportedFormat")
      : !file.size
        ? t("emptyFile")
        : file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES
          ? t("tooLarge")
          : null;
  }
  const orderedDocuments = [
    ...new Map(
      v1.scooters
        .scooterDocumentDisplayEntries(documents)
        .map((entry) => [entry.document.id, entry.document]),
    ).values(),
  ];
  const items: MediaCollectionItem[] = canRead
    ? orderedDocuments.flatMap((document) => [
        {
          id: document.id,
          src: webApi.url(document.contentUrl),
          fileName: document.fileName,
          contentType: document.contentType,
          validate,
          overlay: (
            <ScooterDocumentTypeEditor
              surface="media"
              sourceId={document.id}
              fileName={document.fileName}
              type={document.type}
              documents={document.extractedData?.documents}
              disabled={
                !canEdit || entries[document.id]?.status === "processing"
              }
              onDocument={onLogicalDocument}
              scooterVin={scooterVin}
            />
          ),
          // Replacing an original with a paired client copy needs a dedicated recovery flow.
          ...(editor && canEdit && !document.clientCopy
            ? {
                onReplace: (file: File) => {
                  editor.removeExisting(document.id);
                  editor.add(
                    document.type,
                    [file],
                    document.insurancePolicyId ?? undefined,
                  );
                },
              }
            : {}),
          ...(editor && canEdit && entries[document.id]?.status !== "processing"
            ? { onRemove: () => editor.removeExisting(document.id) }
            : {}),
        },
        ...(document.clientCopy
          ? [
              {
                id: `${document.id}-copy`,
                ...document.clientCopy,
                src: webApi.url(document.clientCopy.contentUrl),
              },
            ]
          : []),
      ])
    : [];
  if (canRead && editor)
    for (const draft of editor.drafts) {
      const state = entries[draft.id];
      const busy =
        draft.status === "uploading" || state?.status === "processing";
      items.push({
        id: draft.id,
        fileName: draft.file.name,
        contentType: draft.file.type,
        file: draft.fileUnavailable ? undefined : draft.file,
        load: () => editor.preview(draft),
        validate,
        overlay: (
          <>
            {draft.version === "client_copy" ? (
              <ScooterClientCopyBadge
                draft={draft}
                documents={editor}
                disabled={!canEdit || busy}
              />
            ) : (
              <ScooterDocumentTypeEditor
                surface="media"
                sourceId={draft.id}
                fileName={draft.file.name}
                type={draft.type}
                documents={
                  state?.status === "success"
                    ? state.analysis.extractedData.documents
                    : undefined
                }
                disabled={!canEdit || busy}
                onType={(type) => editor.classify(draft.id, type, true)}
                onDocument={onLogicalDocument}
                scooterVin={scooterVin}
              />
            )}
            <DocumentStatus
              state={
                draft.status === "failed" || state?.status === "failed"
                  ? "failed"
                  : draft.status === "uploading"
                    ? "uploading"
                    : state?.status === "processing"
                      ? "analyzing"
                      : state?.status === "success"
                        ? "analyzed"
                        : "uploaded"
              }
              label={
                draft.status === "failed"
                  ? t(draft.uploadError ?? "failed", {
                      maxSize: (draft.uploadMaxBytes ?? 0) / (1024 * 1024),
                    })
                  : state?.status === "failed"
                    ? extraction(`errors.${state.error}`)
                    : draft.status === "uploading"
                      ? t("uploading")
                      : state?.status === "processing"
                        ? extraction("analyzing")
                        : state?.status === "success"
                          ? t("batch.read")
                          : t("batch.uploaded")
              }
            />
          </>
        ),
        ...(canEdit && !busy
          ? { onRemove: () => editor.removeDraft(draft.id) }
          : {}),
        ...(canEdit &&
        !busy &&
        draft.version !== "client_copy" &&
        !editor.drafts.some((copy) => copy.originalId === draft.id)
          ? {
              onReplace: (file: File) => {
                editor.removeDraft(draft.id);
                editor.add(draft.type, [file], draft.insurancePolicyId);
              },
            }
          : {}),
      });
    }
  const displayOrder = v1.scooters.scooterDocumentDisplayEntries([
    ...documents,
    ...(editor?.drafts.map((draft) => ({
      ...draft,
      extractedData: editor.extractions[draft.id],
    })) ?? []),
  ]);
  const positions = new Map(
    displayOrder.map((entry, index) => [
      entry.clientCopy &&
      !("version" in entry.document && entry.document.version === "client_copy")
        ? `${entry.document.id}-copy`
        : entry.document.id,
      index,
    ]),
  );
  items.sort(
    (a, b) =>
      (positions.get(a.id) ?? items.length) -
      (positions.get(b.id) ?? items.length),
  );
  return (
    <MediaCollection
      {...labels}
      title={t("title")}
      imageAlt={t("title")}
      items={items}
    >
      {children}
    </MediaCollection>
  );
}
