"use client";
import { v1 } from "@repo/api-shared";
import { Button, FormSection } from "@repo/ui/components";
import {
  DocumentInput,
  type DocumentInputLabels,
} from "@repo/ui/components/document-input";
import { DocumentPreview } from "@repo/ui/components/document-preview";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { webApi } from "@/lib/api";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

function useDocumentLabels(
  type: v1.scooters.ScooterDocumentType,
  fileName?: string,
): DocumentInputLabels {
  const t = useTranslations("scooters.documents");
  return {
    label: t(type),
    add: t("add", { document: t(type) }),
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
  documents,
  disabled,
}: {
  type: v1.scooters.ScooterDocumentType;
  documents: ScooterDocumentsEditor;
  disabled: boolean;
}) {
  const t = useTranslations("scooters.documents");
  const labels = useDocumentLabels(type);
  const existing = documents.existing.filter((item) => item.type === type);
  const drafts = documents.drafts.filter((item) => item.type === type);
  function validate(file: File, replacement = false) {
    if (
      !(
        v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]
      ).includes(file.type) ||
      !file.size ||
      file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES
    )
      return t("invalidFile");
    if (
      !v1.scooters.scooterDocumentDraftSchema.shape.fileName.safeParse(
        file.name,
      ).success
    )
      return t("invalidName");
    if (
      !replacement &&
      documents.existing.length + documents.drafts.length >=
        v1.scooters.SCOOTER_DOCUMENT_MAX_FILES
    )
      return t("tooMany");
    return null;
  }
  const hasFiles = existing.length + drafts.length > 0;
  return (
    <FormSection title={t(type)}>
      <div className="grid gap-3 sm:col-span-2">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {existing.map((document) => (
            <ScooterFilePreview
              key={document.id}
              document={document}
              disabled={disabled}
              onRemove={() => documents.removeExisting(document.id)}
              validate={(file) => validate(file, true)}
              onReplace={(file) => {
                documents.removeExisting(document.id);
                documents.add(type, [file]);
              }}
            />
          ))}
          {drafts.map((draft) => (
            <ScooterFilePreview
              key={draft.id}
              draft={draft}
              disabled={disabled}
              onRetry={() => documents.retry(draft)}
              onRemove={() => documents.removeDraft(draft.id)}
              validate={(file) => validate(file, true)}
              onReplace={(file) => {
                documents.removeDraft(draft.id);
                documents.add(type, [file]);
              }}
            />
          ))}
          {!hasFiles ? (
            <DocumentInput
              labels={labels}
              accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
              disabled={disabled}
              validate={validate}
              onConfirm={(file) => documents.add(type, [file])}
            />
          ) : null}
        </div>
        {!hasFiles &&
          documents.removed
            .filter((item) => item.type === type)
            .map((item) => (
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
                  disabled={disabled}
                  onClick={() => documents.undoRemove(item.id)}
                >
                  {t("undo")}
                </Button>
              </div>
            ))}
        {!hasFiles && documents.removed.some((item) => item.type === type) ? (
          <p className="text-sm text-muted-foreground">{t("removalHint")}</p>
        ) : null}
      </div>
    </FormSection>
  );
}
function ScooterFilePreview({
  document,
  draft,
  disabled,
  onRetry,
  onRemove,
  onReplace,
  validate,
}: {
  document?: v1.scooters.ScooterDocument;
  draft?: DocumentDraft;
  disabled: boolean;
  onRetry?: () => void;
  onRemove?: () => void;
  onReplace?: (file: File) => void;
  validate?: (file: File) => string | null;
}) {
  const t = useTranslations("scooters.documents");
  const [open, setOpen] = useState(false);
  const fileName = document?.fileName ?? draft!.file.name;
  const type = document?.type ?? draft!.type;
  const labels = useDocumentLabels(type, fileName);
  const localUrl = useObjectUrl(draft?.file ?? null);
  const url = document ? webApi.url(document.contentUrl) : localUrl;
  const contentType = document?.contentType ?? draft!.file.type;
  const uploaded = Boolean(document) || draft?.status === "ready";
  const status = draft?.status === "uploading" ? t("uploading") : undefined;
  return (
    <div className="grid min-w-0 content-start gap-2">
      {onReplace && validate ? (
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
        />
      )}
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
      {v1.scooters.SCOOTER_DOCUMENT_TYPES.map((type) => (
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
