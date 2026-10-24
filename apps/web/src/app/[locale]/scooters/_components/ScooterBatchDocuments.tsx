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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@repo/ui/components";
import { FileDropOverlay } from "@repo/ui/components/file-drop-overlay";
import { useFileDrop } from "@repo/ui/hooks/use-file-drop";
import { DocumentViewer } from "@repo/ui/components/document-viewer";
import { useObjectUrl } from "@repo/ui/hooks/use-object-url";
import { CheckIcon, FileTextIcon, SparklesIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext, useState, type ReactNode } from "react";
import {
  ScooterDocumentTypeEditor,
  type LogicalDocumentUpdate,
} from "./ScooterDocumentTypeEditor";
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
  onLogicalDocument,
  scooterVin,
}: {
  documents: ScooterDocumentsEditor;
  disabled: boolean;
  analyzing: boolean;
  onRetryAnalysis?: (sourceId: string) => void;
  onCancelAnalysis?: () => void;
  children?: ReactNode;
  importResult?: Extract<DocumentImportResult, { ok: true }>;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const user = useOptionalSession()?.user;
  const canWrite = canAccess(user, "scooter_documents.write");
  const canExtract = canAccess(user, "scooter_documents.extract");
  const creation = useTranslations("scooters.creation");
  const extraction = useTranslations("scooters.extraction");
  const workspace = useTranslations("scooters.workspace");
  const [version, setVersion] = useState<"original" | "client_copy">(
    "original",
  );
  const [originalId, setOriginalId] = useState<string>();
  const originals = documents.drafts.filter(
    (draft) => draft.version !== "client_copy",
  );
  const selectedOriginal = originals.find((draft) => draft.id === originalId);
  const [errors, setErrors] = useState<string[]>([]);
  const [expandedImport, setExpandedImport] = useState<typeof importResult>();
  const analysisEntries = useContext(ScooterDocumentAnalysisContext);
  const compact =
    documents.existing.length + documents.drafts.length > 0 &&
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
  const logicalDocumentsFor = (sourceId: string) => {
    const entry = analysisEntries[sourceId];
    return entry?.status === "success"
      ? entry.analysis.extractedData.documents
      : documents.existing.find((item) => item.id === sourceId)?.extractedData
          ?.documents;
  };
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
  const { dragging, handlers: fileDropHandlers } = useFileDrop({
    disabled,
    onFiles: (files) => {
      setExpandedImport(importResult);
      add(files);
    },
  });

  if (!canWrite) return null;

  function add(files: File[]) {
    if (disabled || (version === "client_copy" && !selectedOriginal)) return;
    const available =
      version === "client_copy"
        ? documents.drafts.some(
            (copy) => copy.originalId === selectedOriginal?.id,
          )
          ? 0
          : 1
        : v1.scooters.SCOOTER_DOCUMENT_MAX_FILES -
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
    if (accepted.length) {
      if (version === "original") documents.add(null, accepted);
      else
        documents.add(
          selectedOriginal?.type ?? null,
          accepted,
          undefined,
          version,
          selectedOriginal?.id,
        );
    }
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
                  <ScooterDocumentTypeEditor
                    sourceId={document.id}
                    fileName={document.name}
                    type={document.type}
                    documents={logicalDocumentsFor(document.id)}
                    disabled={disabled || analyzing}
                    scooterVin={scooterVin}
                    onType={
                      documents.drafts.some(
                        (draft) =>
                          draft.id === document.id &&
                          draft.version !== "client_copy",
                      )
                        ? (type) => documents.classify(document.id, type, true)
                        : undefined
                    }
                    onDocument={
                      analysisEntries[document.id]?.status === "success"
                        ? onLogicalDocument
                        : undefined
                    }
                  />
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
                className="relative w-full justify-center rounded-dashed-surface border-(length:--dashed-surface-border-width) border-dashed bg-transparent text-center duration-normal enabled:hover:border-primary enabled:active:border-primary enabled:active:border-solid"
                disabled={disabled}
                aria-label={creation("importMore")}
                onClick={() => setExpandedImport(importResult)}
                {...fileDropHandlers}
              >
                {creation("importMore")}
                {dragging ? (
                  <FileDropOverlay
                    compact
                    label={creation("importMore")}
                    className="rounded-lg"
                  />
                ) : null}
              </Button>
            </li>
          </ul>
        </CardContent>
      ) : null}
      <CardContent
        hidden={compact}
        className={compact ? "hidden" : "grid gap-4"}
      >
        <div className="grid gap-2">
          <Label>{workspace("version")}</Label>
          <Select
            value={version}
            disabled={disabled}
            onValueChange={(value) =>
              setVersion(value as "original" | "client_copy")
            }
          >
            <SelectTrigger aria-label={workspace("version")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original">{workspace("original")}</SelectItem>
              <SelectItem value="client_copy">
                {workspace("clientCopy")}
              </SelectItem>
            </SelectContent>
          </Select>
          {version === "client_copy" ? (
            <>
              <Select
                value={originalId ?? ""}
                disabled={disabled}
                onValueChange={(value) => setOriginalId(value ?? undefined)}
              >
                <SelectTrigger aria-label={workspace("originalForCopy")}>
                  <SelectValue placeholder={workspace("chooseOriginal")} />
                </SelectTrigger>
                <SelectContent>
                  {originals
                    .filter(
                      (original) =>
                        !documents.drafts.some(
                          (copy) => copy.originalId === original.id,
                        ),
                    )
                    .map((original) => (
                      <SelectItem key={original.id} value={original.id}>
                        {original.file.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {workspace("versionHint")}
              </p>
            </>
          ) : null}
        </div>
        <FileDropZone
          label={t("batch.drop")}
          browseLabel={t("batch.browse")}
          hint={t("batch.hint")}
          requirements={t("batch.requirements")}
          accept={v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.join(",")}
          disabled={
            disabled || (version === "client_copy" && !selectedOriginal)
          }
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
                  canExtract={canExtract}
                  onLogicalDocument={onLogicalDocument}
                  scooterVin={scooterVin}
                  onPreview={() => documents.preview(draft)}
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
  canExtract,
  onType,
  onRemove,
  onRetry,
  onPreview,
  onLogicalDocument,
  scooterVin,
}: {
  draft: DocumentDraft;
  disabled: boolean;
  canExtract: boolean;
  onType: (type: v1.scooters.ScooterDocumentType) => void;
  onRemove: () => void;
  onRetry: () => void;
  onPreview: () => Promise<File>;
  onLogicalDocument?: LogicalDocumentUpdate;
  scooterVin?: string;
}) {
  const t = useTranslations("scooters.documents");
  const extractionT = useTranslations("scooters.extraction");
  const state = useContext(ScooterDocumentAnalysisContext)[draft.id];
  const src = useObjectUrl(draft.fileUnavailable ? null : draft.file);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  async function openPreview() {
    setPreviewError(false);
    if (!draft.fileUnavailable) {
      setOpen(true);
      return;
    }
    setPreviewLoading(true);
    try {
      await onPreview();
      setOpen(true);
    } catch {
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }
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
            : draft.version === "client_copy"
              ? t("batch.uploaded")
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
        disabled={previewLoading}
        onClick={() => {
          void openPreview();
        }}
      >
        <FileTextIcon className="size-5" aria-hidden="true" />
      </Button>
      <div className="grid min-w-0 gap-1">
        <button
          type="button"
          className="truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
          title={draft.file.name}
          disabled={previewLoading}
          onClick={() => {
            void openPreview();
          }}
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
        {previewError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("pdfPreviewError")}
          </p>
        ) : null}
        {draft.fileUnavailable && draft.status === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            {t("interruptedUpload")}
          </p>
        ) : null}
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
            disabled={
              disabled ||
              Boolean(draft.fileUnavailable && draft.status === "failed")
            }
            onClick={onRetry}
          >
            {draft.status === "failed" ? t("retry") : extractionT("retry")}
          </Button>
        ) : null}
      </div>
      <div className="col-span-full row-start-2 min-w-0">
        {draft.version === "client_copy" ? (
          <Badge variant="outline">{t("clientCopy")}</Badge>
        ) : (
          <ScooterDocumentTypeEditor
            sourceId={draft.id}
            fileName={draft.file.name}
            type={draft.type}
            documents={
              state?.status === "success"
                ? state.analysis.extractedData.documents
                : undefined
            }
            disabled={disabled || busy}
            onType={onType}
            onDocument={onLogicalDocument}
            scooterVin={scooterVin}
          />
        )}
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
