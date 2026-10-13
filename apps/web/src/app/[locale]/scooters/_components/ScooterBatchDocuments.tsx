"use client";

import { useOptionalSession } from "@/components/auth/SessionProvider";
import { canAccess } from "@/lib/access";
import { v1 } from "@repo/api-shared";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  FileDropZone,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@repo/ui/components";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { CheckIcon, FileTextIcon, SparklesIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext, useState, type ReactNode } from "react";
import type { DocumentImportResult } from "./scooter-document-import";
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
  onCancelAnalysis,
  children,
  importResult,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  analyzing: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
  onCancelAnalysis?: () => void;
  children?: ReactNode;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
}) {
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const canExtract = canAccess(user, "scooter_documents.extract");
  const creation = useTranslations("scooters.creation");
  const extraction = useTranslations("scooters.extraction");
  const [errors, setErrors] = useState<string[]>([]);
  const [expandedImport, setExpandedImport] = useState<typeof importResult>();
  const analysisEntries = useContext(ScooterDocumentAnalysisContext);
  const compact =
    Boolean(importResult) &&
    expandedImport !== importResult &&
    !analyzing &&
    !errors.length &&
    !documents.drafts.some(
      (draft) =>
        draft.status === "failed" ||
        draft.status === "uploading" ||
        analysisEntries[draft.id]?.status === "failed",
    );
  const attachedDocuments = [
    ...documents.existing.map((document) => ({
      id: document.id,
      name: document.fileName,
      type: document.type,
      analyzed: Boolean(
        document.extractedData ||
        documents.extractions[document.id] ||
        analysisEntries[document.id]?.status === "success",
      ),
    })),
    ...documents.drafts.map((document) => ({
      id: document.id,
      name: document.file.name,
      type: document.type,
      analyzed: Boolean(
        documents.extractions[document.id] ||
        analysisEntries[document.id]?.status === "success",
      ),
    })),
  ];
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
    <Card as="section" aria-label={t("title")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 [&_svg]:shrink-0">
            <SparklesIcon aria-hidden="true" className="size-5" />
            {creation("automaticFill")}
          </CardTitle>
          {canExtract ? (
            <Badge variant="outline">{creation("aiPowered")}</Badge>
          ) : null}
        </div>
        <CardDescription>
          {creation(compact ? "importComplete" : "importAlternatives")}
        </CardDescription>
      </CardHeader>
      {compact ? (
        <CardContent>
          <ul aria-label={t("batch.attached")} className="grid min-w-0 gap-2">
            {attachedDocuments.map((document) => (
              <li
                key={document.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-control px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    title={document.name}
                  >
                    {document.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {document.type
                      ? t(`compact.${document.type}`)
                      : t("batch.unknown")}
                  </p>
                </div>
                <Badge variant={document.analyzed ? "success" : "secondary"}>
                  {t(
                    document.analyzed
                      ? "batch.uploadedAndAnalyzed"
                      : "batch.uploaded",
                  )}
                </Badge>
              </li>
            ))}
            <li className="min-w-0">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center border-dashed bg-transparent text-center"
                disabled={disabled}
                onClick={() => setExpandedImport(importResult)}
              >
                {creation("importMore")}
              </Button>
            </li>
          </ul>
        </CardContent>
      ) : null}
      <CardContent
        hidden={compact}
        className={compact ? "hidden" : "grid gap-4"}
      >
        <FileDropZone
          label={t("batch.drop")}
          browseLabel={t("batch.browse")}
          hint={t("batch.hint")}
          requirements={t("batch.requirements")}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={disabled}
          onFiles={add}
        />
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
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t("documentCount", { count: documents.drafts.length })}
              </p>
              {analyzing && onCancelAnalysis ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={onCancelAnalysis}
                >
                  {extraction("cancel")}
                </Button>
              ) : null}
            </div>
            <ul className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
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
        {children ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>{creation("or")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {children}
          </div>
        ) : null}
      </CardContent>
    </Card>
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
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-border bg-control p-3">
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
      <div className="grid min-w-0 gap-1">
        <button
          type="button"
          className="truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
          title={draft.file.name}
          onClick={() => setOpen(true)}
        >
          {draft.file.name}
        </button>
        <p
          role={failed ? "alert" : "status"}
          className={`flex min-w-0 items-start gap-1 text-sm wrap-anywhere ${failed ? "text-destructive" : "text-muted-foreground"}`}
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
      <div className="col-span-full row-start-2 min-w-0">
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
        className="col-start-3 row-start-1 shrink-0"
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
