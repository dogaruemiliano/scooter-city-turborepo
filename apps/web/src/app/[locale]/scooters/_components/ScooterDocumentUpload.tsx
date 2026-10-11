"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";

import { v1 } from "@repo/api-shared";
import { Button, FormSection } from "@repo/ui/components";
import {
  DocumentInput,
  type DocumentInputLabels,
  type DocumentInputItem,
} from "@repo/ui/components/document-input";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext, useState } from "react";
import { webApi } from "@/lib/api";
import {
  ScooterDocumentAnalysisContext,
  ScooterDocumentAnalysisStatus,
} from "./ScooterDocumentAnalysisStatus";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

function useDocumentLabels(
  type: v1.scooters.ScooterDocumentType,
  fileName?: string,
  compact = false,
): DocumentInputLabels {
  const t = useTranslations("scooters.documents");
  return {
    label: compact ? t(`compact.${type}`) : t(type),
    add: t("add", { document: t(type) }),
    addAction: t("addAction"),
    preview: t("preview", { name: fileName ?? t(type) }),
    title: fileName ?? t(type),
    imageAlt: fileName ?? t(type),
    close: t("closePreview"),
    change: t("change"),
    actions: t("actions"),
    remove: t("remove"),
    retry: t("retry"),
    save: t("savePreview"),
    openFile: t("openFile"),
    error: t("pdfPreviewError"),
    previousPage: t("previousPage"),
    nextPage: t("nextPage"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    resetZoom: t("resetZoom"),
  };
}
export function ScooterDocumentUpload({
  type,
  insurancePolicyId,
  title,
  documents,
  disabled,
  onAdd,
  compact = false,
}: {
  type: v1.scooters.ScooterDocumentType;
  insurancePolicyId?: string;
  title?: string;
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  onAdd?: (files: File[]) => void;
  compact?: boolean;
}) {
  const t = useTranslations("scooters.documents");
  const extractionT = useTranslations("scooters.extraction");
  const user = useOptionalSession()?.user;
  const canRead = canAccess(user, "scooter_documents.read");
  const canWrite = canAccess(user, "scooter_documents.write");
  const analysis = useContext(ScooterDocumentAnalysisContext);
  const matchesCategory = (item: {
    type: v1.scooters.ScooterDocumentType;
    insurancePolicyId?: string | null;
  }) =>
    item.type === type &&
    (item.insurancePolicyId ?? undefined) === insurancePolicyId;
  const existing = documents.existing.filter(matchesCategory);
  const drafts = documents.drafts.filter(matchesCategory);
  const removed = documents.removed.filter(matchesCategory);
  const values: DocumentInputItem[] = [
    ...existing.map((document) => ({
      id: document.id,
      src: webApi.url(document.contentUrl),
      fileName: document.fileName,
      contentType: document.contentType,
      uploaded: true,
      status:
        analysis[document.id]?.status === "processing"
          ? extractionT("processing")
          : undefined,
    })),
    ...drafts.map((draft) => ({
      id: draft.id,
      file: draft.file,
      fileName: draft.file.name,
      contentType: draft.file.type,
      uploaded: draft.status === "ready",
      status:
        draft.status === "uploading"
          ? t("uploading")
          : analysis[draft.id]?.status === "processing"
            ? extractionT("processing")
            : undefined,
      uploadError: draft.status === "failed" ? t("failed") : undefined,
      onRetry: () => documents.retry(draft),
    })),
  ];
  const labels = useDocumentLabels(
    type,
    values[0]?.fileName,
    compact && values.length > 0,
  );
  const maxFiles =
    values.length +
    Math.max(
      0,
      v1.scooters.SCOOTER_DOCUMENT_MAX_FILES -
        documents.existing.length -
        documents.drafts.length,
    );
  function validate(file: File) {
    if (
      !(
        v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]
      ).includes(file.type)
    )
      return t("unsupportedFormat");
    if (file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES)
      return t("tooLarge");
    if (!file.size) return t("emptyFile");
    if (
      !v1.scooters.scooterDocumentDraftSchema.shape.fileName.safeParse(
        file.name,
      ).success
    )
      return t("invalidName");
    return null;
  }
  if (!canRead) return null;
  if (!canWrite)
    return (
      <div className="grid gap-3">
        {existing.map((document) => (
          <ScooterFilePreview
            key={document.id}
            document={document}
            disabled={disabled}
          />
        ))}
        {drafts.map((draft) => (
          <ScooterFilePreview
            key={draft.id}
            draft={draft}
            disabled={disabled}
          />
        ))}
      </div>
    );
  function remove(id: string) {
    if (existing.some((document) => document.id === id))
      documents.removeExisting(id);
    else documents.removeDraft(id);
  }
  return (
    <div
      role="group"
      aria-label={title ?? t(type)}
      className="grid min-w-0 content-start gap-3"
    >
      <div
        className={
          compact
            ? `min-w-0 [&_[data-slot=document-input]>div>button:first-child]:min-h-36 ${values.length ? "" : "[&_[data-slot=badge]]:hidden"}`
            : "min-w-0"
        }
      >
        <DocumentInput
          multiple
          values={values}
          labels={{
            ...labels,
            addMore: t("addMore"),
            previousDocument: t("previousDocument"),
            nextDocument: t("nextDocument"),
            documentCount: (count) => t("documentCount", { count }),
            documentPosition: (index, total) =>
              t("documentPosition", { index, total }),
            tooManyFiles: () => t("tooMany"),
          }}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={disabled}
          maxFiles={maxFiles}
          validate={validate}
          onConfirm={
            onAdd ?? ((files) => documents.add(type, files, insurancePolicyId))
          }
          onRemove={remove}
          onReplace={(id, file) => {
            remove(id);
            documents.add(type, [file], insurancePolicyId);
          }}
        />
      </div>
      {values.map((item) => (
        <ScooterDocumentAnalysisStatus key={item.id} sourceId={item.id} />
      ))}
      {removed.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <span className="min-w-0 flex-1 break-all line-through">
            {item.fileName}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || maxFiles === values.length}
            onClick={() => documents.undoRemove(item.id)}
          >
            {t("undo")}
          </Button>
        </div>
      ))}
      {removed.length ? (
        <p className="text-sm text-muted-foreground">{t("removalHint")}</p>
      ) : null}
    </div>
  );
}

export function ScooterFilePreview({
  document,
  draft,
  disabled,
  onRetry,
  onRemove,
  onReplace,
  validate,
  compact = false,
}: {
  document?: v1.scooters.ScooterDocument;
  draft?: DocumentDraft;
  disabled: boolean;
  onRetry?: () => void;
  onRemove?: () => void;
  onReplace?: (file: File) => void;
  validate?: (file: File) => string | null;
  compact?: boolean;
}) {
  const t = useTranslations("scooters.documents");
  const [open, setOpen] = useState(false);
  const user = useOptionalSession()?.user;
  const canRead = canAccess(user, "scooter_documents.read");
  const canWrite = canAccess(user, "scooter_documents.write");
  const fileName = document?.fileName ?? draft!.file.name;
  const type = document?.type ?? draft!.type;
  const labels = useDocumentLabels(type, fileName, compact);
  const localUrl = useObjectUrl(draft?.file ?? null);
  const url = document ? webApi.url(document.contentUrl) : localUrl;
  const contentType = document?.contentType ?? draft!.file.type;
  const analysis = useContext(ScooterDocumentAnalysisContext)[
    document?.id ?? draft!.id
  ];
  const extractionT = useTranslations("scooters.extraction");
  const uploaded = Boolean(document) || draft?.status === "ready";
  const status =
    draft?.status === "uploading"
      ? t("uploading")
      : analysis?.status === "processing"
        ? extractionT("processing")
        : undefined;
  if (!canRead) return null;
  return (
    <div className="grid min-w-0 content-start gap-2">
      {canWrite && onReplace && validate ? (
        <DocumentInput
          value={{ src: url, fileName, contentType }}
          labels={labels}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={disabled}
          uploaded={uploaded}
          status={status}
          validate={validate}
          onConfirm={onReplace}
          onRemove={onRemove}
          uploadError={draft?.status === "failed" ? t("failed") : undefined}
          onRetry={onRetry}
        />
      ) : (
        <DocumentPreview
          src={url}
          fileName={fileName}
          contentType={contentType}
          label={labels.label}
          triggerLabel={labels.preview}
          imageAlt={labels.imageAlt}
          title={labels.title}
          closeLabel={labels.close}
          openFileLabel={labels.openFile}
          actionsLabel={labels.actions}
          pdfLabels={labels}
          zoomLabels={labels}
          open={open}
          onOpenChange={setOpen}
          uploaded={uploaded}
          status={status}
        />
      )}
      <ScooterDocumentAnalysisStatus sourceId={document?.id ?? draft!.id} />
    </div>
  );
}
export function DocumentLink({
  document,
}: {
  document: v1.scooters.ScooterDocument;
}) {
  return (
    <a
      href={webApi.url(document.contentUrl)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 flex-1 items-center gap-2 underline underline-offset-4"
    >
      <FileTextIcon aria-hidden="true" className="size-5 shrink-0" />
      <span className="break-all">{document.fileName}</span>
    </a>
  );
}

export function ScooterDocumentList({
  documents,
}: {
  documents: v1.scooters.ScooterDocument[];
}) {
  const t = useTranslations("scooters.documents");
  return (
    <div className="grid gap-6">
      {v1.scooters.SCOOTER_DOCUMENT_TYPES.filter(
        (type) => type !== "insurance",
      ).map((type) => (
        <FormSection key={type} title={t(type)}>
          <ul className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
            {documents
              .filter((item) => item.type === type)
              .map((document) => (
                <li key={document.id}>
                  <ScooterFilePreview document={document} disabled={false} />
                </li>
              ))}
          </ul>
          {!documents.some((item) => item.type === type) ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}
        </FormSection>
      ))}
    </div>
  );
}
