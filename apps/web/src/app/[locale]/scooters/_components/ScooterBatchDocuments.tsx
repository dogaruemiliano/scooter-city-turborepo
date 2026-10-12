"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@repo/ui/components";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { CheckIcon, FileTextIcon, UploadIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext, useId, useRef, useState } from "react";
import { ScooterDocumentAnalysisContext } from "./ScooterDocumentAnalysisStatus";
import type {
  DocumentDraft,
  ScooterDocumentsEditor,
} from "./useScooterDocuments";

export function ScooterBatchDocuments({
  documents,
  disabled,
  analyzing,
  onRetryAnalysis,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  analyzing: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
}) {
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const canExtract = canAccess(user, "scooter_documents.extract");
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  if (!canWrite) return null;

  function add(files: File[]) {
    if (disabled) return;
    const available =
      v1.scooters.SCOOTER_DOCUMENT_MAX_FILES -
      documents.drafts.length -
      documents.existing.length;
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const error = !(
        v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES as readonly string[]
      ).includes(file.type)
        ? t("unsupportedFormat")
        : !file.size
          ? t("emptyFile")
          : file.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES
            ? t("tooLarge")
            : !v1.scooters.scooterDocumentDraftSchema.shape.fileName.safeParse(
                  file.name,
                ).success
              ? t("invalidName")
              : documents.drafts.some(
                    (draft) =>
                      draft.file.name === file.name &&
                      draft.file.size === file.size &&
                      draft.file.lastModified === file.lastModified,
                  ) ||
                  accepted.some(
                    (other) =>
                      other.name === file.name &&
                      other.size === file.size &&
                      other.lastModified === file.lastModified,
                  )
                ? t("batch.duplicate")
                : accepted.length >= available
                  ? t("tooMany")
                  : null;
      if (error) problems.push(`${file.name}: ${error}`);
      else accepted.push(file);
    }
    setErrors(problems);
    if (accepted.length) documents.add(null, accepted);
  }

  return (
    <section className="grid gap-4" aria-label={t("title")}>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t("batch.browse")}
        accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
        disabled={disabled}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        className={`flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${dragging ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent"}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <UploadIcon
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-lg font-semibold">{t("batch.drop")}</span>
        <span className="text-sm text-link underline underline-offset-4">
          {t("batch.browse")}
        </span>
        <span id={hintId} className="text-sm text-muted-foreground">
          {t("batch.hint")}
        </span>
      </button>
      {!canExtract ? (
        <p className="text-sm text-muted-foreground">
          {t("batch.manualTypes")}
        </p>
      ) : null}
      {errors.length ? (
        <ul role="alert" className="grid gap-1 text-sm text-destructive">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ) : null}
      {documents.drafts.length ? (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("documentCount", { count: documents.drafts.length })}
          </p>
          <ul className="divide-y divide-border">
            {documents.drafts.map((draft) => (
              <BatchDocumentRow
                key={draft.id}
                draft={draft}
                disabled={disabled}
                analyzing={analyzing}
                canExtract={canExtract}
                onType={(type) => documents.classify(draft.id, type, true)}
                onRemove={() => documents.removeDraft(draft.id)}
                onRetry={() =>
                  draft.status === "failed"
                    ? documents.retry(draft)
                    : onRetryAnalysis?.(draft.id)
                }
              />
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("batch.review")}</p>
        </>
      ) : null}
    </section>
  );
}

function BatchDocumentRow({
  draft,
  disabled,
  analyzing,
  canExtract,
  onType,
  onRemove,
  onRetry,
}: {
  draft: DocumentDraft;
  disabled: boolean;
  analyzing: boolean;
  canExtract: boolean;
  onType: (type: v1.scooters.ScooterDocumentType) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("scooters.documents");
  const extractionT = useTranslations("scooters.extraction");
  const state = useContext(ScooterDocumentAnalysisContext)[draft.id];
  const src = useObjectUrl(draft.file);
  const [open, setOpen] = useState(false);
  const busy = draft.status === "uploading" || state?.status === "processing";
  const failed = draft.status === "failed" || state?.status === "failed";
  const status =
    draft.status === "failed"
      ? t(draft.uploadError ?? "failed", {
          maxSize: (draft.uploadMaxBytes ?? 0) / (1024 * 1024),
        })
      : draft.status === "uploading"
        ? t("uploading")
        : state?.status === "failed"
          ? extractionT(`errors.${state.error}`)
          : state?.status === "processing"
            ? extractionT("analyzing")
            : state?.status === "success"
              ? t("batch.read")
              : canExtract
                ? extractionT("queued")
                : t("batch.manualTypes");
  const labels = {
    error: t("pdfPreviewError"),
    previousPage: t("previousPage"),
    nextPage: t("nextPage"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    resetZoom: t("resetZoom"),
  };
  return (
    <li className="flex items-start gap-3 py-4">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={t("preview", { name: draft.file.name })}
        onClick={() => setOpen(true)}
      >
        <FileTextIcon className="size-5" aria-hidden="true" />
      </Button>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:items-start">
        <div className="grid min-w-0 gap-1">
          <button
            type="button"
            className="truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
            onClick={() => setOpen(true)}
          >
            {draft.file.name}
          </button>
          <p
            role={failed ? "alert" : "status"}
            className={`flex items-start gap-1 text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {busy ? (
              <Spinner className="shrink-0" />
            ) : state?.status === "success" ? (
              <CheckIcon
                className="size-4 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : null}
            {status}
          </p>
          {failed &&
          draft.uploadError !== "sessionExpired" &&
          state?.status !== "processing" &&
          (draft.status === "failed" ||
            (state?.status === "failed" &&
              state.error !== "unknownType" &&
              state.error !== "disabled")) ? (
            <Button
              type="button"
              variant="text"
              className="justify-self-start"
              disabled={disabled || analyzing}
              onClick={onRetry}
            >
              {draft.status === "failed" ? t("retry") : extractionT("retry")}
            </Button>
          ) : null}
        </div>
        <Select
          value={draft.type ?? ""}
          disabled={disabled}
          onValueChange={(value) => {
            if (v1.scooters.scooterDocumentTypeSchema.safeParse(value).success)
              onType(value as v1.scooters.ScooterDocumentType);
          }}
        >
          <SelectTrigger
            className="w-full"
            aria-label={t("batch.typeLabel", { name: draft.file.name })}
          >
            <SelectValue placeholder={t("batch.unknown")} />
          </SelectTrigger>
          <SelectContent>
            {v1.scooters.SCOOTER_DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        disabled={disabled}
        aria-label={t("removeFile", { name: draft.file.name })}
        onClick={onRemove}
      >
        <XIcon className="size-4" aria-hidden="true" />
      </Button>
      <DocumentViewer
        open={open}
        onOpenChange={setOpen}
        src={src}
        contentType={draft.file.type}
        fileName={draft.file.name}
        title={draft.file.name}
        imageAlt={draft.file.name}
        closeLabel={t("closePreview")}
        openFileLabel={t("openFile")}
        actionsLabel={t("actions")}
        pdfLabels={labels}
        zoomLabels={labels}
      />
    </li>
  );
}
